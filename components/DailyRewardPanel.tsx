"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Sparkles, Trophy } from "lucide-react";
import { points } from "@/lib/format";
import { nextDailyClaimAt, nextLevelProgress } from "@/lib/progression";

type DailyRewardPanelProps = {
  walletPoints: number;
  level: number;
  lifetimeEarnedPoints: number;
  lastDailyClaimAt: string | null;
};

export function DailyRewardPanel({
  walletPoints,
  level,
  lifetimeEarnedPoints,
  lastDailyClaimAt
}: DailyRewardPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const nextClaim = useMemo(() => nextDailyClaimAt(lastDailyClaimAt), [lastDailyClaimAt]);
  const locked = Boolean(nextClaim && nextClaim.getTime() > Date.now());
  const progress = nextLevelProgress(level, lifetimeEarnedPoints);

  async function claimReward() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/account/daily-reward", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      const fallback = payload.nextClaimAt
        ? `Next claim at ${new Date(payload.nextClaimAt).toLocaleString()}`
        : "Claim failed";
      setMessage(payload.error || fallback);
      return;
    }

    setMessage(payload.message || "Reward claimed");
    router.refresh();
  }

  return (
    <section className="progression-panel">
      <div className="level-console">
        <div className="level-ring" style={{ "--progress": `${progress.percent}%` } as React.CSSProperties}>
          <span>LVL</span>
          <strong>{level}</strong>
        </div>
        <div>
          <p className="eyebrow"><Trophy size={14} /> Player level</p>
          <h2>{points(lifetimeEarnedPoints)} verified points earned</h2>
          <p>
            {points(progress.neededPoints)} more verified points to level {progress.nextLevel} and unlock a{" "}
            {points(progress.nextRewardPoints)} bonus.
          </p>
          <div className="progress-track" aria-label={`Level progress ${progress.percent}%`}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>

      <div className="daily-claim-card">
        <div>
          <p className="eyebrow"><Sparkles size={14} /> 20-hour claim</p>
          <h2>{points(walletPoints)} wallet</h2>
          <p>Claim a random network bonus between 1,000 and 5,000 points.</p>
          {locked ? <small>Next claim: {nextClaim?.toLocaleString()}</small> : <small>Ready now</small>}
          <p className="toast-line" aria-live="polite">{message}</p>
        </div>
        <button className="solid-button claim-button" disabled={busy || locked} type="button" onClick={claimReward}>
          <Gift size={17} /> {locked ? "Cooling down" : "Claim reward"}
        </button>
      </div>
    </section>
  );
}
