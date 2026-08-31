import assert from "node:assert/strict";
import path from "node:path";
import { chromium, type Page } from "playwright";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const pages = [
  { name: "home", path: "/", selector: ".official-showcase-notice", expectedText: "3 live official demos", officialPills: 3, assets: ["/showcase/skyforge-economy.png", "/showcase/ember-smp.png", "/showcase/voidcraft-hardcore.png"] },
  { name: "skyforge", path: "/servers/skyforge-economy", selector: ".official-showcase-disclosure", expectedText: "karixmc.pl", assets: ["/showcase/skyforge-economy.png"] },
  { name: "ember", path: "/servers/ember-smp", selector: ".official-showcase-disclosure", expectedText: "karixmc.pl:25566", assets: ["/showcase/ember-smp.png"] },
  { name: "voidcraft", path: "/servers/voidcraft-hardcore", selector: ".official-showcase-disclosure", expectedText: "karixmc.pl:25567", assets: ["/showcase/voidcraft-hardcore.png"] },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "verify-email", path: `/verify-email?token=${"a".repeat(43)}` },
  { name: "reset-password", path: `/reset-password?token=${"b".repeat(43)}` }
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

async function inspect(page: Page, route: typeof pages[number], viewport: typeof viewports[number], errors: string[]) {
  await page.setViewportSize(viewport);
  const response = await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  assert(response && response.status() < 500, `${route.path} returned ${response?.status()}`);
  await page.waitForLoadState("networkidle");
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    textLength: document.body.innerText.trim().length,
    visibleMain: Boolean(document.querySelector("main"))
  }));
  assert(metrics.visibleMain, `${route.path} has no main landmark`);
  assert(metrics.textLength > 20, `${route.path} rendered no meaningful content`);
  assert(metrics.scrollWidth <= metrics.width + 1, `${route.path} overflows horizontally at ${viewport.width}px`);
  if ("selector" in route && route.selector) {
    assert(await page.locator(route.selector).first().isVisible(), `${route.path} is missing visible ${route.selector}`);
  }
  if ("expectedText" in route && route.expectedText) {
    assert((await page.locator("body").innerText()).includes(route.expectedText), `${route.path} is missing ${route.expectedText}`);
  }
  if ("officialPills" in route && route.officialPills) {
    assert.equal(await page.locator(".official-showcase-pill").count(), route.officialPills, `${route.path} has the wrong official-demo count`);
  }
  if ("assets" in route && route.assets) {
    for (const asset of route.assets) {
      const assetResponse = await page.request.get(new URL(asset, baseUrl).toString());
      assert(assetResponse.ok(), `${asset} returned ${assetResponse.status()}`);
      assert(assetResponse.headers()["content-type"]?.startsWith("image/"), `${asset} did not return an image content type`);
    }
  }
  await page.screenshot({
    path: path.join("tmp", `production-${route.name}-${viewport.name}.png`),
    fullPage: true
  });
  assert.equal(errors.length, 0, `${route.path} emitted browser errors: ${errors.join(" | ")}`);
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      for (const route of pages) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await inspect(page, route, viewport, errors);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    ok: true,
    checks: {
      routes: pages.length,
      viewports: viewports.length,
      horizontalOverflow: 0,
      browserErrors: 0
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
