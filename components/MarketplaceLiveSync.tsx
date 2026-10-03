"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function MarketplaceLiveSync() {
  const router = useRouter();
  const checking = useRef(false);

  useEffect(() => {
    let disposed = false;

    const syncDirectory = async () => {
      if (disposed || checking.current || document.visibilityState !== "visible") return;
      checking.current = true;
      try {
        const response = await fetch("/api/marketplace/live", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.serverIds)) return;

        // Player counts and rewards change even when the same servers remain listed.
        if (!disposed) router.refresh();
      } catch {
        // Keep the current directory visible during a temporary network failure.
      } finally {
        checking.current = false;
      }
    };

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncDirectory();
    };

    void syncDirectory();
    const timer = window.setInterval(syncDirectory, 30_000);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [router]);

  return null;
}
