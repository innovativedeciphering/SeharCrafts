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
      else if (
        ["/orders", "/products", "/testimonials"].some((path) =>
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
      .getByLabel("Current password", { exact: true })
      .fill("test-password");
    await page
      .getByRole("button", { name: "Request email change", exact: true })
      .click();
    await page
      .getByText("Email change requested. Check the old and new inboxes", {
        exact: false,
      })
      .waitFor();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].body.email, "store-owner@example.com");
    assert.equal("id" in updates[0].body, false);
    assert.equal("password" in updates[0].body, false);
    assert.equal(updates[0].redirect, base + "/");
    assert.equal(
      await page.getByLabel("Current password", { exact: true }).inputValue(),
      "",
    );
    assert.equal(user.id, ownerId);
    assert.equal(
      await page
        .getByRole("button", { name: "Email change requested", exact: true })
        .isDisabled(),
      true,
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
      "PASS: owner login, current-email display, password verification, existing-user email update, redirect, cleared password, confirmation guidance and non-owner access gate.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
