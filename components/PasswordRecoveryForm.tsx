"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, Send } from "lucide-react";

export function PasswordRecoveryForm({ token = "" }: { token?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const resetting = Boolean(token);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch(resetting ? "/api/auth/reset-password" : "/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resetting ? { token, password } : { email })
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    setMessage(payload.message || payload.error || "The request could not be completed.");
    if (response.ok && resetting) setPassword("");
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div>
        <p className="eyebrow"><KeyRound size={14} /> Account recovery</p>
        <h2>{resetting ? "Choose a new password" : "Reset password"}</h2>
        <p className="lead">{resetting ? "This link works once and signs out every existing device." : "We will send a time-limited link if the account exists."}</p>
      </div>
      <div className="form-row">
        <label htmlFor={resetting ? "new-password" : "recovery-email"}>{resetting ? "New password" : "Email"}</label>
        <input
          id={resetting ? "new-password" : "recovery-email"}
          className="field"
          type={resetting ? "password" : "email"}
          minLength={resetting ? 15 : undefined}
          maxLength={resetting ? 64 : undefined}
          required
          autoComplete={resetting ? "new-password" : "email"}
          value={resetting ? password : email}
          onChange={(event) => resetting ? setPassword(event.target.value) : setEmail(event.target.value)}
        />
      </div>
      <button className="solid-button" type="submit" disabled={loading}>
        <Send size={16} /> {loading ? "Working..." : resetting ? "Change password" : "Send reset link"}
      </button>
      <Link className="ghost-button auth-switch-link" href="/login">Return to login</Link>
      <p className="toast-line" aria-live="polite">{message}</p>
    </form>
  );
}
