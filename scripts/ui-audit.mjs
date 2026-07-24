import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.env.AUDIT_BASE_URL || "http://localhost:3001";
const outputDir = ".screenshots";
const routes = ["/", "/plugin", "/privacy", "/login", "/signup", "/servers/skyforge-economy"];
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

  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  const loginEmail = page.getByLabel("Email");
  const loginPassword = page.getByLabel("Password");
  if ((await loginEmail.inputValue()) || (await loginPassword.inputValue())) {
    errors.push(`${name}: login fields expose prefilled credentials`);
  }
  if (await page.getByRole("button", { name: /Control|Skyforge|PixelRunner/ }).count()) {
    errors.push(`${name}: demo account shortcuts are still exposed`);
  }

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  if ((await page.locator('link[rel~="icon"][href="/icon.svg"]').count()) !== 1) {
    errors.push(`${name}: KarixMC favicon is missing`);
  }
  if ((await page.locator(".server-card .bridge-offline, .server-card .bridge-stale").count()) !== 0) {
    errors.push(`${name}: an offline or stale server is visible in the marketplace`);
  }
  if ((await page.getByText("66.7% to lead premium", { exact: true }).count()) !== 1) {
    errors.push(`${name}: Diamond first-position chance is not explained clearly`);
  }
  if ((await page.getByText("15% chance at #1", { exact: true }).count()) !== 1) {
    errors.push(`${name}: standard-server organic spotlight is not explained clearly`);
  }
  if ((await page.getByText("Simple example: one Diamond, one Gold, and one standard server", { exact: true }).count()) !== 1) {
    errors.push(`${name}: premium placement example is missing`);
  }
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

  await page.keyboard.press("Alt");
  if (await page.locator("#world-navigator").isVisible()) {
    errors.push(`${name}: Alt unexpectedly opened the navigator`);
  }
  await page.getByRole("button", { name: "Open world navigator" }).click();
  await page.locator("#world-navigator").waitFor({ state: "visible" });
  await page.locator(".navigator-launcher").click();
  await page.locator("#world-navigator").waitFor({ state: "hidden" });
  await context.close();
}

await auditViewport("desktop", { width: 1440, height: 1000 });
await auditViewport("mobile", { width: 390, height: 844 });

const ownerContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"]
});
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
  if (!(await ownerPage.getByText("Premium leads 85% of refreshes. Diamond gets 2 chances to lead that lane for every 1 Gold chance; 15% remains a fair community spotlight for standard servers.", { exact: true }).count())) {
    errors.push("owner account: premium purchase benefits are not explained");
  }
  if (await ownerPage.getByText("Purchases are paused during testing.", { exact: false }).count()) {
    const fundingOption = ownerPage.locator(".funding-option").first();
    if (await fundingOption.isVisible()) {
      await fundingOption.click();
      const dialog = ownerPage.getByRole("dialog", { name: "Purchases are not open yet." });
      await dialog.waitFor({ state: "visible" });
      if (!(await dialog.getByRole("link", { name: "Contact support" }).isVisible())) {
        errors.push("owner account: test checkout does not offer support");
      }
      await dialog.getByRole("button", { name: "Close purchase notice" }).click();
    }
  }
  const linkButton = ownerPage.getByRole("button", { name: /Create link code|Relink Minecraft/ }).first();
  if (await linkButton.isVisible()) {
    await linkButton.click();
    const copyButton = ownerPage.getByRole("button", { name: "Copy link command" });
    await copyButton.waitFor({ state: "visible" });
    await copyButton.click();
    const copyConfirmation = ownerPage.getByText("Link command copied", { exact: true });
    await copyConfirmation.waitFor({ state: "visible" }).catch(() => null);
    if (!(await copyConfirmation.isVisible())) {
      errors.push("owner account: Minecraft link command did not copy");
    }
  }
  await ownerPage.screenshot({ path: `${outputDir}/audit-owner-account.png`, fullPage: true });
}

await ownerContext.close();

const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const adminLogin = await adminContext.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "admin@minepulse.local", password: "admin123" }
});
if (!adminLogin.ok()) {
  errors.push(`admin login failed: ${adminLogin.status()}`);
} else {
  const adminPage = await adminContext.newPage();
  adminPage.on("console", (message) => {
    if (message.type() === "error") errors.push(`admin console ${adminPage.url()}: ${message.text()}`);
  });
  adminPage.on("pageerror", (error) => errors.push(`admin page ${adminPage.url()}: ${error.message}`));
  await adminPage.goto(`${baseUrl}/admin#server-grants`, { waitUntil: "networkidle" });
  const search = adminPage.getByRole("textbox", { name: "Search server owner" });
  await search.fill("owner@minepulse.local");
  const result = adminPage.locator(".admin-account-results").getByRole("option", { name: /Skyforge Owner/i });
  await result.waitFor({ state: "visible" });
  await result.click();
  const serverSelect = adminPage.getByRole("combobox", { name: "Campaign server" });
  if (!(await serverSelect.isEnabled())) errors.push("admin campaign grant: owned server selector stayed disabled");
  const premiumServerSelect = adminPage.getByRole("combobox", { name: "Premium server" });
  if (!(await premiumServerSelect.isEnabled())) errors.push("admin premium grant: owned server selector stayed disabled");
  const premiumDuration = adminPage.getByRole("combobox", { name: "Premium grant duration" });
  if ((await premiumDuration.locator("option").allTextContents()).join("|") !== "1 week|2 weeks") {
    errors.push("admin premium grant: expected one-week and two-week durations");
  }
  const serverFilter = adminPage.getByRole("textbox", { name: "Search servers" });
  await serverFilter.fill("Survival");
  await adminPage.waitForTimeout(150);
  const fleetItems = adminPage.locator(".admin-fleet-item");
  if (!(await fleetItems.count())) errors.push("admin fleet: tag/address search returned no results");
  if (await fleetItems.count()) {
    await fleetItems.first().locator("summary").click();
    if (!(await fleetItems.first().locator('input[name="afkTimeoutSeconds"]').isVisible())) {
      errors.push("admin fleet: AFK policy controls are not visible when expanded");
    }
    if (!(await fleetItems.first().locator('input[name="challengeIntervalSeconds"]').isVisible())) {
      errors.push("admin fleet: challenge policy controls are not visible when expanded");
    }
  }
  const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) errors.push(`admin account overflow: ${overflow}px`);
  await adminPage.screenshot({ path: `${outputDir}/audit-admin-campaign-grant.png`, fullPage: true });
}
await adminContext.close();

const adminMobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const adminMobileLogin = await adminMobileContext.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "admin@minepulse.local", password: "admin123" }
});
if (!adminMobileLogin.ok()) {
  errors.push(`mobile admin login failed: ${adminMobileLogin.status()}`);
} else {
  const adminMobilePage = await adminMobileContext.newPage();
  adminMobilePage.on("console", (message) => {
    if (message.type() === "error") errors.push(`mobile admin console ${adminMobilePage.url()}: ${message.text()}`);
  });
  adminMobilePage.on("pageerror", (error) => errors.push(`mobile admin page ${adminMobilePage.url()}: ${error.message}`));
  await adminMobilePage.goto(`${baseUrl}/admin#server-grants`, { waitUntil: "networkidle" });
  const overflow = await adminMobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) errors.push(`mobile admin overflow: ${overflow}px`);
  if (!(await adminMobilePage.getByRole("textbox", { name: "Search server owner" }).isVisible())) {
    errors.push("mobile admin server grant search is not visible");
  }
  const mobileFleetSearch = adminMobilePage.getByRole("textbox", { name: "Search servers" });
  if (!(await mobileFleetSearch.isVisible())) {
    errors.push("mobile admin fleet search is not visible");
  } else {
    await mobileFleetSearch.fill("Survival");
    const mobileFleetItem = adminMobilePage.locator(".admin-fleet-item").first();
    if (await mobileFleetItem.count()) {
      await mobileFleetItem.locator("summary").click();
      const expandedOverflow = await adminMobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (expandedOverflow > 1) errors.push(`mobile expanded admin fleet overflow: ${expandedOverflow}px`);
    }
  }
  await adminMobilePage.screenshot({ path: `${outputDir}/audit-mobile-admin-campaign-grant.png`, fullPage: true });
}
await adminMobileContext.close();
await browser.close();

console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
