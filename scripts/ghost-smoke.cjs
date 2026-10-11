// Run with Playwright available in NODE_PATH and a local Vite server on GHOST_URL.
// Uses a fresh browser context. Private portraits and API calls are blocked.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.GHOST_BROWSER || undefined,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/private-portraits/**", (r) =>
      r.fulfill({ status: 404, body: "" }),
    );
    await page.route("**/api/**", (r) =>
      r.fulfill({ status: 503, body: "Offline visual check" }),
    );
    const origin = process.env.GHOST_URL || "http://127.0.0.1:5187";
    await page.goto(origin + "/ghost");
    assert.equal(
      await page
        .getByRole("button", { name: "Project", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByLabel("Ghost photo", { exact: true })
      .setInputFiles(path.join(root, "docs/ghost/stand-in.jpg"));
    await page
      .getByText("Portrait ready", { exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(await page.getByLabel("Mirror reflection").isChecked(), true);
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".ghost-mode"))
            .backgroundColor,
      ),
      "rgb(0, 0, 0)",
    );
    // The underlying animated canvas must keep changing even with controls visible.
    const before = await page
      .locator(".ghost-copy canvas")
      .evaluate((c) => c.toDataURL());
    await page.waitForTimeout(700);
    const after = await page
      .locator(".ghost-copy canvas")
      .evaluate((c) => c.toDataURL());
    assert.notEqual(before, after);
    await page.getByLabel("Mirror reflection").uncheck();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    assert.equal(await page.locator(".ghost-controls").count(), 0);
    await page.screenshot({ path: path.join(root, "docs/ghost/normal.png") });
    await page.keyboard.press("Escape");
    await page.getByLabel("Mirror reflection").check();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.screenshot({ path: path.join(root, "docs/ghost/mirrored.png") });
    await page.mouse.click(20, 20);
    await page
      .getByLabel("Ghost layout", { exact: true })
      .selectOption("pyramid");
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".ghost-copy canvas").count(), 4);
    const frames = await page
      .locator(".ghost-copy canvas")
      .evaluateAll((cs) => cs.map((c) => c.toDataURL()));
    assert.equal(
      new Set(frames).size,
      1,
      "Pyramid views must share the same live frame",
    );
    await page.screenshot({ path: path.join(root, "docs/ghost/pyramid.png") });
    await page.keyboard.press("Escape");
    await page.getByLabel("Portrait size").fill("70");
    await page.getByLabel("Vertical position").fill("12");
    assert.match(
      await page.locator(".ghost-field").getAttribute("style"),
      /translateY\(12cqh\)/,
    );
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator(".ghost-controls").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".ghost-controls").count(), 0);
    await page.evaluate(() => document.exitFullscreen());
    await page.getByRole("region", { name: "Ghost controls" }).waitFor();
    await page.getByLabel("Follow my head").check();
    await page
      .getByText(/Camera: (denied|unavailable)/)
      .waitFor({ timeout: 15000 });
    await page.getByLabel("Follow my head").uncheck();
    await page.setViewportSize({ width: 390, height: 844 });
    const controls = await page.locator(".ghost-controls").boundingBox();
    assert.ok(controls.x >= 0 && controls.x + controls.width <= 390);
    await page.getByLabel("Portrait size").fill("100");
    await page.getByLabel("Vertical position").fill("0");
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.screenshot({
      path: path.join(root, "docs/ghost/phone-pyramid.png"),
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Exit Ghost", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(await page.locator(".ghost-mode").count(), 0);
    await page.goBack();
    await page
      .getByRole("heading", { name: "Ghost mode", exact: true })
      .waitFor();
    await page.goto(origin + "/living.html");
    await page
      .locator("input[type=file]")
      .setInputFiles(path.join(root, "docs/ghost/stand-in.jpg"));
    await page
      .getByText("Live · on this device", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Ghost mode", exact: true }).click();
    await page
      .getByText("Portrait ready", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Exit Ghost", exact: true }).click();
    assert.equal(await page.locator(".lp").count(), 1);

    // Exercise the existing living stage's source handoff with a stand-in gallery.
    await page.route("**/private-portraits/manifest.json", (r) =>
      r.fulfill({ json: { home: "stand-in.jpg" } }),
    );
    await page.route("**/private-portraits/stand-in.jpg", (r) =>
      r.fulfill({
        contentType: "image/jpeg",
        body: fs.readFileSync(path.join(root, "docs/ghost/stand-in.jpg")),
      }),
    );
    await page.goto(origin + "/");
    if (await page.locator(".echo-stage").count()) {
      await page.waitForFunction(
        () =>
          document.querySelector(".echo-output .living-portrait canvas")
            ?.width > 300,
        {},
        { timeout: 60000 },
      );
      await page
        .getByRole("button", { name: "Ghost mode", exact: true })
        .click();
      await page
        .getByText("Portrait ready", { exact: true })
        .waitFor({ timeout: 60000 });
      assert.equal(
        await page.getByLabel("Ghost photo", { exact: true }).inputValue(),
        "",
      );
      await page
        .getByRole("button", { name: "Exit Ghost", exact: true })
        .click();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: route, mirror default, live animation, synchronized pyramid, black background, hidden controls, Esc/tap, sliders, fullscreen, camera failure, phone layout, exit/back, living-preview toggle, current-stage photo handoff.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
