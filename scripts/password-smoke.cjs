// Mocked Supabase recovery flow. Start the dummy configured Vite server on port 5178.
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
    page.on("pageerror", (e) => errors.push(e.message));
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const jwt =
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }) +
      ".test-signature";
    const session = {
      access_token: jwt,
      refresh_token: "test-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user,
    };
    let recoverFailure = true,
      allowed = true;
    const recoverRequests = [],
      passwordUpdates = [];
    await page.route("https://sehar-test.supabase.co/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      let data;
      if (url.pathname.endsWith("/auth/v1/recover")) {
        recoverRequests.push({
          body: request.postDataJSON(),
          redirect: url.searchParams.get("redirect_to"),
        });
        if (recoverFailure) {
          await route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({
              msg: "Please wait before requesting another reset email",
            }),
          });
          return;
        }
        data = {};
      } else if (url.pathname.endsWith("/auth/v1/token")) data = session;
      else if (url.pathname.endsWith("/auth/v1/user")) {
        if (request.method() === "PUT")
          passwordUpdates.push(request.postDataJSON());
        data = user;
      } else if (url.pathname.endsWith("/auth/v1/logout")) {
        await route.fulfill({ status: 204 });
        return;
      } else if (url.pathname.endsWith("/rpc/is_owner")) data = allowed;
      else if (url.pathname.endsWith("/rpc/delivered_count")) data = 0;
      else if (url.pathname.endsWith("/store_settings"))
        data = {
          id: 1,
          currency: "PKR",
          payment_details: "Test policy",
          delivery_note: "Test policy",
        };
      else if (url.pathname.endsWith("/owner_settings"))
        data = { id: 1, notification_email: user.email };
      else if (
        ["/orders", "/products", "/testimonials"].some((p) =>
          url.pathname.endsWith(p),
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
    await page
      .getByRole("link", { name: "Forgot password?", exact: true })
      .click();
    await page.getByLabel("Login email", { exact: true }).fill(user.email);
    await page
      .getByRole("button", { name: "Send reset link", exact: true })
      .click();
    await page
      .getByText("Please wait before requesting another reset email", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .isDisabled(),
      false,
    );
    recoverFailure = false;
    await page
      .getByRole("button", { name: "Send reset link", exact: true })
      .click();
    await page
      .getByText("If this email belongs to an account,", { exact: false })
      .waitFor();
    assert.equal(recoverRequests[1].body.email, user.email);
    assert.equal(recoverRequests[1].redirect, base + "/?auth=recovery");
    assert.equal(passwordUpdates.length, 0);
    // Ordinary saved sessions cannot open the recovery password form.
    await page.goto(base + "/#/owner");
    await page.locator("#login [name=email]").fill(user.email);
    await page.locator("#login [name=password]").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Account & login", exact: true })
      .waitFor();
    await page.goto(base + "/#/reset-password");
    await page
      .getByRole("heading", { name: "Request a recovery link", exact: true })
      .waitFor();
    assert.equal(await page.locator("#reset-password").count(), 0);
    const recovery =
      base +
      "/?auth=recovery#access_token=" +
      jwt +
      "&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery";
    await page.goto(recovery);
    try {
      await page.locator("#reset-password").waitFor({ timeout: 5000 });
    } catch (error) {
      console.log("Recovery screen:", await page.locator("main").innerText());
      throw error;
    }
    assert.equal(new URL(page.url()).hash, "#/reset-password");
    assert.equal(new URL(page.url()).search, "");
    await page.reload();
    await page.locator("#reset-password").waitFor();
    const recoveryMarker = await page.evaluate(() =>
      sessionStorage.getItem("sehar-owner-recovery"),
    );
    assert.ok(recoveryMarker);
    assert.ok(!recoveryMarker.includes(jwt));

    await page
      .getByLabel("New password", { exact: true })
      .fill("recovered-password");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("different-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await page
      .getByText("The new passwords do not match.", { exact: true })
      .waitFor();
    assert.equal(passwordUpdates.length, 0);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("recovered-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await page.locator("#login").waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("sehar-owner-recovery")),
      null,
    );
    assert.equal(passwordUpdates.length, 1);
    assert.equal(passwordUpdates[0].password, "recovered-password");
    assert.equal("email" in passwordUpdates[0], false);
    await page.goto(
      base +
        "/?auth=recovery#error=access_denied&error_code=otp_expired&error_description=Expired",
    );
    await page
      .getByRole("heading", { name: "Request a recovery link", exact: true })
      .waitFor();
    assert.equal(await page.locator("#reset-password").count(), 0);
    allowed = false;
    await page.goto(base);
    await page.goto(recovery);
    await page
      .getByRole("heading", {
        name: "Recovery could not be verified",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator("#reset-password").count(), 0);
    await page.goto(base + "/#message=Confirmation+link+accepted");
    await page
      .getByRole("heading", {
        name: "Check your email confirmations",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("link", { name: "Return to owner studio", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Owner access required", exact: true })
      .waitFor();
    await page.goto(base + "/#error=access_denied&error_code=otp_expired");
    await page
      .getByRole("heading", {
        name: "Confirmation link unavailable",
        exact: true,
      })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: forgot-password request and rate-limit errors, redirect, saved-session bypass blocked, verified recovery after refresh, password confirmation, token cleanup, sign-out, expired links and non-owner recovery denied.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
