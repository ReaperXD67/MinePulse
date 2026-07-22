"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <Link className="ghost-button auth-switch-link" href="/signup">Create an account</Link>

      <p className="toast-line">{message}</p>
    </form>
  );
}
