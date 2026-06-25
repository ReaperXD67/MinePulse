"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RadioTower, Trash2, UserPlus, UsersRound } from "lucide-react";
import { shortDate } from "@/lib/format";

type FriendRow = {
  id: string;
  username: string;
  minecraftName: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  serverName: string | null;
  serverSlug: string | null;
};

export function FriendPanel({ friends }: { friends: FriendRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: form.get("nickname") })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Friend added" : payload.error || "Could not add friend");
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function remove(friendId: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/friends", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Friend removed" : payload.error || "Could not remove friend");
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <section className="panel friend-panel">
      <div className="panel-header compact-heading">
        <div>
          <p className="eyebrow"><UsersRound size={14} /> Friends</p>
          <h2>Track players</h2>
          <p>Add an exact display name, Minecraft name, or email to see where that player last played.</p>
        </div>
      </div>
      <form className="friend-add-form" onSubmit={submit}>
        <input className="field" name="nickname" placeholder="PixelRunner" minLength={2} maxLength={80} required />
        <button className="solid-button" disabled={busy} type="submit"><UserPlus size={15} /> Add</button>
      </form>
      <div className="friend-list">
        {friends.map((friend) => (
          <article className="friend-card" key={friend.id}>
            <div className="mini-avatar" style={friend.avatarUrl ? { backgroundImage: `url(${friend.avatarUrl})` } : undefined}>
              {!friend.avatarUrl ? friend.username.slice(0, 2).toUpperCase() : null}
            </div>
            <div>
              <strong>{friend.username}</strong>
              <span>{friend.minecraftName || "Minecraft not linked"}</span>
              {friend.serverSlug ? (
                <Link href={`/servers/${friend.serverSlug}`}>
                  <RadioTower size={13} /> {friend.online ? "Online on" : "Last on"} {friend.serverName}
                </Link>
              ) : (
                <small>No verified server yet</small>
              )}
            </div>
            <div className="friend-state">
              <span className={`status-pill bridge-${friend.online ? "online" : "offline"}`}>
                {friend.online ? "online" : friend.lastSeenAt ? shortDate(friend.lastSeenAt) : "offline"}
              </span>
              <button className="icon-button" type="button" title="Remove friend" disabled={busy} onClick={() => remove(friend.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
        {!friends.length ? <div className="empty-state compact-empty">No friends added yet.</div> : null}
      </div>
      <p className="toast-line" aria-live="polite">{message}</p>
    </section>
  );
}
