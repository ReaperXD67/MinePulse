import type { Metadata } from "next";
import Link from "next/link";
import { Coins, LayoutDashboard, LogOut, Shield, Store, Trophy, UserRound } from "lucide-react";
import "./globals.css";
import { currentUser } from "@/lib/auth";
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
          <header className="topbar">
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
                <Link href="/player">
                  <Trophy size={16} /> Player
                </Link>
                <Link href="/owner">
                  <LayoutDashboard size={16} /> Owner
                </Link>
                <Link href="/admin">
                  <Shield size={16} /> Admin
                </Link>
              </nav>

              {user ? (
                <div className="user-chip">
                  <UserRound size={18} />
                  <div>
                    <strong>{user.username}</strong>
                    <span>
                      {user.role} · <Coins size={12} /> {points(user.walletPoints)}
                    </span>
                  </div>
                  <form action="/api/auth/logout" method="post">
                    <button className="icon-button" title="Log out" aria-label="Log out">
                      <LogOut size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                <Link className="solid-button" href="/login">
                  <UserRound size={16} /> Login
                </Link>
              )}
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
