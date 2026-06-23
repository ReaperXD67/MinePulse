import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  Gamepad2,
  LogOut,
  MessageCircle,
  PlugZap,
  Settings2,
  Store,
  UserRound,
  WalletCards
} from "lucide-react";
import "./globals.css";
import { TopbarShell } from "@/components/TopbarShell";
import { currentUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma/client";
import { points } from "@/lib/format";

export const metadata: Metadata = {
  title: "MinePulse",
  description: "Verified Minecraft playtime rewards and server marketplace."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL || "/plugin#support";

  const accountControl = user ? (
    <div className="navigator-user">
      <Link href="/account" aria-label="Open account">
        <Gamepad2 size={17} />
        <span><strong>{user.username}</strong><small><Coins size={11} /> {points(user.walletPoints)}</small></span>
      </Link>
      <form action="/api/auth/logout" method="post">
        <button className="icon-button" title="Log out" aria-label="Log out"><LogOut size={16} /></button>
      </form>
    </div>
  ) : (
    <Link className="navigator-login" href="/login"><UserRound size={16} /><span>Enter network</span></Link>
  );

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <div className="page-shell">
          <TopbarShell account={accountControl}>
            <nav className="world-route-grid" aria-label="World navigator">
              <Link className="world-route route-lime" href="/">
                <span className="route-index">01</span><Store size={25} />
                <span><strong>Server Atlas</strong><small>Discover funded worlds and live rewards.</small></span><ArrowUpRight size={20} />
              </Link>
              <Link className="world-route route-cyan" href="/plugin">
                <span className="route-index">02</span><PlugZap size={25} />
                <span><strong>Bridge Lab</strong><small>Install the plugin and verify real play.</small></span><ArrowUpRight size={20} />
              </Link>
              {user ? (
                <Link className="world-route route-gold" href="/account">
                  <span className="route-index">03</span><WalletCards size={25} />
                  <span><strong>My Network</strong><small>Wallet, servers, purchases, and support.</small></span><ArrowUpRight size={20} />
                </Link>
              ) : (
                <Link className="world-route route-gold" href="/login">
                  <span className="route-index">03</span><UserRound size={25} />
                  <span><strong>Enter Network</strong><small>Continue with your member identity.</small></span><ArrowUpRight size={20} />
                </Link>
              )}
              {user?.role === UserRole.ADMIN ? (
                <Link className="world-route route-rose" href="/admin">
                  <span className="route-index">04</span><Settings2 size={25} />
                  <span><strong>Control Plane</strong><small>Economy, trust, reports, and enforcement.</small></span><ArrowUpRight size={20} />
                </Link>
              ) : null}
              <a className="world-route route-violet" href={discordUrl} target={discordUrl.startsWith("http") ? "_blank" : undefined} rel={discordUrl.startsWith("http") ? "noreferrer" : undefined}>
                <span className="route-index">{user?.role === UserRole.ADMIN ? "05" : "04"}</span><MessageCircle size={25} />
                <span><strong>Official Discord</strong><small>Setup help, releases, and community support.</small></span><ArrowUpRight size={20} />
              </a>
            </nav>
          </TopbarShell>
          {children}
        </div>
      </body>
    </html>
  );
}
