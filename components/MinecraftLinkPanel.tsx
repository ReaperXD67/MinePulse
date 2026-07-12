"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Gamepad2, Link2 } from "lucide-react";

export function MinecraftLinkPanel({ minecraftName, isLinked }: { minecraftName: string | null; isLinked: boolean }) {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function generateCode() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/account/minecraft-link", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.error || "Could not create a link code");
      return;
    }
    setCode(payload.code);
    setExpiresAt(payload.expiresAt);
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(`/karixmc link ${code}`);
    setMessage("Link command copied");
  }

  return (
    <section className="minecraft-link-panel">
      <div className="minecraft-link-heading">
        <Gamepad2 size={19} />
        <div><strong>Minecraft identity</strong><span>{isLinked ? `${minecraftName || "Minecraft profile"} is linked` : "Link the player who earns your points"}</span></div>
        {isLinked ? <CheckCircle2 className="linked-check" size={18} /> : null}
      </div>
      {code ? (
        <div className="link-code-readout">
          <div><span>Run in Minecraft within 10 minutes</span><code>/karixmc link {code}</code><small>Expires {new Date(expiresAt).toLocaleTimeString()}</small></div>
          <button className="icon-button" type="button" title="Copy link command" aria-label="Copy link command" onClick={copyCommand}><Copy size={16} /></button>
        </div>
      ) : (
        <button className="ghost-button" type="button" disabled={busy} onClick={generateCode}><Link2 size={16} /> {isLinked ? "Relink Minecraft" : "Create link code"}</button>
      )}
      <p className="toast-line" aria-live="polite">{message}</p>
    </section>
  );
}
