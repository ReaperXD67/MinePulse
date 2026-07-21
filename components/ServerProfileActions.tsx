"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Heart, LifeBuoy, MessageSquare, Send, ShoppingBag, Star } from "lucide-react";
import { points } from "@/lib/format";

type ProfileItem = { id: string; name: string; description: string; pricePoints: number; requiresOnline: boolean };

export function ServerProfileActions({
  serverId,
  authenticated,
  liked,
  favorited,
  likes,
  favorites,
  items
}: {
  serverId: string;
  authenticated: boolean;
  liked: boolean;
  favorited: boolean;
  likes: number;
  favorites: number;
  items: ProfileItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"report" | "support" | "review" | null>(null);

  async function request(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Saved" : payload.error || "Action failed");
    if (response.ok) {
      setPanel(null);
      router.refresh();
    }
    return response.ok;
  }

  async function interact(type: "like" | "favorite" | "comment", body?: string) {
    return request("/api/marketplace/interact", { serverId, type, body });
  }

  if (!authenticated) {
    return (
      <div className="profile-action-stack">
        <div className="store-grid">
          {items.map((item) => (
            <div className="store-profile-card" key={item.id}>
              <div><strong>{item.name}</strong><p>{item.description}</p><small>{item.requiresOnline ? "Join the server, then use /receive if it does not arrive instantly." : "Can be delivered while offline."}</small></div>
              <span>{points(item.pricePoints)} pts</span>
            </div>
          ))}
        </div>
        <Link className="solid-button" href="/login"><ShoppingBag size={16} /> Log in to buy or interact</Link>
      </div>
    );
  }

  return (
    <div className="profile-action-stack">
      <div className="server-actions profile-social-actions">
        <button className="ghost-button" type="button" aria-label="Like server" title="Like server" disabled={busy} onClick={() => interact("like")}>
          <Heart size={16} fill={liked ? "currentColor" : "none"} /> {likes}
        </button>
        <button className="ghost-button" type="button" aria-label="Favorite server" title="Favorite server" disabled={busy} onClick={() => interact("favorite")}>
          <Star size={16} fill={favorited ? "currentColor" : "none"} /> {favorites}
        </button>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => setPanel(panel === "review" ? null : "review")}>
          <MessageSquare size={16} /> Review
        </button>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => setPanel(panel === "support" ? null : "support")}>
          <LifeBuoy size={16} /> Support
        </button>
        <button className="ghost-button danger-button" type="button" disabled={busy} onClick={() => setPanel(panel === "report" ? null : "report")}>
          <Flag size={16} /> Report
        </button>
      </div>

      {panel === "review" ? (
        <form className="inline-form-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); interact("comment", String(form.get("body") || "")); }}>
          <div><strong>Write a verified review</strong><p>Reviews unlock after the server&apos;s required verified playtime.</p></div>
          <textarea className="textarea" name="body" minLength={3} maxLength={240} required placeholder="How was the gameplay, community, and reward delivery?" />
          <button className="solid-button" disabled={busy}><Send size={15} /> Post review</button>
        </form>
      ) : null}

      {panel === "support" ? (
        <form className="inline-form-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); request(`/api/servers/${serverId}/support`, { subject: form.get("subject"), body: form.get("body") }); }}>
          <div>
            <strong>Contact this server&apos;s owner</strong>
            <p>Your request goes to the owner&apos;s Creator Studio inbox. Track replies in <Link href="/account#support">Account &gt; Support</Link>. Use Official Discord for KarixMC platform help.</p>
          </div>
          <input className="field" name="subject" minLength={4} maxLength={100} required placeholder="What do you need help with?" />
          <textarea className="textarea" name="body" minLength={12} maxLength={1200} required placeholder="Include your Minecraft name and what happened." />
          <button className="solid-button" disabled={busy}><LifeBuoy size={15} /> Send request</button>
        </form>
      ) : null}

      {panel === "report" ? (
        <form className="inline-form-panel report-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); request(`/api/servers/${serverId}/report`, { reason: form.get("reason"), details: form.get("details"), evidenceUrl: form.get("evidenceUrl") }); }}>
          <div><strong>Report this server</strong><p>KarixMC safety reviews reward failures, tampered plugins, fake players, scams, and abuse.</p></div>
          <select className="select" name="reason" defaultValue="NO_REWARD">
            <option value="NO_REWARD">Did not receive earned points</option>
            <option value="PLUGIN_TAMPERING">Modified or suspicious plugin</option>
            <option value="BOTS_OR_FAKE_PLAYERS">Bots or fake player activity</option>
            <option value="SCAM_OR_FALSE_INFO">Scam or false listing information</option>
            <option value="ABUSIVE_CONTENT">Abusive content or behavior</option>
            <option value="OTHER">Other</option>
          </select>
          <textarea className="textarea" name="details" minLength={20} maxLength={1200} required placeholder="Describe what happened, when you played, and the points you expected." />
          <input className="field" name="evidenceUrl" type="url" placeholder="Optional screenshot or video URL" />
          <button className="danger-button ghost-button" disabled={busy}><Flag size={15} /> Submit report</button>
        </form>
      ) : null}

      <div className="store-grid">
        {items.map((item) => (
          <article className="store-profile-card" key={item.id}>
            <div><strong>{item.name}</strong><p>{item.description}</p><small>{item.requiresOnline ? "Online delivery" : "Offline-safe delivery"}</small></div>
            <div><span>{points(item.pricePoints)} earned pts</span><button className="icon-button" type="button" title={`Buy ${item.name}`} aria-label={`Buy ${item.name}`} disabled={busy} onClick={() => request("/api/player/purchase", { itemId: item.id })}><ShoppingBag size={16} /></button></div>
          </article>
        ))}
        {!items.length ? <div className="empty-state compact-empty">This server has not published store items yet.</div> : null}
      </div>

      <p className="toast-line action-message" aria-live="polite">{message}</p>
    </div>
  );
}
