import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { paymentMethods, paymentPageUrl } from "../src/payments.js";
test("only fully configured payment methods are offered", () => {
  assert.deepEqual(
    paymentMethods({ bank_name: "Bank", bank_account_title: "Owner" }),
    [],
  );
  assert.deepEqual(
    paymentMethods({
      bank_name: "Bank",
      bank_account_title: "Owner",
      bank_iban: "PK-EXAMPLE",
      jazzcash_name: "Owner",
      jazzcash_number: "03000000000",
      easypaisa_name: "Owner",
      cod_enabled: true,
      payment_url: "javascript:alert(1)",
    }),
    ["bank", "jazzcash", "cod"],
  );
  assert.deepEqual(
    paymentMethods({ payment_url: "https://provider.example/pay" }),
    ["online"],
  );
});
test("each QR decodes to the exact private order link, preserving the Pages base", async () => {
  const token = "55555555-5555-4555-8555-555555555555";
  const url = paymentPageUrl(
    token,
    "https://example.github.io/SeharCrafts/?old=1#/owner",
  );
  assert.equal(url, "https://example.github.io/SeharCrafts/#/pay/" + token);
  const bytes = await QRCode.toBuffer(url, { width: 320 });
  const png = PNG.sync.read(bytes);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, url);
  assert.throws(() => paymentPageUrl("<script>", "https://example.com"));
});
