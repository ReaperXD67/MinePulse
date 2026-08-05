"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck, Send } from "lucide-react";

export function EmailVerificationForm({ token = "" }: { token?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const endpoint = token ? "/api/auth/verify-email" : "/api/auth/resend-verification";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token ? { token } : { email })
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    setMessage(payload.message || payload.error || "The request could not be completed.");
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div>
        <p className="eyebrow"><MailCheck size={14} /> Email security</p>
        <h2>{token ? "Activate account" : "Resend verification"}</h2>
        <p className="lead">{token ? "Confirm this address before the account can sign in." : "Request a fresh activation link for an unverified account."}</p>
      </div>
      {!token ? (
        <div className="form-row">
          <label htmlFor="verification-email">Email</label>
          <input id="verification-email" className="field" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
      ) : null}
      <button className="solid-button" type="submit" disabled={loading}>
        <Send size={16} /> {loading ? "Working..." : token ? "Verify email" : "Send new link"}
      </button>
      <Link className="ghost-button auth-switch-link" href="/login">Return to login</Link>
      <p className="toast-line" aria-live="polite">{message}</p>
    </form>
  );
}
