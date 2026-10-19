import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";
const source = (
  await readFile(
    new URL("../supabase/functions/notify-orders/index.ts", import.meta.url),
    "utf8",
  )
).replace(/^import .*supabase-js.*;\n/m, "");
const compiled = (
  await transformWithEsbuild(source, "notify-orders.ts", {
    loader: "ts",
    format: "cjs",
  })
).code;
async function invoke(from, mode, configuration = {}) {
  const emails = [],
    updates = [];
  const env = {
    EMAIL_PROVIDER: configuration.provider,
    GMAIL_FROM_EMAIL: "owner@gmail.com",
    GMAIL_CLIENT_ID: "local-client-id",
    GMAIL_CLIENT_SECRET: "local-client-secret",
    GMAIL_REFRESH_TOKEN: "local-refresh-token",
    NOTIFICATION_SECRET: "local-test-only",
    RESEND_API_KEY:
      configuration.provider === "gmail" ? undefined : "local-test-key",
    FROM_EMAIL: from,
    NOTIFICATION_MODE: mode,
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
  };
  const event = {
    id: "event-1",
    attempts: 0,
    kind: configuration.kind || "placed",
    orders: {
      order_number: "SC-TEST",
      customer: { name: "Test customer", email: "customer@example.com" },
      items: [],
      total: 100,
      status: configuration.kind === "confirmed" ? "confirmed" : "placed",
      payment_status: "pending",
      payment_method: "bank",
      payment_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  };
  const db = {
    from(table) {
      if (table === "owner_settings")
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async single() {
            return {
              data: { notification_email: "owner@gmail.com" },
              error: null,
            };
          },
        };
      return {
        select() {
          return this;
        },
        is() {
          return this;
        },
        lt() {
          return this;
        },
        order() {
          return this;
        },
        async limit() {
          return { data: [event], error: null };
        },
        update(values) {
          updates.push(values);
          return {
            async eq() {
              return { error: null };
            },
          };
        },
      };
    },
  };
  let handler;
  vm.runInNewContext(compiled, {
    URL,
    URLSearchParams,
    TextEncoder,
    btoa,
    Response,
    createClient: () => db,
    Deno: {
      env: { get: (key) => env[key] },
      serve: (callback) => (handler = callback),
    },
    fetch: async (url, options) => {
      if (url === "https://oauth2.googleapis.com/token")
        return new Response(
          JSON.stringify({ access_token: "local-access-token" }),
          { status: configuration.tokenStatus || 200 },
        );
      emails.push({
        url,
        body: JSON.parse(options.body),
        idempotency: options.headers["Idempotency-Key"],
      });
      return new Response("{}", { status: configuration.sendStatus || 200 });
    },
  });
  const response = await handler(
    new Request("https://example.invalid/notify", {
      method: "POST",
      headers: { "x-notification-secret": "local-test-only" },
    }),
  );
  return {
    status: response.status,
    result: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : { message: await response.text() },
    emails,
    updates,
  };
}
test("Resend test sender sends owner alert without attempting an unrestricted customer address", async () => {
  const { result, emails, updates } = await invoke(
    "Sehar Crafts <onboarding@resend.dev>",
  );
  assert.equal(result.notification_mode, "owner_only");
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(
    emails.map((x) => x.body.to),
    [["owner@gmail.com"]],
  );
  assert.equal(emails[0].idempotency, "event-1-owner");
  assert.ok(updates[0].sent_at);
});
test("verified sender retains owner and customer notifications unless owner-only is selected", async () => {
  const both = await invoke("Sehar Crafts <orders@example.com>");
  assert.equal(both.emails.length, 2);
  assert.deepEqual(both.emails[1].body.to, ["customer@example.com"]);
  const owner = await invoke("Sehar Crafts <orders@example.com>", "owner_only");
  assert.equal(owner.emails.length, 1);
  assert.deepEqual(owner.emails[0].body.to, ["owner@gmail.com"]);
});

test("Gmail sends separate owner and customer confirmations with OAuth and UTF-8 MIME", async () => {
  const { result, emails, updates } = await invoke(undefined, undefined, {
    provider: "gmail",
  });
  assert.equal(result.provider, "gmail");
  assert.equal(result.notification_mode, "owner_and_customer");
  assert.equal(result.sent, 1);
  assert.equal(emails.length, 2);
  const messages = emails.map((email) => {
    assert.equal(
      email.url,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    return Buffer.from(email.body.raw, "base64url").toString("utf8");
  });
  assert.match(messages[0], /To: owner@gmail.com/);
  assert.match(messages[1], /To: customer@example.com/);
  assert.match(messages[1], /From: Sehar Crafts <owner@gmail.com>/);
  const subject = messages[1].match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
  assert.match(
    Buffer.from(subject, "base64").toString("utf8"),
    /Order request received/,
  );
  const html = Buffer.from(
    messages[1].split("\r\n\r\n")[1].replaceAll("\r\n", ""),
    "base64",
  ).toString("utf8");
  assert.match(html, /#\/track\/aaaaaaaa/);
  assert.ok(updates[0].sent_at);
});
test("Gmail authorization and send failures cannot acknowledge undelivered events", async () => {
  const denied = await invoke(undefined, undefined, {
    provider: "gmail",
    tokenStatus: 400,
  });
  assert.equal(denied.status, 503);
  assert.equal(denied.emails.length, 0);
  assert.equal(denied.updates.length, 0);
  const failed = await invoke(undefined, undefined, {
    provider: "gmail",
    sendStatus: 403,
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.result.failed, 1);
  assert.equal(failed.updates[0].sent_at, undefined);
  assert.match(failed.updates[0].last_error, /Gmail API HTTP 403/);
});

test("owner confirmation sends a distinct Order confirmed notification to the customer", async () => {
  const { emails } = await invoke(undefined, undefined, {
    provider: "gmail",
    kind: "confirmed",
  });
  const mime = Buffer.from(emails[1].body.raw, "base64url").toString("utf8");
  const subject = mime.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
  assert.match(
    Buffer.from(subject, "base64").toString("utf8"),
    /Order confirmed/,
  );
  assert.match(mime, /To: customer@example.com/);
});
