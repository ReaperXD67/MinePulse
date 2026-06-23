import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gamepad2, LogOut, MessageCircle, PlugZap, Settings2, Store, UserRound, WalletCards } from "lucide-react";
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
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL || "/plugin#support";

  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <TopbarShell>
            <div className="signal-rail">
              <Link href="/" className="brand nav-brand-node" aria-label="MinePulse home">
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
                <span className="brand-word"><strong>Mine</strong><strong>Pulse</strong></span>
              </Link>

              <nav className="nav nav-command-deck" aria-label="Primary navigation">
                <Link href="/" aria-label="Servers" title="Servers">
                  <span className="nav-index">01</span><Store size={17} /> <span>Servers</span>
                </Link>
                <Link href="/plugin" aria-label="MinePulse Bridge" title="MinePulse Bridge">
                  <span className="nav-index">02</span><PlugZap size={17} /> <span>Bridge</span>
                </Link>
                {user ? (
                  <>
                    <Link href="/account" aria-label="Account" title="Account">
                      <span className="nav-index">03</span><WalletCards size={17} /> <span>Account</span>
                    </Link>
                    {user.role === UserRole.ADMIN ? (
                      <Link href="/admin" aria-label="Control center" title="Control center">
                        <span className="nav-index">04</span><Settings2 size={17} /> <span>Control</span>
                      </Link>
                    ) : null}
                  </>
                ) : null}
                <a href={discordUrl} target={discordUrl.startsWith("http") ? "_blank" : undefined} rel={discordUrl.startsWith("http") ? "noreferrer" : undefined} aria-label="Official Discord support" title="Official Discord support">
                  <MessageCircle size={17} /><span className="nav-discord-label">Discord</span>
                </a>
              </nav>

              {user ? (
                <div className="user-chip nav-account-node">
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
                <Link className="solid-button login-cta nav-account-node" href="/login">
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
