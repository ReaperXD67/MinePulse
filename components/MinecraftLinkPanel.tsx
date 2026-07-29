"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Copy, Gamepad2, Link2, Unlink, X } from "lucide-react";
import { copyText } from "@/lib/copy-text";

export function MinecraftLinkPanel({ minecraftName, isLinked }: { minecraftName: string | null; isLinked: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

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
    const copied = await copyText(`/karixmc link ${code}`);
    setMessage(copied ? "Link command copied" : "Copy was blocked. Select the command and copy it manually.");
  }

  async function unlinkAccount() {
    if (!confirmUnlink) {
      setConfirmUnlink(true);
      setMessage("Confirm unlinking below. Active reward sessions will close immediately.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/account/minecraft-link", { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setConfirmUnlink(false);
    setMessage(response.ok ? payload.message || "Minecraft profile unlinked" : payload.error || "Could not unlink Minecraft profile");
    if (response.ok) router.refresh();
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
        <div className="inline-actions">
          <button className="ghost-button" type="button" disabled={busy} onClick={generateCode}><Link2 size={16} /> {isLinked ? "Relink Minecraft" : "Create link code"}</button>
          {isLinked && confirmUnlink ? <button className="ghost-button" type="button" disabled={busy} onClick={() => { setConfirmUnlink(false); setMessage(""); }}><X size={16} /> Cancel</button> : null}
          {isLinked ? <button className="ghost-button danger-button" type="button" disabled={busy} onClick={unlinkAccount}><Unlink size={16} /> {confirmUnlink ? "Confirm unlink" : "Unlink Minecraft"}</button> : null}
        </div>
      )}
      <small className="privacy-copy">Running the link command opts this Minecraft identity into KarixMC reward verification on that server. The plugin sends limited activity counters, never your IP address. Review or stop sharing at any time with <code>/karixmc privacy</code> or <code>/karixmc forget</code>.</small>
      <p className="toast-line" aria-live="polite">{message}</p>
    </section>
  );
}
