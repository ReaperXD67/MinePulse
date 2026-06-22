"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Coins, Heart, MessageSquare, RadioTower, ShieldCheck, Star, Zap } from "lucide-react";
import { compact, daysLeft, points } from "@/lib/format";

export type MarketplaceServer = {
  id: string;
  slug: string;
  name: string;
  host: string;
  port: number;
  version: string;
  region: string;
  tags: string[];
  description: string;
  bannerImage: string;
  pointPool: number;
  rewardRatePerSecond: number;
  maxPaidPlayers: number;
  premiumPlan: "NONE" | "GOLD" | "DIAMOND";
  premiumUntil: string | null;
  trustStatus: "VERIFIED" | "WATCHLIST" | "SUSPENDED" | "BLACKLISTED";
  bridgeState: "online" | "stale" | "offline";
  likes: number;
  favorites: number;
  comments: number;
  liked: boolean;
  favorited: boolean;
  items: Array<{ id: string; name: string; description: string; pricePoints: number }>;
};

export function ServerCard({ server }: { server: MarketplaceServer }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function interact(type: "like" | "favorite") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/marketplace/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId: server.id, type })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Saved" : payload.error || "Log in to interact");
    if (response.ok) {
      router.refresh();
    }
  }

  const premiumClass = server.premiumPlan === "DIAMOND" ? "diamond" : server.premiumPlan === "GOLD" ? "gold" : "";
  const teaser = server.items[0];

  return (
    <article className="server-card">
      <Link className="server-card-image" href={`/servers/${server.slug}`} style={{ "--image": `url(${server.bannerImage})` } as React.CSSProperties} aria-label={`View ${server.name}`}>
        <div className="card-signal-row">
          <span className={`status-pill trust-${server.trustStatus.toLowerCase()}`}><ShieldCheck size={12} /> {server.trustStatus}</span>
          <span className={`status-pill bridge-${server.bridgeState}`}><RadioTower size={12} /> {server.bridgeState}</span>
        </div>
      </Link>
      <div className="server-card-body">
        <div className="server-title-row">
          <div><Link href={`/servers/${server.slug}`}><h3>{server.name}</h3></Link><div className="server-host">{server.host}:{server.port}</div></div>
          {server.premiumPlan !== "NONE" ? <span className={`badge ${premiumClass}`}><Zap size={13} /> {server.premiumPlan} · {daysLeft(server.premiumUntil)}</span> : null}
        </div>

        <p className="server-description">{server.description}</p>
        <div className="tag-row"><span className="tag">{server.version}</span><span className="tag">{server.region}</span>{server.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>

        <div className="metric-grid">
          <div className="mini-metric"><span className="metric-label">Campaign</span><strong>{compact(server.pointPool)}</strong></div>
          <div className="mini-metric"><span className="metric-label">Earn</span><strong>{server.rewardRatePerSecond}/s</strong></div>
          <div className="mini-metric"><span className="metric-label">Paid cap</span><strong>{server.maxPaidPlayers}</strong></div>
        </div>

        {teaser ? <div className="store-teaser"><div><span>Store preview</span><strong>{teaser.name}</strong><small>{teaser.description}</small></div><b>{points(teaser.pricePoints)} pts</b></div> : <div className="store-teaser empty-teaser">No store items published</div>}

        <div className="server-card-footer">
          <div className="server-actions">
            <button className="icon-stat-button" aria-label={`Like ${server.name}`} title="Like" disabled={busy} onClick={() => interact("like")}><Heart size={15} fill={server.liked ? "currentColor" : "none"} /><span>{server.likes}</span></button>
            <button className="icon-stat-button" aria-label={`Favorite ${server.name}`} title="Favorite" disabled={busy} onClick={() => interact("favorite")}><Star size={15} fill={server.favorited ? "currentColor" : "none"} /><span>{server.favorites}</span></button>
            <span className="icon-stat-button passive"><MessageSquare size={15} /><span>{server.comments}</span></span>
            <span className="icon-stat-button passive"><Coins size={15} /><span>{server.rewardRatePerSecond}/s</span></span>
          </div>
          <Link className="server-view-link" href={`/servers/${server.slug}`}>View profile <ArrowUpRight size={16} /></Link>
        </div>
        <p className="toast-line" aria-live="polite">{message}</p>
      </div>
    </article>
  );
}
