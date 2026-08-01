"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shuffle } from "lucide-react";

export function DirectoryShuffleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function shuffleDirectory() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/marketplace/shuffle", { method: "POST" });
      if (!response.ok) throw new Error("Shuffle request failed");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="ghost-button"
      type="button"
      disabled={busy}
      title="Draw a new weighted server order"
      aria-live="polite"
      onClick={shuffleDirectory}
    >
      <Shuffle size={16} /> {busy ? "Shuffling" : failed ? "Retry shuffle" : "Shuffle worlds"}
    </button>
  );
}
