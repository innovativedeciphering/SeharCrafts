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
