// Start a separate Vite instance with the non-secret test URL/key documented in README.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const token = "55555555-5555-4555-8555-555555555555";
    const order = {
      order_number: "SC-TEST-000001",
      payment_token: token,
      total: 160,
      currency: "PKR",
      status: "placed",
      payment_status: "pending",
      payment_method: "jazzcash",
    };
    const settings = {
      id: 1,
      currency: "PKR",
      payment_details: "Use your order reference",
      delivery_note: "Shipping confirmed separately",
      jazzcash_name: "Sample Owner",
      jazzcash_number: "03000000000",
      bank_name: "Sample Bank",
      bank_account_title: "Sample Owner",
      bank_iban: "PK-SAMPLE",
      cod_enabled: true,
    };
    let placed;
    await page.route("https://sehar-test.supabase.co/**", async (route) => {
      const url = new URL(route.request().url());
      let data;
      if (url.pathname.endsWith("/rpc/place_order")) {
        placed = route.request().postDataJSON();
        data = order;
      } else if (url.pathname.endsWith("/rpc/order_payment")) {
        data = route.request().postDataJSON().token === token ? order : null;
      } else if (url.pathname.endsWith("/rpc/delivered_count")) data = 0;
      else if (url.pathname.endsWith("/products"))
        data = [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Test vase",
            category: "Decor",
            description: "A handmade vase",
            price: 100,
            sale_price: 80,
            images: ["https://example.com/vase.png"],
            active: true,
          },
        ];
      else if (url.pathname.endsWith("/store_settings")) data = settings;
      else if (url.pathname.endsWith("/testimonials")) data = [];
      else throw new Error("Unexpected test request " + url.pathname);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(process.env.PAYMENT_TEST_URL || "http://127.0.0.1:5175");
    await page.getByRole("button", { name: "Test vase", exact: true }).click();
    await page.locator("#quantity").fill("2");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.locator("#cart").click();
    await page.getByLabel("Your name", { exact: true }).fill("Test Customer");
    await page
      .getByLabel("Email", { exact: true })
      .fill("customer@example.com");
    await page.getByLabel("Phone", { exact: true }).fill("12345678");
    await page
      .getByLabel("Delivery address", { exact: true })
      .fill("Test delivery address");
    await page.locator("select[name=payment_method]").selectOption("jazzcash");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Place order request", exact: true })
      .click();
    await page.locator("#download-qr").waitFor();
    assert.equal(placed.customer.payment_method, "jazzcash");
    assert.equal(placed.items[0].quantity, 2);
    assert.match(await page.locator("dialog").innerText(), /Sample Owner/);
    assert.match(
      await page.locator("#download-qr").getAttribute("href"),
      /^data:image\/png;base64,/,
    );
    assert.equal(await page.locator(".payment-options article").count(), 3);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.goto(
      (process.env.PAYMENT_TEST_URL || "http://127.0.0.1:5175") +
        "/#/pay/" +
        token,
    );
    await page.locator("#download-qr").waitFor();
    assert.match(
      await page.locator("#payment-view").innerText(),
      /SC-TEST-000001/,
    );
    assert.doesNotMatch(
      await page.locator("#payment-view").innerText(),
      /customer@example.com|Test delivery address/,
    );
    order.payment_status = "received";
    await page.reload();
    await page
      .getByText("No further payment is requested for this order.", {
        exact: false,
      })
      .waitFor();
    assert.equal(await page.locator(".payment-options article").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mocked checkout records chosen wallet, creates downloadable QR, private-token page displays methods without customer details, received payments suppress further payment requests.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
