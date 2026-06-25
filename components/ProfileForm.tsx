"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, UserRound } from "lucide-react";

export function ProfileForm({
  username,
  minecraftName,
  friendsPrivate,
  bio,
  avatarUrl
}: {
  username: string;
  minecraftName: string | null;
  friendsPrivate: boolean;
  bio: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        minecraftName: form.get("minecraftName"),
        friendsPrivate: form.get("friendsPrivate") === "on",
        bio: form.get("bio"),
        avatarUrl: form.get("avatarUrl")
      })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Profile updated" : payload.error || "Could not update profile");
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="panel-header compact-heading">
        <div>
          <p className="eyebrow"><UserRound size={14} /> Public identity</p>
          <h2>Edit profile</h2>
        </div>
      </div>
      <div className="form-grid two">
        <div className="form-row">
          <label htmlFor="profile-username">Display name</label>
          <input className="field" id="profile-username" name="username" defaultValue={username} required />
        </div>
        <div className="form-row">
          <label htmlFor="profile-minecraft">Minecraft name</label>
          <input className="field" id="profile-minecraft" name="minecraftName" defaultValue={minecraftName || ""} />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="profile-avatar">Avatar URL</label>
        <input className="field" id="profile-avatar" name="avatarUrl" type="url" defaultValue={avatarUrl || ""} placeholder="https://..." />
      </div>
      <div className="form-row">
        <label htmlFor="profile-bio">Bio</label>
        <textarea className="textarea" id="profile-bio" name="bio" defaultValue={bio} maxLength={360} />
      </div>
      <label className="toggle-row privacy-toggle">
        <input name="friendsPrivate" type="checkbox" defaultChecked={friendsPrivate} />
        <span>
          <strong>Friend privacy</strong>
          <small>When enabled, other members cannot add you by nickname.</small>
        </span>
      </label>
      <div className="form-footer">
        <p className="toast-line" aria-live="polite">{message}</p>
        <button className="solid-button" disabled={busy} type="submit">
          <Save size={16} /> {busy ? "Saving" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
