// Authenticated server-to-server endpoint. Never call this from the public site.
import { createClient } from "npm:@supabase/supabase-js@2";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// Gmail is opt-in; the existing Resend setup remains the default transport.
const validEmail = (email: string) =>
  /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
const base64 = (text: string) =>
  btoa(
    Array.from(new TextEncoder().encode(text), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  );
Deno.serve(async (request) => {
  const secret = Deno.env.get("NOTIFICATION_SECRET");
  if (!secret || request.headers.get("x-notification-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  if (request.method !== "POST")
    return new Response("Use POST", { status: 405 });
  const provider = Deno.env.get("EMAIL_PROVIDER") || "resend";
  if (!["resend", "gmail"].includes(provider))
    return new Response("Unsupported EMAIL_PROVIDER", { status: 503 });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const gmailEmail = Deno.env.get("GMAIL_FROM_EMAIL") || "";
  const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID");
  const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");
  const from =
    provider === "gmail"
      ? `Sehar Crafts <${gmailEmail}>`
      : Deno.env.get("FROM_EMAIL");
  if (
    provider === "gmail" &&
    (!validEmail(gmailEmail) ||
      !gmailClientId ||
      !gmailClientSecret ||
      !gmailRefreshToken)
  )
    return new Response("Missing Gmail server configuration", { status: 503 });
  if (provider === "resend" && (!apiKey || !from))
    return new Response("Missing server email configuration", { status: 503 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: settings, error: settingsError } = await db
    .from("owner_settings")
    .select("notification_email")
    .eq("id", 1)
    .single();
  const owner = settings?.notification_email;
  if (settingsError || !owner || !validEmail(owner))
    return new Response("Owner must save a notification email in the studio", {
      status: 503,
    });
  const { data: events, error } = await db
    .from("notification_events")
    .select("*,orders(*)")
    .is("sent_at", null)
    .lt("attempts", 10)
    .order("created_at")
    .limit(30);
  if (error) return new Response("Queue unavailable", { status: 500 });
  // Resend's test sender only permits the account's own recipient address.
  // Keep customer deliveries off in test mode, without failing every owner alert.
  const ownerOnly =
    (provider === "resend" && /@resend\.dev(?:>|$)/i.test(from!.trim())) ||
    Deno.env.get("NOTIFICATION_MODE") === "owner_only";
  let gmailAccessToken = "";
  if (provider === "gmail" && events?.length) {
    try {
      const authorization = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: gmailClientId!,
          client_secret: gmailClientSecret!,
          refresh_token: gmailRefreshToken!,
          grant_type: "refresh_token",
        }),
      });
      if (!authorization.ok)
        return new Response(
          "Gmail authorization failed. Renew the owner Gmail authorization.",
          { status: 503 },
        );
      const token = await authorization.json();
      if (!token.access_token)
        return new Response("Gmail did not return an access token.", {
          status: 503,
        });
      gmailAccessToken = token.access_token;
    } catch {
      return new Response(
        "Gmail authorization is unavailable. Try again later.",
        { status: 503 },
      );
    }
  }
  let sent = 0,
    failed = 0;
  for (const event of events ?? []) {
    const order = event.orders;
    const titles: Record<string, string> = {
      placed: "Order request received",
      confirmed: "Order confirmed",
      dispatched: "Order dispatched",
      delivered: "Order delivered",
      cancelled: "Order cancelled",
      payment_received: "Payment received",
      payment_refunded: "Payment refunded",
      payment_pending: "Payment pending",
    };
    const kind = titles[event.kind] || String(event.kind).replaceAll("_", " ");
    const paymentUrl = new URL(
      Deno.env.get("STORE_URL") ||
        "https://innovativedeciphering.github.io/SeharCrafts/",
    );
    paymentUrl.hash = "/track/" + order.payment_token;
    const subject = `Sehar Crafts · ${order.order_number} · ${kind}`;
    const html = `<h2>${escapeHtml(subject)}</h2><p>Hello ${escapeHtml(order.customer.name)},</p><p>Order status: ${escapeHtml(order.status)}. Payment status: ${escapeHtml(order.payment_status)}.</p><ul>${order.items.map((i: { name: string; quantity: number; unit_price: number }) => `<li>${escapeHtml(i.name)} × ${i.quantity} — PKR ${i.unit_price}</li>`).join("")}</ul><p>Product subtotal: PKR ${order.total}. Delivery is confirmed separately.</p><p>Preferred payment: ${escapeHtml(order.payment_method)}.</p><p><a href="${escapeHtml(paymentUrl.href)}">Track your order, manage cancellation and view payment options</a>. Keep this link private. Wait for owner confirmation of delivery charges and the final amount before transferring.</p><p>Reply to this email for help. Keep your order number for reference. Never share passwords or payment PINs.</p>`;
    try {
      // Separate requests keep the owner's email private. Stable provider idempotency keys protect retries.
      const recipients = ownerOnly
        ? [["owner", owner]]
        : [
            ["owner", owner],
            ["customer", order.customer.email],
          ];
      for (const [role, to] of recipients) {
        if (!validEmail(to))
          throw new Error("Invalid notification recipient address");
        if (provider === "gmail") {
          const mime = [
            `From: ${from}`,
            `To: ${to}`,
            `Reply-To: ${owner}`,
            `Subject: =?UTF-8?B?${base64(subject)}?=`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=UTF-8",
            "Content-Transfer-Encoding: base64",
            "",
            base64(html)
              .match(/.{1,76}/g)!
              .join("\r\n"),
          ].join("\r\n");
          const raw = base64(mime)
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, "");
          const response = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${gmailAccessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ raw }),
            },
          );
          if (!response.ok)
            throw new Error(`Gmail API HTTP ${response.status}`);
        } else {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `${event.id}-${role}`,
            },
            body: JSON.stringify({
              from,
              to: [to],
              reply_to: owner,
              subject,
              html,
            }),
          });
          if (!response.ok)
            throw new Error(`Email provider HTTP ${response.status}`);
        }
      }
      const { error: updateError } = await db
        .from("notification_events")
        .update({
          sent_at: new Date().toISOString(),
          attempts: event.attempts + 1,
          last_error: null,
        })
        .eq("id", event.id);
      if (updateError) throw new Error("Queue acknowledgement failed");
      sent++;
    } catch (err) {
      failed++;
      await db
        .from("notification_events")
        .update({
          attempts: event.attempts + 1,
          last_error: err instanceof Error ? err.message : "Delivery failed",
        })
        .eq("id", event.id);
    }
  }
  return Response.json(
    {
      sent,
      failed,
      provider,
      notification_mode: ownerOnly ? "owner_only" : "owner_and_customer",
    },
    { status: failed ? 502 : 200 },
  );
});
