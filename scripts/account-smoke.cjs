// Mocked Auth API test; run against a Vite instance with the dummy Supabase test settings.
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
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const user = {
      id: ownerId,
      email: "old-owner@example.com",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: {},
    };
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const jwt =
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        sub: ownerId,
        aud: "authenticated",
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }) +
      ".test-signature";
    let products = [{ id: "22222222-2222-4222-8222-222222222222", name: "Test vase", category: "Decor", description: "Test", price: 100, images: ["https://example.com/vase.png"], active: true }];
    products[0].article = "SC-VASE-001";
    const order = { id: "33333333-3333-4333-8333-333333333333", order_number: "SC-TEST-000001", customer: { name: "Ayesha", email: "customer@example.com", phone: "12345678", address: "Test delivery address" }, items: [{ name: "Test vase", quantity: 1, unit_price: 100 }], total: 100, status: "placed", payment_status: "pending", payment_method: "cod", payment_token: "55555555-5555-4555-8555-555555555555" };
    const orderWrites = [];
    let rejectOrderSave = false;
    const productMutations = [];
    let rejectDeletion = false;
    let updates = [],
      allowed = true;
    await page.route("https://sehar-test.supabase.co/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      let data;
      if (url.pathname.endsWith("/auth/v1/token")) {
        const values = request.postDataJSON();
        if (values.password !== "test-password") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error_code: "invalid_credentials",
              msg: "Invalid login credentials",
            }),
          });
          return;
        }
        data = {
          access_token: jwt,
          refresh_token: "local-test-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        };
      } else if (url.pathname.endsWith("/auth/v1/user")) {
        if (request.method() === "PUT") {
          updates.push({
            body: request.postDataJSON(),
            redirect: url.searchParams.get("redirect_to"),
          });
          data = { ...user, new_email: request.postDataJSON().email };
        } else data = user;
      } else if (url.pathname.endsWith("/rpc/is_owner")) data = allowed;
      else if (url.pathname.endsWith("/owner_settings"))
        data = { id: 1, notification_email: "old-owner@example.com" };
      else if (url.pathname.endsWith("/store_settings"))
        data = {
          id: 1,
          currency: "PKR",
          payment_details: "Test payment policy",
          delivery_note: "Test delivery policy",
        };
      else if (url.pathname.endsWith("/rpc/delivered_count")) data = 0;
      else if (url.pathname.endsWith("/products")) {
        if (["PATCH", "DELETE"].includes(request.method())) {
          assert.equal(url.searchParams.get("id"), "eq.22222222-2222-4222-8222-222222222222");
          assert.equal(request.headers().authorization, "Bearer " + jwt);
          if (rejectDeletion && request.method() === "DELETE") {
            await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Permission denied" }) });
            return;
          }
          productMutations.push(request.method());
          data = { id: products[0].id };
          if (request.method() === "PATCH") Object.assign(products[0], request.postDataJSON());
          else products = [];
        } else data = url.searchParams.has("active") ? products.filter((p) => p.active) : products;
      }
      else if (url.pathname.endsWith("/orders")) {
        if (request.method() === "PATCH") {
          assert.equal(url.searchParams.get("id"), "eq." + order.id);
          assert.equal(url.searchParams.get("status"), "eq." + order.status);
          assert.equal(url.searchParams.get("payment_status"), "eq." + order.payment_status);
          if (rejectOrderSave) {
            await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Order permission denied" }) });
            return;
          }
          orderWrites.push(request.postDataJSON());
          Object.assign(order, request.postDataJSON());
          data = { id: order.id, status: order.status, payment_status: order.payment_status };
        } else data = [order];
      }
      else if (
        ["/testimonials"].some((path) =>
          url.pathname.endsWith(path),
        )
      )
        data = [];
      else throw new Error("Unexpected mocked request " + url.pathname);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const base = process.env.ACCOUNT_TEST_URL || "http://127.0.0.1:5178";
    await page.goto(base + "/#/owner");
    await page.locator("#login [name=email]").fill(user.email);
    await page.locator("#login [name=password]").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.locator(".order-row").waitFor();
    assert.equal(await page.locator(".order-row").getAttribute("open"), null);
    await page.locator(".order-row summary").hover();
    assert.equal(await page.locator(".order-row").evaluate((row) => row.open), true);
    await page.locator(".order-row summary").click();
    const orderForm = page.locator(".order-update");
    await orderForm.getByLabel("Order status", { exact: true }).selectOption("confirmed");
    await orderForm.getByLabel("Payment status", { exact: true }).selectOption("received");
    assert.equal(orderWrites.length, 0);
    await page.getByLabel("Search orders", { exact: true }).fill("missing-order");
    assert.equal(await page.locator(".order-row:visible").count(), 0);
    await page.getByText("No orders match your search.", { exact: true }).waitFor();
    await page.getByLabel("Search orders", { exact: true }).fill("ayesha");
    assert.equal(await orderForm.getByLabel("Order status", { exact: true }).inputValue(), "confirmed");
    await orderForm.getByRole("button", { name: "Discard changes", exact: true }).click();
    assert.equal(orderWrites.length, 0);
    assert.equal(await orderForm.getByRole("button", { name: "Save changes", exact: true }).isDisabled(), true);
    await orderForm.getByLabel("Order status", { exact: true }).selectOption("confirmed");
    await orderForm.getByLabel("Payment status", { exact: true }).selectOption("received");
    rejectOrderSave = true;
    await orderForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Could not save changes. Order permission denied", { exact: true }).waitFor();
    assert.equal(orderWrites.length, 0);
    assert.equal(order.status, "placed");
    rejectOrderSave = false;
    await orderForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Saved. Order notifications have been queued.", { exact: true }).waitFor();
    assert.deepEqual(orderWrites, [{ status: "confirmed", payment_status: "received" }]);
    assert.equal(await orderForm.getByRole("button", { name: "Save changes", exact: true }).isDisabled(), true);
    await page.locator("#order-filter").selectOption("placed");
    assert.equal(await page.locator(".order-row:visible").count(), 0);
    await page.locator("#order-filter").selectOption("confirmed");
    await page.locator("#payment-filter").selectOption("received");
    assert.equal(await page.locator(".order-row:visible").count(), 1);
    await page.getByLabel("Search orders", { exact: true }).fill("sc-test-000001");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/sehar-owner-orders-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "/tmp/sehar-owner-orders-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.getByLabel("Search products", { exact: true }).fill("unlisted");
    assert.equal(await page.locator("[data-edit]:visible").count(), 0);
    await page.getByLabel("Search products", { exact: true }).fill("sc-vase-001");
    assert.equal(await page.locator("[data-edit]:visible").count(), 1);
    await page.getByLabel("Search products", { exact: true }).fill("vase");
    assert.equal(await page.locator("[data-edit]:visible").count(), 1);
    assert.equal(await page.locator(".product-management").isVisible(), false);
    await page.locator("[data-edit]").first().click();
    assert.equal(await page.getByLabel("Article code (optional)", { exact: true }).inputValue(), "SC-VASE-001");
    await page.getByLabel("Article code (optional)", { exact: true }).fill("SC-VASE-002");
    await page.getByRole("button", { name: "Save product", exact: true }).click();
    await page.getByText("Product saved.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.getByText("Article: SC-VASE-002", { exact: true }).waitFor();
    assert.equal(products[0].article, "SC-VASE-002");
    productMutations.length = 0;
    await page.locator("[data-edit]").first().click();
    await page.getByRole("button", { name: "Deactivate product", exact: true }).click();
    await page.locator(".owner-product-status").getByText("Hidden", { exact: true }).waitFor();
    assert.equal(products[0].active, false);
    await page.locator("[data-edit]").first().click();
    await page.getByRole("button", { name: "Reactivate product", exact: true }).click();
    await page.getByText("Product reactivated and visible in the store.", { exact: true }).waitFor();
    assert.equal(products[0].active, true);
    await page.locator("[data-edit]").first().click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete product", exact: true }).click();
    assert.equal(productMutations.length, 2);
    rejectDeletion = true;
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete product", exact: true }).click();
    await page.getByText("Could not update the product. Permission denied", { exact: true }).waitFor();
    assert.equal(products.length, 1);
    assert.equal(await page.getByRole("button", { name: "Delete product", exact: true }).isEnabled(), true);
    rejectDeletion = false;
    page.once("dialog", (dialog) => { assert.match(dialog.message(), /Test vase/); return dialog.accept(); });
    await page.getByRole("button", { name: "Delete product", exact: true }).click();
    await page.getByText("Your products will appear here after you add them.", { exact: true }).waitFor();
    assert.deepEqual(productMutations, ["PATCH", "PATCH", "DELETE"]);
    assert.equal(products.length, 0);
    assert.equal(await page.locator(".product-management").isVisible(), false);
    await page
      .getByRole("button", { name: "Account & login", exact: true })
      .click();
    await page
      .getByText("Current login: " + user.email, { exact: true })
      .waitFor();
    await page
      .getByLabel("New login email", { exact: true })
      .fill("store-owner@example.com");
    await page
      .locator("#change-login-email")
      .getByLabel("Current password", { exact: true })
      .fill("wrong-password");
    await page
      .getByRole("button", { name: "Request email change", exact: true })
      .click();
    await page
      .getByText("Invalid login credentials", { exact: true })
      .waitFor();
    assert.equal(updates.length, 0);
    await page
      .locator("#change-login-email")
      .getByLabel("Current password", { exact: true })
      .fill("test-password");
    await page
      .getByRole("button", { name: "Request email change", exact: true })
      .click();
    await page
      .getByText("Email change requested. Check your new inbox", {
        exact: false,
      })
      .waitFor();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].body.email, "store-owner@example.com");
    assert.equal("id" in updates[0].body, false);
    assert.equal("password" in updates[0].body, false);
    assert.equal(updates[0].redirect, base + "/");
    assert.equal(
      await page
        .locator("#change-login-email")
        .getByLabel("Current password", { exact: true })
        .inputValue(),
      "",
    );
    assert.equal(user.id, ownerId);
    assert.equal(
      await page
        .getByRole("button", { name: "Email change requested", exact: true })
        .isDisabled(),
      true,
    );
    const change = page.locator("#change-password");
    await change
      .getByLabel("Current password", { exact: true })
      .fill("wrong-password");
    await change
      .getByLabel("New password", { exact: true })
      .fill("updated-password");
    await change
      .getByLabel("Confirm new password", { exact: true })
      .fill("updated-password");
    await change
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await change
      .getByText("Invalid login credentials", { exact: true })
      .waitFor();
    assert.equal(updates.length, 1);
    await change
      .getByLabel("Current password", { exact: true })
      .fill("test-password");
    await change
      .getByLabel("Confirm new password", { exact: true })
      .fill("mismatched-password");
    await change
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await change
      .getByText("The new passwords do not match.", { exact: true })
      .waitFor();
    assert.equal(updates.length, 1);
    await change
      .getByLabel("Confirm new password", { exact: true })
      .fill("updated-password");
    await change
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await change.getByText("Password changed.", { exact: false }).waitFor();
    assert.equal(updates.length, 2);
    assert.equal(updates[1].body.password, "updated-password");
    assert.equal(
      await change.getByLabel("New password", { exact: true }).inputValue(),
      "",
    );
    allowed = false;
    await page.reload();
    await page
      .getByRole("heading", { name: "Owner access required" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Account & login", exact: true })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: searchable expandable order rows, draft-only dropdowns, explicit atomic saves, discard and failure handling; product name/article search and article persistence; owner product deactivation/reactivation, cancelled and confirmed deletion, permission failure recovery; owner login, current-email display, password verification, existing-user email update, redirect, cleared password, confirmation guidance, password change checks and non-owner access gate.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
