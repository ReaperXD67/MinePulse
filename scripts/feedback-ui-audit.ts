import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { createScriptPrisma } from "./database-client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const databaseUrl = new URL(process.env.DATABASE_URL || "http://missing");
assert(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname), "UI fixtures require a local app");
assert(["localhost", "127.0.0.1"].includes(databaseUrl.hostname) && databaseUrl.pathname.includes("feedback"), "Use a dedicated local feedback database");
const prisma = createScriptPrisma();
const stamp = crypto.randomBytes(6).toString("hex");
const prefix = `feedback-ui-${stamp}`;
const token = crypto.randomBytes(32).toString("base64url");
const output = "output/playwright";

async function inspect(page: Page, name: string) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${name}: horizontal overflow`);
  assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0, `${name}: error overlay`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}

async function main() {
  await mkdir(output, { recursive: true });
  const now = new Date();
  const admin = await prisma.user.create({ data: { id: `${prefix}-admin`, email: `${prefix}@example.test`, username: "Feedback UI admin", role: "ADMIN", emailVerifiedAt: now } });
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const server = await prisma.server.create({ data: {
      id: prefix, ownerId: admin.id, slug: prefix, name: "Feedback Test World", host: `${prefix}.example.test`,
      version: "1.21.4", description: "Local fixture for verifying server statistics and settings.", region: "EU", tags: "Survival",
      pluginSecret: crypto.randomBytes(32).toString("hex"), trustStatus: "VERIFIED", pointPool: 10000,
      lastHeartbeatAt: now, lastConfigSyncAt: now, lastPluginVersion: "0.6.7", onlinePlayerCount: 7, onlinePlayerCountAt: now
    } });
    for (let i = 0; i < 2; i += 1) {
      const player = await prisma.user.create({ data: { id: `${prefix}-player-${i}`, email: `${prefix}-${i}@example.test`, username: `Feedback player ${i}`, minecraftUuid: crypto.randomUUID() } });
      await prisma.serverSession.create({ data: { serverId: server.id, userId: player.id, minecraftName: `Feedback${i}`, lastHeartbeatAt: now, integrityVerified: true, activeSeconds: 120, status: i === 0 ? "ACTIVE" : "CLOSED" } });
      if (i === 0) await prisma.pointLedger.createMany({ data: [
        { userId: player.id, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 120, note: prefix, createdAt: now },
        { userId: player.id, type: "DAILY_REWARD", amountPoints: 30, note: prefix, createdAt: now },
        { userId: player.id, serverId: server.id, type: "PLAYER_SPEND", amountPoints: -10, note: prefix, createdAt: now }
      ] });
    }
    await prisma.authSession.create({ data: { userId: admin.id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(now.getTime() + 3600000) } });
    const context = await browser.newContext();
    await context.addCookies([{ name: "karixmc_session", value: token, url: baseUrl }]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}/servers/${server.slug}`, { waitUntil: "networkidle" });
      const presence = page.getByRole("region", { name: "Players on this server" });
      for (const [label, value] of [["Online now", "7"], ["Playing now", "1"], ["Earning now", "1"], ["Registered here", "2"]]) {
        assert.equal(await presence.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd").innerText(), value, `${label} count`);
      }
      await inspect(page, `feedback-server-${viewport.name}`);
      await presence.screenshot({ path: `${output}/feedback-presence-${viewport.name}.png` });

      await page.goto(`${baseUrl}/account`, { waitUntil: "networkidle" });
      const policy = page.locator(".plugin-policy-form");
      await policy.getByLabel("Pause rewards when AFK", { exact: false }).waitFor({ state: "visible" });
      if (viewport.name === "desktop") {
        await policy.getByLabel("Pause rewards when AFK", { exact: false }).uncheck();
        await policy.getByLabel("Send /answer activity checks", { exact: false }).uncheck();
        await policy.getByLabel("Show reward and linking notices", { exact: false }).uncheck();
        assert(await policy.getByLabel("AFK timeout (seconds)").isDisabled());
        assert(await policy.getByLabel("Ask /answer every (seconds)").isDisabled());
        const saved = page.waitForResponse((response) => response.url().endsWith(`/api/owner/servers/${server.id}`) && response.request().method() === "PATCH");
        await policy.getByRole("button", { name: "Sync protection policy" }).click();
        assert((await saved).ok(), "Saving disabled controls failed");
        const updated = await prisma.server.findUniqueOrThrow({ where: { id: server.id } });
        assert(!updated.afkProtectionEnabled && !updated.challengeEnabled && !updated.pluginMessagesEnabled, "Disabled controls did not persist");
        assert.equal(updated.afkTimeoutSeconds, 300, "Disabling AFK changed its saved timeout");
        await page.reload({ waitUntil: "networkidle" });
      }
      assert.equal(await policy.getByLabel("Pause rewards when AFK", { exact: false }).isChecked(), false);
      await policy.scrollIntoViewIfNeeded();
      await inspect(page, `feedback-owner-${viewport.name}`);
      await policy.screenshot({ path: `${output}/feedback-policy-${viewport.name}.png` });

      await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Seven-day point flow" }).waitFor({ state: "visible" });
      assert(await page.locator("#campaign-payment-note").isVisible(), "Campaign payment note lacks a visible field");
      assert(await page.locator("#premium-payment-note").isVisible(), "Premium payment note lacks a visible field");
      assert((await page.locator("#campaign-payment-help").innerText()).includes("billing history"));
      const chart = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Seven-day point flow" }) });
      await chart.getByText("View exact daily totals", { exact: true }).click();
      assert.equal(await chart.locator("tbody tr").count(), 7, "Point chart does not show seven exact days");
      const todayValues = await chart.locator("tbody tr").last().locator("td").allTextContents();
      assert(Number(todayValues[0].replaceAll(",", "")) >= 120, "Play earnings absent from daily table");
      assert(Number(todayValues[1].replaceAll(",", "")) >= 30, "Daily bonus absent from daily table");
      assert(Number(todayValues[2].replaceAll(",", "")) >= 10, "Spending absent from daily table");
      await inspect(page, `feedback-admin-${viewport.name}`);
      await chart.screenshot({ path: `${output}/feedback-chart-${viewport.name}.png` });
      await page.locator(".admin-campaign-grant").count().then(async (count) => {
        if (count) await page.locator(".admin-campaign-grant").screenshot({ path: `${output}/feedback-payment-${viewport.name}.png` });
      });
    }
    assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ ok: true, routes: 3, viewports: 2, checks: ["accurate server counts", "policy toggles persist", "disabled timers preserve values", "payment instructions", "no browser errors or horizontal overflow"] }, null, 2));
  } finally {
    await browser.close();
    await prisma.pointLedger.deleteMany({ where: { note: prefix } });
    await prisma.server.deleteMany({ where: { id: prefix } });
    await prisma.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
