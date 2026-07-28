"use client";

import { useState } from "react";
import { KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";

type AuthSessionRow = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

function deviceDetails(userAgent: string | null) {
  const value = userAgent || "";
  const mobile = /Android|iPhone|iPad|Mobile/i.test(value);
  const browser = /Edg\//.test(value)
    ? "Edge"
    : /Firefox\//.test(value)
      ? "Firefox"
      : /Chrome\//.test(value)
        ? "Chrome"
        : /Safari\//.test(value)
          ? "Safari"
          : "Browser";
  const platform = /Windows/i.test(value)
    ? "Windows"
    : /Android/i.test(value)
      ? "Android"
      : /iPhone|iPad/i.test(value)
        ? "iOS"
        : /Macintosh|Mac OS/i.test(value)
          ? "macOS"
          : /Linux/i.test(value)
            ? "Linux"
            : "Unknown device";

  return { mobile, label: `${browser} on ${platform}` };
}

function sessionTime(value: string) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value))} UTC`;
}

export function SecurityPanel({ initialSessions }: { initialSessions: AuthSessionRow[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function revokeSession(sessionId: string) {
    setBusy(sessionId);
    setMessage("");
    const response = await fetch(`/api/account/sessions/${sessionId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setBusy("");

    if (!response.ok) {
      setMessage(payload.error || "Could not sign out that device");
      return;
    }

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setMessage("Device signed out.");
  }

  async function revokeOtherSessions() {
    setBusy("others");
    setMessage("");
    const response = await fetch("/api/account/sessions", { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setBusy("");

    if (!response.ok) {
      setMessage(payload.error || "Could not sign out other devices");
      return;
    }

    setSessions((current) => current.filter((session) => session.current));
    setMessage(payload.message || "Other devices signed out.");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setMessage("");
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy("");

    if (!response.ok) {
      setMessage(payload.error || "Password could not be updated");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setSessions((current) => current.filter((session) => session.current));
    setMessage(payload.message || "Password updated.");
  }

  return (
    <section className="panel security-panel" id="security">
      <div className="panel-header security-panel-header">
        <div>
          <p className="eyebrow"><ShieldCheck size={14} /> Account security</p>
          <h2>Sessions and password</h2>
          <p>Review signed-in devices and remove access you do not recognize.</p>
        </div>
        {sessions.some((session) => !session.current) ? (
          <button className="ghost-button danger-button" type="button" disabled={Boolean(busy)} onClick={revokeOtherSessions}>
            <LogOut size={15} /> {busy === "others" ? "Signing out..." : "Sign out other devices"}
          </button>
        ) : null}
      </div>

      <div className="security-layout">
        <div className="session-list" aria-label="Active sessions">
          {sessions.map((session) => {
            const device = deviceDetails(session.userAgent);
            const DeviceIcon = device.mobile ? Smartphone : Laptop;

            return (
              <div className="session-row" key={session.id}>
                <span className="session-device-icon"><DeviceIcon size={18} /></span>
                <span className="session-copy">
                  <strong>{device.label} {session.current ? <em>Current device</em> : null}</strong>
                  <small>Last active {sessionTime(session.lastSeenAt)} / Expires {sessionTime(session.expiresAt)}</small>
                </span>
                {!session.current ? (
                  <button className="icon-button danger-button" type="button" title="Sign out this device" aria-label={`Sign out ${device.label}`} disabled={Boolean(busy)} onClick={() => revokeSession(session.id)}>
                    <LogOut size={15} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <form className="password-change-form" onSubmit={changePassword}>
          <div>
            <p className="eyebrow"><KeyRound size={14} /> Password</p>
            <h3>Change password</h3>
            <p>Use at least 15 characters. Changing it signs out every other device.</p>
          </div>
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" className="field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          <label htmlFor="new-password">New password</label>
          <input id="new-password" className="field" type="password" minLength={15} maxLength={64} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
          <button className="solid-button" type="submit" disabled={Boolean(busy)}>
            <KeyRound size={15} /> {busy === "password" ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>

      <p className="toast-line" aria-live="polite">{message}</p>
    </section>
  );
}
