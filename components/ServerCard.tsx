"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Coins, Heart, MessageSquare, RefreshCw, ShoppingBag, Star, Zap } from "lucide-react";
import { compact, daysLeft, points } from "@/lib/format";

export type MarketplaceServer = {
  id: string;
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
  likes: number;
  favorites: number;
  comments: number;
  liked: boolean;
  favorited: boolean;
  items: Array<{
    id: string;
    name: string;
    description: string;
    pricePoints: number;
  }>;
};

export function ServerCard({ server }: { server: MarketplaceServer }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function interact(type: "like" | "favorite" | "comment") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/marketplace/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId: server.id, type, body: comment })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || "Action failed");
      return;
    }

    if (type === "comment") {
      setComment("");
    }
    setMessage(payload.message || "Saved");
    router.refresh();
  }

  async function buy(itemId: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/player/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || "Purchase failed");
      return;
    }

    setMessage("Purchase queued for in-game delivery");
    router.refresh();
  }

  const premiumClass =
    server.premiumPlan === "DIAMOND" ? "diamond" : server.premiumPlan === "GOLD" ? "gold" : "";

  return (
    <article className="server-card">
      <div
        className="server-card-image"
        style={{ "--image": `url(${server.bannerImage})` } as React.CSSProperties}
      />
      <div className="server-card-body">
        <div className="server-title-row">
          <div>
            <h3>{server.name}</h3>
            <div className="server-host">
              {server.host}:{server.port}
            </div>
          </div>
          {server.premiumPlan !== "NONE" ? (
            <span className={`badge ${premiumClass}`}>
              <Zap size={13} /> {server.premiumPlan} - {daysLeft(server.premiumUntil)}
            </span>
          ) : (
            <span className="badge">Random</span>
          )}
        </div>

        <p className="server-description">{server.description}</p>

        <div className="tag-row">
          <span className="tag">{server.version}</span>
          <span className="tag">{server.region}</span>
          {server.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>

        <div className="metric-grid">
          <div className="mini-metric">
            <span className="metric-label">Pool</span>
            <strong>{compact(server.pointPool)}</strong>
          </div>
          <div className="mini-metric">
            <span className="metric-label">Reward</span>
            <strong>{server.rewardRatePerSecond}/s</strong>
          </div>
          <div className="mini-metric">
            <span className="metric-label">Paid cap</span>
            <strong>{server.maxPaidPlayers}</strong>
          </div>
        </div>

        <div className="shop-list">
          {server.items.map((item) => (
            <div className="shop-card" key={item.id}>
              <div>
                <h4>{item.name}</h4>
                <p>
                  {item.description} - {points(item.pricePoints)} pts
                </p>
              </div>
              <button
                className="icon-button"
                title={`Buy ${item.name}`}
                aria-label={`Buy ${item.name}`}
                disabled={busy}
                onClick={() => buy(item.id)}
              >
                <ShoppingBag size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="server-actions">
          <button className="ghost-button" disabled={busy} onClick={() => interact("like")}>
            <Heart size={16} fill={server.liked ? "currentColor" : "none"} />
            {server.likes}
          </button>
          <button className="ghost-button" disabled={busy} onClick={() => interact("favorite")}>
            <Star size={16} fill={server.favorited ? "currentColor" : "none"} />
            {server.favorites}
          </button>
          <span className="badge">
            <MessageSquare size={13} /> {server.comments}
          </span>
          <span className="badge">
            <Coins size={13} /> Earn {server.rewardRatePerSecond}/s
          </span>
        </div>

        <div className="comment-box">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Comment after verified play"
            maxLength={240}
          />
          <button
            className="icon-button"
            title="Post comment"
            aria-label="Post comment"
            disabled={busy || comment.trim().length < 3}
            onClick={() => interact("comment")}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <p className="toast-line">{message}</p>
      </div>
    </article>
  );
}
