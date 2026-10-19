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
