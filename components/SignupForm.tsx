"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, UserPlus } from "lucide-react";

export function SignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Account creation failed");
      return;
    }

    router.push("/account");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">
          <Sparkles size={14} /> Tester access
        </p>
        <h2>Create account</h2>
        <p className="lead">
          Make a separate test identity for wallet rewards, Minecraft linking, purchases, friends, and server publishing.
        </p>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="username">Display name</label>
          <input
            className="field"
            id="username"
            minLength={3}
            maxLength={40}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="nickname"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input
            className="field"
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            className="field"
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <button className="solid-button" type="submit" disabled={loading}>
        <UserPlus size={16} /> {loading ? "Creating..." : "Create test account"}
      </button>
      <Link className="ghost-button auth-switch-link" href="/login">Already have an account</Link>
      <p className="toast-line" aria-live="polite">{message}</p>
    </form>
  );
}
