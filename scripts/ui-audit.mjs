import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const outputDir = ".screenshots";
const routes = ["/", "/plugin", "/login", "/signup", "/servers/skyforge-economy"];
const errors = [];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function auditViewport(name, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${name} console ${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${name} page ${page.url()}: ${error.message}`));

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) errors.push(`${name} overflow ${route}: ${overflow}px`);
    await page.screenshot({ path: `${outputDir}/audit-${name}-${route.replaceAll("/", "-") || "home"}.png`, fullPage: true });
  }

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const canvas = page.locator(".voxel-scene canvas");
  if ((await canvas.count()) !== 1 || !(await canvas.isVisible())) {
    errors.push(`${name}: hero canvas missing or hidden`);
  } else {
    const canvasState = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      dataLength: element.toDataURL("image/png").length
    }));
    if (canvasState.width < 100 || canvasState.height < 100 || canvasState.dataLength < 1000) {
      errors.push(`${name}: hero canvas appears blank ${JSON.stringify(canvasState)}`);
    }
    if (name === "desktop") {
      await canvas.screenshot({ path: `${outputDir}/audit-desktop-canvas.png` });
    }
  }

  await page.getByRole("button", { name: "Open world navigator" }).click();
  await page.locator("#world-navigator").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator("#world-navigator").waitFor({ state: "hidden" });
  await context.close();
}

await auditViewport("desktop", { width: 1440, height: 1000 });
await auditViewport("mobile", { width: 390, height: 844 });

const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const loginResponse = await ownerContext.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "owner@minepulse.local", password: "owner123" }
});
if (!loginResponse.ok()) {
  errors.push(`owner login failed: ${loginResponse.status()}`);
} else {
  const ownerPage = await ownerContext.newPage();
  ownerPage.on("console", (message) => {
    if (message.type() === "error") errors.push(`owner console ${ownerPage.url()}: ${message.text()}`);
  });
  ownerPage.on("pageerror", (error) => errors.push(`owner page ${ownerPage.url()}: ${error.message}`));
  await ownerPage.goto(`${baseUrl}/account#servers`, { waitUntil: "networkidle" });
  const overflow = await ownerPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) errors.push(`owner account overflow: ${overflow}px`);
  if (!(await ownerPage.getByText("Website API URL", { exact: true }).first().isVisible())) {
    errors.push("owner account: plugin connection credentials are not visible");
  }
  await ownerPage.screenshot({ path: `${outputDir}/audit-owner-account.png`, fullPage: true });
}

await ownerContext.close();
await browser.close();

console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
