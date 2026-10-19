const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
  await page
    .getByRole("heading", { name: "Little things. Lasting joy." })
    .waitFor();
  assert.equal(await page.locator(".product").count(), 4);
  await page.locator(".hero-photo img").evaluate((img) => img.decode());
  assert.ok(
    await page
      .locator(".hero-photo img")
      .evaluate((img) => img.naturalWidth > 0),
  );
  await page.getByRole("button", { name: "Baskets", exact: true }).click();
  assert.equal(await page.locator(".product").count(), 1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.locator(".product-meta button").first().click();
  await page.getByRole("button", { name: "Next image" }).click();
  assert.equal(await page.locator("#position").textContent(), "2 / 2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("#quantity").fill("2");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.locator("#cart").click();
  assert.match(await page.locator("dialog").innerText(), /5,200/);
  assert.equal(await page.locator(".bag-thumbnail img").count(), 1);
  assert.equal(await page.locator("#count").innerText(), "2");
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Preview only · connect store to order" })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Remove The Woven Bloom" }).click();
  assert.match(await page.locator("dialog").innerText(), /waiting/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Ask Sehar" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("How do I pay?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  assert.match(
    await page.locator("#chat-log").innerText(),
    /Payment instructions/,
  );
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page
    .locator("header")
    .getByRole("link", { name: "Owner studio" })
    .click();
  await page
    .getByText(
      "Connect Supabase to enable secure owner login, photo uploads, product editing, order management, and payment settings.",
    )
    .waitFor();
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.setViewportSize({ width: 390, height: 600 });
  for (let index = 0; index < 4; index++) {
    await page.locator(".product-meta button").nth(index).click();
    await page.getByRole("button", { name: "Add to bag" }).click();
  }
  await page.locator("footer").scrollIntoViewIfNeeded();
  assert.equal(await page.locator("#cart").evaluate((el) => getComputedStyle(el).position), "fixed");
  await page.getByRole("button", { name: "Open bag, 4 items", exact: true }).click();
  await page.locator(".bag-items").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator(".bag-items").evaluate((el) => el.scrollHeight > el.clientHeight));
  const checkoutBox = await page.locator("#proceed-checkout").boundingBox();
  assert.ok(checkoutBox.y >= 0 && checkoutBox.y + checkoutBox.height <= 600);
  assert.ok(await page.locator(".bag-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.locator(".bag-remove").last().click();
  assert.equal(await page.locator("#count").innerText(), "3");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog").isVisible(), false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#cart").click();
  assert.equal(await page.locator("dialog").evaluate((el) => getComputedStyle(el).animationName), "none");
  await page.screenshot({ path: "/tmp/sehar-bag-mobile.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: storefront, filters, carousel controls, bag totals/removal, demo checkout guard, assistant, owner setup gate, mobile overflow; no runtime exceptions.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
