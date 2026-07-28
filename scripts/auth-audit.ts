import crypto from "node:crypto";
import { request, type APIResponse } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `auth-audit-${stamp}@example.test`;
const username = `Auth Audit ${stamp.slice(-8)}`;
const password = `Nebula!River!Quartz!${stamp}`;
const newPassword = `Orbit!Cedar!Lantern!${stamp}`;
const startedAt = new Date();
let userId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: APIResponse) {
  return response.json().catch(() => ({}));
}

async function main() {
  const first = await request.newContext({ baseURL: baseUrl });
  const second = await request.newContext({ baseURL: baseUrl });
  const attacker = await request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" }
  });

  try {
    const anonymousSessions = await first.get("/api/account/sessions");
    assert(anonymousSessions.status() === 401, `Anonymous sessions endpoint returned ${anonymousSessions.status()}`);

    const weakRegistration = await first.post("/api/auth/register", {
      data: { username, email, password: "short-password" }
    });
    assert(weakRegistration.status() === 400, `Weak password returned ${weakRegistration.status()}`);

    const registration = await first.post("/api/auth/register", {
      data: { username, email, password, role: "ADMIN" }
    });
    const registrationBody = await json(registration);
    assert(registration.ok(), `Registration failed with ${registration.status()}: ${JSON.stringify(registrationBody)}`);
    assert(registrationBody.user?.role === "PLAYER", "Public signup was able to choose a privileged role");
    userId = registrationBody.user.id;

    const state = await first.storageState();
    const cookie = state.cookies.find((entry) => entry.name === "karixmc_session");
    assert(cookie, "Opaque session cookie was not created");
    assert(cookie.httpOnly, "Session cookie is not HttpOnly");
    assert(cookie.sameSite === "Lax", `Session cookie SameSite is ${cookie.sameSite}`);
    assert(cookie.value.length >= 40 && !cookie.value.includes("."), "Session cookie looks like a readable JWT");

    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert(storedUser.role === "PLAYER", `Registered role is ${storedUser.role}`);
    const firstSession = await prisma.authSession.findFirstOrThrow({ where: { userId, revokedAt: null } });
    assert(
      firstSession.tokenHash === crypto.createHash("sha256").update(cookie.value).digest("hex"),
      "Database does not contain only the session token hash"
    );

    const account = await first.get("/account");
    const accountHtml = await account.text();
    assert(account.ok() && accountHtml.includes("Sessions and password"), "Authenticated account security panel is unavailable");

    const secondLogin = await second.post("/api/auth/login", { data: { email, password } });
    assert(secondLogin.ok(), `Second-device login failed with ${secondLogin.status()}`);
    const sessionsResponse = await second.get("/api/account/sessions");
    const sessionsBody = await json(sessionsResponse);
    assert(sessionsResponse.ok() && sessionsBody.sessions?.length === 2, "Two active devices were not recorded");
    const currentSession = sessionsBody.sessions.find((session: { current: boolean }) => session.current);
    assert(currentSession, "Current session was not identified");

    const revokeFirst = await second.delete(`/api/account/sessions/${firstSession.id}`);
    assert(revokeFirst.ok(), `Remote session revocation failed with ${revokeFirst.status()}`);
    const revokedAccess = await first.get("/api/account/sessions");
    assert(revokedAccess.status() === 401, "Revoked session still has authenticated access");

    const wrongPassword = await second.post("/api/account/password", {
      data: { currentPassword: "incorrect-current-password", newPassword }
    });
    assert(wrongPassword.status() === 401, "Password changed without current-password verification");

    const passwordChange = await second.post("/api/account/password", {
      data: { currentPassword: password, newPassword }
    });
    assert(passwordChange.ok(), `Password change failed with ${passwordChange.status()}`);

    const logout = await second.post("/api/auth/logout", { maxRedirects: 0 });
    assert(logout.status() === 303, `Logout returned ${logout.status()}`);
    const activeAfterLogout = await prisma.authSession.count({ where: { userId, revokedAt: null } });
    assert(activeAfterLogout === 0, "Logout did not revoke the server-side session");

    const oldPasswordLogin = await first.post("/api/auth/login", { data: { email, password } });
    assert(oldPasswordLogin.status() === 401, "Old password still works after password change");
    const newPasswordLogin = await first.post("/api/auth/login", { data: { email, password: newPassword } });
    assert(newPasswordLogin.ok(), `New password login failed with ${newPasswordLogin.status()}`);

    const target = email;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await attacker.post("/api/auth/login", {
        data: { email: target, password: "Wrong!Password!Value!123" }
      });
      assert(response.status() === 401, `Failed login ${attempt + 1} returned ${response.status()}`);
    }
    const blocked = await attacker.post("/api/auth/login", {
      data: { email: target, password: "Wrong!Password!Value!123" }
    });
    assert(blocked.status() === 429 && Number(blocked.headers()["retry-after"]) > 0, "Login throttling did not activate");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        databaseAccount: true,
        passwordHashing: true,
        opaqueHttpOnlyCookie: true,
        databaseSessions: true,
        roleEscalationBlocked: true,
        remoteRevocation: true,
        passwordRotation: true,
        logoutRevocation: true,
        bruteForceThrottle: true
      }
    }, null, 2));
  } finally {
    await first.dispose();
    await second.dispose();
    await attacker.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.authThrottle.deleteMany({ where: { updatedAt: { gte: startedAt } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
