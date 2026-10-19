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
async function invoke(from, mode) {
  const emails = [],
    updates = [];
  const env = {
    NOTIFICATION_SECRET: "local-test-only",
    RESEND_API_KEY: "local-test-key",
    FROM_EMAIL: from,
    NOTIFICATION_MODE: mode,
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
  };
  const event = {
    id: "event-1",
    attempts: 0,
    kind: "placed",
    orders: {
      order_number: "SC-TEST",
      customer: { name: "Test customer", email: "customer@example.com" },
      items: [],
      total: 100,
      status: "placed",
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
    Response,
    createClient: () => db,
    Deno: {
      env: { get: (key) => env[key] },
      serve: (callback) => (handler = callback),
    },
    fetch: async (url, options) => {
      emails.push({
        url,
        body: JSON.parse(options.body),
        idempotency: options.headers["Idempotency-Key"],
      });
      return new Response("{}", { status: 200 });
    },
  });
  const response = await handler(
    new Request("https://example.invalid/notify", {
      method: "POST",
      headers: { "x-notification-secret": "local-test-only" },
    }),
  );
  return { result: await response.json(), emails, updates };
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
