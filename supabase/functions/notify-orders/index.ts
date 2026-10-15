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
Deno.serve(async (request) => {
  const secret = Deno.env.get("NOTIFICATION_SECRET");
  if (!secret || request.headers.get("x-notification-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  if (request.method !== "POST")
    return new Response("Use POST", { status: 405 });
  const apiKey = Deno.env.get("RESEND_API_KEY"),
    from = Deno.env.get("FROM_EMAIL");
  if (!apiKey || !from)
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
  if (settingsError || !owner)
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
  let sent = 0,
    failed = 0;
  for (const event of events ?? []) {
    const order = event.orders;
    const kind = String(event.kind).replaceAll("_", " ");
    const paymentUrl = new URL(
      Deno.env.get("STORE_URL") ||
        "https://innovativedeciphering.github.io/SeharCrafts/",
    );
    paymentUrl.hash = "/pay/" + order.payment_token;
    const subject = `Sehar Crafts · ${order.order_number} · ${kind}`;
    const html = `<h2>${escapeHtml(subject)}</h2><p>Hello ${escapeHtml(order.customer.name)},</p><p>Order status: ${escapeHtml(order.status)}. Payment status: ${escapeHtml(order.payment_status)}.</p><ul>${order.items.map((i: { name: string; quantity: number; unit_price: number }) => `<li>${escapeHtml(i.name)} × ${i.quantity} — PKR ${i.unit_price}</li>`).join("")}</ul><p>Product subtotal: PKR ${order.total}. Delivery is confirmed separately.</p><p>Preferred payment: ${escapeHtml(order.payment_method)}.</p><p><a href="${escapeHtml(paymentUrl.href)}">Open your order payment options and QR code</a>. Keep this link private. Wait for owner confirmation of delivery charges and the final amount before transferring.</p><p>Reply to this email for help. Keep your order number for reference. Never share passwords or payment PINs.</p>`;
    try {
      // Separate requests keep the owner's email private. Stable provider idempotency keys protect retries.
      for (const [role, to] of [
        ["owner", owner],
        ["customer", order.customer.email],
      ]) {
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
  return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
});
