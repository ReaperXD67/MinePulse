"use client";

import { useEffect, useState } from "react";
import { Gamepad2, RadioTower, Users, Zap } from "lucide-react";
import type { ServerPresence } from "@/lib/server-presence";
import { BRIDGE_ONLINE_WINDOW_MS } from "@/lib/server-liveness";
import styles from "./ServerPresenceStats.module.css";

export function ServerPresenceStats({ presence, compact = false }: { presence: ServerPresence; compact?: boolean }) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = window.setInterval(tick, 10_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const signalAt = Math.min(new Date(presence.checkedAt).getTime(), new Date(presence.sampledAt ?? presence.checkedAt).getTime());
  const expired = clock > signalAt + BRIDGE_ONLINE_WINDOW_MS;
  const live = presence.bridgeState === "online" && !expired;
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
  const onlineLabel = presence.onlineSource === "linked" ? "Linked online" : "Online now";
  const metrics = [
    { label: onlineLabel, value: live ? presence.onlinePlayers : null, Icon: RadioTower, help: presence.onlineSource === "plugin" ? "All Minecraft players" : "Linked accounts only" },
    { label: "Playing now", value: live ? presence.playingPlayers : null, Icon: Gamepad2, help: "Linked · seen in last 2 min" },
    { label: "Earning now", value: live ? presence.earningPlayers : null, Icon: Zap, help: "Rewarded in last 2 min" },
    { label: "Registered here", value: presence.registeredPlayers, Icon: Users, help: "Linked players who joined" }
  ];

  return (
    <section className={`${styles.presence} ${compact ? styles.compact : ""}`} aria-label="Players on this server">
      <div className={styles.heading}>
        <strong>{compact ? "Players in this world" : "Players on this server"}</strong>
        <span className={live ? styles.live : styles.offline}><i aria-hidden="true" />{live ? "Live" : "Awaiting update"}</span>
      </div>
      <dl className={styles.metrics}>
        {metrics.map(({ label, value, Icon, help }) => (
          <div key={label}>
            <dt><Icon size={14} aria-hidden="true" />{label}</dt>
            <dd>{number(value)}</dd>
            <small>{help}</small>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        {!live ? "Live counts are unavailable until the next server update." : presence.onlineSource === "linked" ? "This bridge reports linked players. Update it to include everyone online." : "Updates automatically. Playing and earning use a 2-minute activity window."}
      </p>
      {!compact ? <p className={styles.definition}>Registered here counts unique KarixMC accounts that have played on this server, not every website member or Minecraft login.</p> : null}
    </section>
  );
}
