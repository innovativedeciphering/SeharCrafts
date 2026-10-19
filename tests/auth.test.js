import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordError, authRedirect } from "../src/auth.js";
test("new passwords reject blanks, short input and mismatched confirmation", () => {
  assert.ok(passwordError("1234567", "1234567"));
  assert.ok(passwordError("        ", "        "));
  assert.ok(passwordError("new-password", "different"));
  assert.equal(passwordError("a strong passphrase", "a strong passphrase"), "");
});
test("recovery redirect preserves the GitHub Pages base and does not place tokens in the URL", () => {
  assert.equal(
    authRedirect("/SeharCrafts/", "https://example.github.io", true),
    "https://example.github.io/SeharCrafts/?auth=recovery",
  );
  assert.equal(
    authRedirect("/SeharCrafts/", "https://example.github.io"),
    "https://example.github.io/SeharCrafts/",
  );
});

test("verified recovery marker survives refresh but cannot authorize an ordinary or changed session", async () => {
  const { createRecoveryStore, RECOVERY_KEY } = await import("../src/auth.js");
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let time = 1000;
  const session = {
    user: { id: "owner" },
    access_token: "test-recovery-token",
    expires_at: 3600,
  };
  const first = createRecoveryStore(storage, () => time);
  assert.equal(await first.matches(session), false);
  await first.remember(session);
  assert.ok(!values.get(RECOVERY_KEY).includes(session.access_token));
  const refreshed = createRecoveryStore(storage, () => time);
  assert.equal(await refreshed.matches(session), true);
  assert.equal(
    await refreshed.matches({
      ...session,
      access_token: "different-session-token",
    }),
    false,
  );
  await first.remember(session);
  time += 15 * 60 * 1000 + 1;
  assert.equal(
    await createRecoveryStore(storage, () => time).matches(session),
    false,
  );
  time = 1000;
  await first.remember(session);
  assert.equal(
    await createRecoveryStore(storage, () => time).matches({
      ...session,
      user: { id: "other-owner" },
    }),
    false,
  );
  await first.remember(session);
  first.clear();
  assert.equal(values.has(RECOVERY_KEY), false);
});
test("recovery remains usable on the current page when browser storage is unavailable", async () => {
  const { createRecoveryStore } = await import("../src/auth.js");
  const store = createRecoveryStore({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  });
  const session = { user: { id: "owner" }, access_token: "local-test-token" };
  await store.remember(session);
  assert.equal(await store.matches(session), true);
  store.clear();
  assert.equal(await store.matches(session), false);
});
