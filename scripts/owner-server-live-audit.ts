import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
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
let freshServerId = "";

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
      const text = message.text();
      if (message.type() === "error" && !text.includes("status of 400 (Bad Request)")) {
        browserErrors.push(`console: ${text}`);
      }
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
    await createForm.locator('textarea[name="description"]').fill("Too short");
    const [validationResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/owner/servers") && response.request().method() === "POST"),
      createForm.getByRole("button", { name: "Publish draft" }).click()
    ]);
    const validationBody = await validationResponse.json();
    assert(validationResponse.status() === 400, `Short summary returned ${validationResponse.status()} instead of 400`);
    assert(validationBody.error === "Listing summary must be at least 20 characters", `Summary validation was unclear: ${JSON.stringify(validationBody)}`);
    const visibleValidation = createForm.getByRole("alert");
    await visibleValidation.waitFor({ state: "visible" });
    assert(await visibleValidation.textContent() === "Listing summary must be at least 20 characters", "Creator Studio did not display the validation message beside the form");
    assert(Number.parseFloat(await visibleValidation.evaluate((element) => getComputedStyle(element).fontSize)) >= 13, "Creator Studio validation feedback is too small");
    await createForm.locator('textarea[name="description"]').fill("A player-first server with fair rewards and a cosmetic point shop.");

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
    const configDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download config.yml", exact: true }).click();
    const configDownload = await configDownloadPromise;
    const configPath = await configDownload.path();
    assert(configPath, "Generated config.yml download did not produce a local file");
    const configText = await readFile(configPath, "utf8");
    assert(configText.includes("api-base-url:"), "Generated config is missing api-base-url");
    assert(configText.includes(`server-id: "${serverId}"`), "Generated config has the wrong server ID");
    assert(configText.includes(`plugin-secret: "${createBody.pluginSecret}"`), "Generated config has the wrong plugin secret");
    assert(configText.includes("allow-insecure-http:"), "Generated config is missing the HTTP transport policy");
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

    const itemResponse = await context.request.post(`${baseUrl}/api/owner/items`, {
      data: {
        serverId,
        name: "Archived test reward",
        description: "Must stay attached only to the removed listing",
        pricePoints: 250,
        command: "give {player} stone 1",
        requiresOnline: true
      }
    });
    assert(itemResponse.ok(), `Could not create the archived test item: ${itemResponse.status()}`);
    const likeResponse = await context.request.post(`${baseUrl}/api/marketplace/interact`, { data: { serverId, type: "like" } });
    assert(likeResponse.ok(), `Could not create the archived test like: ${likeResponse.status()}`);
    const favoriteResponse = await context.request.post(`${baseUrl}/api/marketplace/interact`, { data: { serverId, type: "favorite" } });
    assert(favoriteResponse.ok(), `Could not create the archived test favorite: ${favoriteResponse.status()}`);
    await prisma.server.update({ where: { id: serverId }, data: { pointPool: 4321 } });

    const removedTopup = await context.request.post(`${baseUrl}/api/owner/servers/${serverId}/topup`, { data: {} });
    assert(removedTopup.status() === 404, `Removed payment route returned ${removedTopup.status()} instead of 404`);

    await updatedCard.getByRole("button", { name: "Remove listing", exact: true }).click();
    await updatedCard.getByRole("button", { name: "Confirm removal", exact: true }).waitFor({ state: "visible" });
    const [removeResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/api/owner/servers/${serverId}`) && response.request().method() === "DELETE"),
      updatedCard.getByRole("button", { name: "Confirm removal", exact: true }).click()
    ]);
    const removeBody = await removeResponse.json();
    assert(removeResponse.ok(), `Server removal failed with ${removeResponse.status()}: ${JSON.stringify(removeBody)}`);
    await page.getByRole("heading", { name: updatedName, exact: true }).waitFor({ state: "hidden" });

    const afterRemoval = await context.request.get(`${baseUrl}/api/owner/servers`);
    const afterRemovalBody = await afterRemoval.json();
    assert(afterRemoval.ok(), `Post-removal server list failed with ${afterRemoval.status()}`);
    assert(!afterRemovalBody.servers.some((server: { id: string }) => server.id === serverId), "Removed server remains in the live owner endpoint");
    await page.reload({ waitUntil: "networkidle" });
    assert(await page.getByRole("heading", { name: updatedName, exact: true }).count() === 0, "Removed server returned after a fresh account-page load");
    await page.evaluate((nextMarker) => {
      (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker = nextMarker;
    }, marker);

    if (!(await createPanel.getAttribute("open"))) {
      await createPanel.locator("summary").click();
    }
    await createForm.locator('input[name="name"]').fill(updatedName);
    await createForm.locator('input[name="host"]').fill(host);
    const [freshResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/owner/servers") && response.request().method() === "POST"),
      createForm.getByRole("button", { name: "Publish draft" }).click()
    ]);
    const freshBody = await freshResponse.json();
    assert(freshResponse.ok(), `Fresh server publish failed with ${freshResponse.status()}: ${JSON.stringify(freshBody)}`);
    freshServerId = String(freshBody.serverId || "");
    assert(freshServerId && freshServerId !== serverId, "Republishing reused the removed server identity");
    assert(freshBody.freshStart === true, "Publish response did not identify the fresh start");
    assert(freshBody.pluginSecret && freshBody.pluginSecret !== createBody.pluginSecret, "Fresh listing reused the old plugin secret");
    await page.getByRole("article").filter({ hasText: updatedName }).waitFor({ state: "visible" });
    assert(await page.evaluate(() => (window as typeof window & { __karixAuditMarker?: string }).__karixAuditMarker) === marker, "Fresh publish caused a full page reload");

    const freshListing = await context.request.get(`${baseUrl}/api/owner/servers`);
    const freshListingBody = await freshListing.json();
    const freshServer = freshListingBody.servers.find((server: { id: string }) => server.id === freshServerId);
    assert(freshListing.ok() && freshServer, "Fresh listing is missing from the owner endpoint");
    assert(freshServer.pointPool === 0, "Fresh listing inherited the removed campaign pool");
    assert(freshServer.likeCount === 0, "Fresh listing inherited removed likes");
    assert(freshServer.favoriteCount === 0, "Fresh listing inherited removed favorites");
    assert(Array.isArray(freshServer.items) && freshServer.items.length === 0, "Fresh listing inherited removed shop items");

    const archived = await prisma.server.findUnique({
      where: { id: serverId },
      include: { items: true, likes: true, favorites: true }
    });
    assert(archived?.status === "REMOVED", "Old listing was not retained as a removed audit record");
    assert(archived.pointPool === 4321 && archived.items.length === 1 && archived.likes.length === 1 && archived.favorites.length === 1, "Archived listing history was unexpectedly erased");
    let duplicateActiveAddressBlocked = false;
    try {
      await prisma.server.update({ where: { id: serverId }, data: { status: "ACTIVE" } });
    } catch (error) {
      duplicateActiveAddressBlocked = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    }
    assert(duplicateActiveAddressBlocked, "Database allowed two current listings for the same host and port");
    assert(browserErrors.length === 0, browserErrors.join("\n"));

    console.log(JSON.stringify({
      ok: true,
      checks: {
        insecureHttpFallback: true,
        publishFeedback: true,
        clearSummaryValidation: true,
        visibleFormErrorFeedback: true,
        completePluginConfigDownload: true,
        createVisibleWithoutReload: true,
        updateVisibleWithoutReload: true,
        rewardRatePersisted: true,
        removeVisibleWithoutReload: true,
        removalPersistsAfterReload: true,
        removedAddressCreatesFreshIdentityWithoutReload: true,
        oldShopSocialPoolNotReused: true,
        removedListingRetainedForAudit: true,
        concurrentActiveDuplicateGuard: true,
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
    const serverIds = [serverId, freshServerId].filter(Boolean);
    if (serverIds.length) await prisma.server.deleteMany({ where: { id: { in: serverIds } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
