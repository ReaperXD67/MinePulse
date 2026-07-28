import crypto from "node:crypto";
import { chromium } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const serverName = `Live Studio ${stamp}`;
const updatedName = `${serverName} Updated`;
const host = `${stamp}.example.test`;
let serverId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const browserErrors: string[] = [];

  await context.addInitScript(() => {
    Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: undefined });
  });

  try {
    const login = await context.request.post(`${baseUrl}/api/auth/login`, {
      data: { email: "owner@minepulse.local", password: "owner123" }
    });
    assert(login.ok(), `Owner login failed with ${login.status()}`);

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

    await page.goto(`${baseUrl}/account#servers`, { waitUntil: "networkidle" });
    assert(await page.getByText("Payment status", { exact: true }).count() === 0, "Removed payment status panel is still visible");
    assert(await page.getByText("Crypto funding", { exact: true }).count() === 0, "Removed crypto funding panel is still visible");

    const createPanel = page.locator("details.disclosure-panel");
    if (!(await createPanel.getAttribute("open"))) {
      await createPanel.locator("summary").click();
    }
    const createForm = createPanel.locator("form");
    await createForm.locator('input[name="name"]').fill(serverName);
    await createForm.locator('input[name="host"]').fill(host);

    const marker = crypto.randomUUID();
    await page.evaluate((value) => {
      (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker = value;
    }, marker);

    const [createResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/owner/servers") && response.request().method() === "POST"),
      createForm.getByRole("button", { name: "Publish draft" }).click()
    ]);
    const createBody = await createResponse.json();
    assert(createResponse.ok(), `Publish draft failed with ${createResponse.status()}: ${JSON.stringify(createBody)}`);
    serverId = String(createBody.serverId || "");
    assert(serverId, "Publish response did not return a server ID");

    const createdCard = page.getByRole("article").filter({ hasText: serverName });
    await createdCard.waitFor({ state: "visible" });
    assert(await createdCard.getByText(`${host}:25565`, { exact: true }).isVisible(), "Created server address is not visible");
    assert(await page.getByText("Copy this plugin secret now", { exact: true }).isVisible(), "One-time plugin secret was not shown");
    assert(await page.evaluate(() => (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker) === marker, "Publishing caused a full page reload");

    const listed = await context.request.get(`${baseUrl}/api/owner/servers`);
    const listedBody = await listed.json();
    assert(listed.ok(), `Live server list failed with ${listed.status()}`);
    assert(listedBody.servers.some((server: { id: string }) => server.id === serverId), "Created server is missing from the live owner endpoint");

    const profileForm = createdCard.locator("form").filter({
      has: page.getByRole("button", { name: "Save profile", exact: true })
    });
    await profileForm.locator('input[name="name"]').fill(updatedName);
    await profileForm.locator("label.reward-rate-option").filter({ hasText: "1.5" }).click();
    const [updateResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/api/owner/servers/${serverId}`) && response.request().method() === "PATCH"),
      profileForm.getByRole("button", { name: "Save profile", exact: true }).click()
    ]);
    const updateBody = await updateResponse.json();
    assert(updateResponse.ok(), `Server update failed with ${updateResponse.status()}: ${JSON.stringify(updateBody)}`);

    const updatedCard = page.getByRole("article").filter({ hasText: updatedName });
    await updatedCard.waitFor({ state: "visible" });
    await updatedCard.getByText("1.5/s", { exact: true }).waitFor({ state: "visible" });
    assert(await page.evaluate(() => (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker) === marker, "Saving caused a full page reload");

    const removedTopup = await context.request.post(`${baseUrl}/api/owner/servers/${serverId}/topup`, { data: {} });
    assert(removedTopup.status() === 404, `Removed payment route returned ${removedTopup.status()} instead of 404`);

    page.once("dialog", (dialog) => dialog.accept());
    const [removeResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/api/owner/servers/${serverId}`) && response.request().method() === "DELETE"),
      updatedCard.getByRole("button", { name: "Remove listing", exact: true }).click()
    ]);
    const removeBody = await removeResponse.json();
    assert(removeResponse.ok(), `Server removal failed with ${removeResponse.status()}: ${JSON.stringify(removeBody)}`);
    await page.getByRole("heading", { name: updatedName, exact: true }).waitFor({ state: "hidden" });

    const afterRemoval = await context.request.get(`${baseUrl}/api/owner/servers`);
    const afterRemovalBody = await afterRemoval.json();
    assert(afterRemoval.ok(), `Post-removal server list failed with ${afterRemoval.status()}`);
    assert(!afterRemovalBody.servers.some((server: { id: string }) => server.id === serverId), "Removed server remains in the live owner endpoint");

    await createForm.locator('input[name="name"]').fill(updatedName);
    await createForm.locator('input[name="host"]').fill(host);
    const [restoreResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/owner/servers") && response.request().method() === "POST"),
      createForm.getByRole("button", { name: "Publish draft" }).click()
    ]);
    const restoreBody = await restoreResponse.json();
    assert(restoreResponse.ok(), `Removed server restore failed with ${restoreResponse.status()}: ${JSON.stringify(restoreBody)}`);
    assert(restoreBody.serverId === serverId, "Restoring created a duplicate server instead of reusing the removed record");
    assert(restoreBody.restored === true, "Restore response did not identify the restored listing");
    await page.getByRole("article").filter({ hasText: updatedName }).waitFor({ state: "visible" });
    assert(await page.evaluate(() => (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker) === marker, "Restoring caused a full page reload");
    assert(browserErrors.length === 0, browserErrors.join("\n"));

    console.log(JSON.stringify({
      ok: true,
      checks: {
        insecureHttpFallback: true,
        publishFeedback: true,
        createVisibleWithoutReload: true,
        updateVisibleWithoutReload: true,
        rewardRatePersisted: true,
        removeVisibleWithoutReload: true,
        removedAddressRestoredWithoutReload: true,
        cryptoRoutesRemoved: true,
        browserErrors: 0
      }
    }, null, 2));
  } finally {
    await context.request.post(`${baseUrl}/api/auth/logout`, { maxRedirects: 0 }).catch(() => null);
    await context.close();
    await browser.close();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (serverId) await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
