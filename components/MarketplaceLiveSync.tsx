"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

function signature(serverIds: string[]) {
  return [...serverIds].sort().join("|");
}

export function MarketplaceLiveSync({ serverIds }: { serverIds: string[] }) {
  const router = useRouter();
  const initialSignature = useMemo(() => signature(serverIds), [serverIds]);
  const expectedSignature = useRef(initialSignature);
  const checking = useRef(false);

  useEffect(() => {
    expectedSignature.current = initialSignature;
  }, [initialSignature]);

  useEffect(() => {
    let disposed = false;

    const syncDirectory = async () => {
      if (disposed || checking.current || document.visibilityState !== "visible") return;
      checking.current = true;
      try {
        const response = await fetch("/api/marketplace/live", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.serverIds)) return;

        const nextSignature = signature(payload.serverIds);
        if (nextSignature !== expectedSignature.current) {
          expectedSignature.current = nextSignature;
          router.refresh();
        }
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
