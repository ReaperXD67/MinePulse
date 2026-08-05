"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) })
    });

    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      if (payload.code === "TWO_FACTOR_REQUIRED") setRequiresTotp(true);
      setMessage(payload.error || "Login failed");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">
          <KeyRound size={14} /> Secure role access
        </p>
        <h2>Enter the network</h2>
        <p className="lead">
          Sign in with your personal KarixMC account. Wallets, Minecraft links, purchases, and servers stay attached to this identity.
        </p>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input
            className="field"
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>
        {requiresTotp ? (
          <div className="form-row">
            <label htmlFor="totp-code">Authenticator code</label>
            <input className="field" id="totp-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required />
          </div>
        ) : null}
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            className="field"
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>
      </div>

      <button className="solid-button" type="submit" disabled={loading}>
        <LogIn size={16} /> {loading ? "Checking..." : "Login"}
      </button>
      <Link className="text-link" href="/forgot-password">Forgot password?</Link>
      <Link className="ghost-button auth-switch-link" href="/signup">Create an account</Link>

      <p className="toast-line">{message}</p>
    </form>
  );
}
