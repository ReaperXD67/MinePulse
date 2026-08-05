import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createScriptPrisma } from "./database-client";

const prisma = createScriptPrisma();

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const screenshots = {
  admin: "tmp/admin-account-search-desktop.png",
  adminMobile: "tmp/admin-account-search-mobile.png",
  directory: "tmp/directory-stable-order.png"
};

async function serverNames(page: import("playwright").Page) {
  await page.locator(".server-card h3").first().waitFor({ state: "visible" });
  return page.locator(".server-card h3").allTextContents();
}

async function main() {
  const candidates = await prisma.server.findMany({
    where: {
      status: "ACTIVE",
      trustStatus: { in: ["VERIFIED", "WATCHLIST"] },
      pointPool: { gt: 0 }
    },
    select: { id: true, lastHeartbeatAt: true, lastConfigSyncAt: true },
    take: 8
  });
  assert(candidates.length > 0, "The local audit database has no funded active server");

  await prisma.server.updateMany({
    where: { id: { in: candidates.map((server) => server.id) } },
    data: { lastHeartbeatAt: new Date() }
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    const login = await context.request.post(`${baseUrl}/api/auth/login`, {
      data: { email: "admin@minepulse.local", password: "admin123" }
    });
    assert(login.ok(), `Admin login failed (${login.status()})`);

    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    const walletPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Manual wallet grant" }) });
    await assert.doesNotReject(() => walletPanel.getByLabel("Search wallet account").waitFor({ state: "visible" }));
    assert.equal(await walletPanel.locator('select[name="userId"]').count(), 0, "The unscalable user dropdown still exists");

    const accountSearch = walletPanel.getByLabel("Search wallet account");
    await accountSearch.fill("player@minepulse.local");
    const playerResult = walletPanel.getByRole("option").filter({ hasText: "PixelRunner" });
    await playerResult.waitFor({ state: "visible" });
    await playerResult.click();
    await walletPanel.getByText("Current earned wallet").waitFor({ state: "visible" });
    assert(await walletPanel.getByRole("button", { name: "Grant points" }).isEnabled(), "Grant button stayed disabled after account selection");
    await page.screenshot({ path: screenshots.admin, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
    const mobileWalletPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Manual wallet grant" }) });
    await mobileWalletPanel.getByLabel("Search wallet account").fill("player@minepulse.local");
    await mobileWalletPanel.getByRole("option").filter({ hasText: "PixelRunner" }).click();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(hasHorizontalOverflow, false, "Admin account search overflows the mobile viewport");
    await page.screenshot({ path: screenshots.adminMobile, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto(`${baseUrl}/#servers`, { waitUntil: "domcontentloaded" });
    const initialOrder = await serverNames(page);
    const initialSeed = (await context.cookies()).find((cookie) => cookie.name === "karixmc_directory_seed")?.value || null;
    assert(initialOrder.length > 0, "No live servers appeared in the directory audit");
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadOrder = await serverNames(page);
    const reloadSeed = (await context.cookies()).find((cookie) => cookie.name === "karixmc_directory_seed")?.value || null;
    assert.deepEqual(reloadOrder, initialOrder, `Browser reload unexpectedly shuffled the directory (seeds ${initialSeed} / ${reloadSeed})`);

    await page.goto(`${baseUrl}/account`, { waitUntil: "domcontentloaded" });
    await page.getByText("Player level", { exact: true }).waitFor({ state: "visible" });
    await page.goto(`${baseUrl}/#servers`, { waitUntil: "domcontentloaded" });
    const returnOrder = await serverNames(page);
    const returnSeed = (await context.cookies()).find((cookie) => cookie.name === "karixmc_directory_seed")?.value || null;
    assert.deepEqual(returnOrder, initialOrder, `Returning from My Network unexpectedly shuffled the directory (seeds ${initialSeed} / ${returnSeed})`);

    const cookieBefore = (await context.cookies()).find((cookie) => cookie.name === "karixmc_directory_seed")?.value;
    const shuffleResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/marketplace/shuffle") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Shuffle worlds" }).click();
    assert((await shuffleResponse).ok(), "Explicit shuffle request failed");
    await page.waitForTimeout(1_000);
    const cookieAfter = (await context.cookies()).find((cookie) => cookie.name === "karixmc_directory_seed");
    assert(cookieAfter?.value && cookieAfter.value !== cookieBefore, "Explicit shuffle did not rotate the directory seed");
    assert(cookieAfter.httpOnly, "Directory seed cookie should be HTTP-only");
    const shuffledOrder = await serverNames(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.deepEqual(await serverNames(page), shuffledOrder, "The explicit shuffle did not persist across reload");
    await page.screenshot({ path: screenshots.directory, fullPage: true });

    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(" | ")}`);
    console.log(JSON.stringify({
      ok: true,
      checks: {
        boundedAccountSearchUi: true,
        mobileAccountSearchFits: true,
        normalReloadStable: true,
        networkNavigationStable: true,
        explicitShuffleRotatesSeed: true,
        shuffledOrderPersists: true,
        consoleErrors: 0
      },
      initialOrder,
      shuffledOrder,
      screenshots
    }, null, 2));
  } finally {
    await browser.close();
    await Promise.all(candidates.map((server) => prisma.server.update({
      where: { id: server.id },
      data: {
        lastHeartbeatAt: server.lastHeartbeatAt,
        lastConfigSyncAt: server.lastConfigSyncAt
      }
    })));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
