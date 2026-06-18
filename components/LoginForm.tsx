"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

const demoAccounts = [
  ["Admin", "admin@minepulse.local", "admin123"],
  ["Owner", "owner@minepulse.local", "owner123"],
  ["Player", "player@minepulse.local", "player123"]
] as const;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("player@minepulse.local");
  const [password, setPassword] = useState("player123");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Login failed");
      return;
    }

    router.push("/");
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
          Use one of the seeded roles to test moderation, server-owner spending, and player wallets.
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

      <div className="inline-actions" aria-label="Demo accounts">
        {demoAccounts.map(([label, demoEmail, demoPassword]) => (
          <button
            className="ghost-button"
            key={label}
            type="button"
            onClick={() => {
              setEmail(demoEmail);
              setPassword(demoPassword);
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="toast-line">{message}</p>
    </form>
  );
}
