import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gamepad2, LogOut, Settings2, Store, UserRound, WalletCards } from "lucide-react";
import "./globals.css";
import { TopbarShell } from "@/components/TopbarShell";
import { currentUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma/client";
import { points } from "@/lib/format";

export const metadata: Metadata = {
  title: "MinePulse",
  description: "Verified Minecraft playtime rewards and server marketplace."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();

  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <TopbarShell>
            <div className="topbar-inner">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span>MinePulse</span>
              </Link>

              <nav className="nav" aria-label="Primary navigation">
                <Link href="/">
                  <Store size={16} /> Servers
                </Link>
                {user ? (
                  <>
                    <Link href="/account" title="Account">
                      <WalletCards size={16} /> Account
                    </Link>
                    {user.role === UserRole.ADMIN ? (
                      <Link href="/admin" title="Control center">
                        <Settings2 size={16} /> Control
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </nav>

              {user ? (
                <div className="user-chip">
                  <Gamepad2 size={18} />
                  <div>
                    <strong>{user.username}</strong>
                    <span>
                      <Coins size={12} /> {points(user.walletPoints)}
                    </span>
                  </div>
                  <form action="/api/auth/logout" method="post">
                    <button className="icon-button" title="Log out" aria-label="Log out">
                      <LogOut size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                <Link className="solid-button login-cta" href="/login">
                  <UserRound size={16} /> Login
                </Link>
              )}
            </div>
          </TopbarShell>
          {children}
        </div>
      </body>
    </html>
  );
}
