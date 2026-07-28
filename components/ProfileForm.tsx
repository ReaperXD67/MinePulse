"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUp, Save, UserRound } from "lucide-react";

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
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    const form = new FormData(formElement);
    let nextAvatarUrl = form.get("removeAvatar") === "on" ? "" : avatarUrl || "";
    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      const upload = new FormData();
      upload.set("image", avatar);
      upload.set("kind", "avatar");
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch("/api/account/media", { method: "POST", body: upload });
      } catch {
        setBusy(false);
        setMessage("Avatar upload could not reach the website service");
        return;
      }
      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        setBusy(false);
        setMessage(uploadPayload.error || `Avatar upload failed (HTTP ${uploadResponse.status})`);
        return;
      }
      nextAvatarUrl = uploadPayload.url;
    }
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        friendsPrivate: form.get("friendsPrivate") === "on",
        bio: form.get("bio"),
        avatarUrl: nextAvatarUrl
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
          <label htmlFor="profile-minecraft">Linked Minecraft name</label>
          <input className="field" id="profile-minecraft" value={minecraftName || "Not linked"} readOnly aria-readonly="true" />
          <small>This identity can only be changed by using a short-lived link code in Minecraft.</small>
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="profile-avatar"><ImageUp size={14} /> Avatar image</label>
        <input className="field file-field" id="profile-avatar" name="avatar" type="file" accept="image/png,image/jpeg" />
        <small>PNG or JPEG up to 4 MB. KarixMC strips metadata and stores an optimized WebP no larger than 256 KB.</small>
        {avatarUrl ? <label className="toggle-row"><input name="removeAvatar" type="checkbox" /> Remove current avatar</label> : null}
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
