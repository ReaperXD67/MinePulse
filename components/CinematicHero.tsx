"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDownRight, ArrowUpRight, RadioTower, Server, ShieldCheck, WalletCards } from "lucide-react";
import { useRef } from "react";
import { compact, points } from "@/lib/format";

const VoxelHeroScene = dynamic(
  () => import("@/components/VoxelHeroScene").then((module) => module.VoxelHeroScene),
  {
    ssr: false,
    loading: () => <div className="voxel-scene voxel-scene-poster" aria-hidden="true" />
  }
);

type CinematicHeroProps = {
  liveWorlds: number;
  campaignPoints: number;
  members: number;
  verifiedSeconds: number;
  queuedPerks: number;
  canManageServers: boolean;
};

export function CinematicHero({
  liveWorlds,
  campaignPoints,
  members,
  verifiedSeconds,
  queuedPerks,
  canManageServers
}: CinematicHeroProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: hostRef,
    offset: ["start start", "end start"]
  });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -110]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const ledgerY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 80]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 1 : 1.08]);

  return (
    <section className="cinematic-hero" ref={hostRef}>
      <motion.div className="cinematic-world" style={{ scale: sceneScale }}>
        <VoxelHeroScene />
      </motion.div>
      <div className="cinematic-vignette" aria-hidden="true" />
      <div className="cinematic-scan" aria-hidden="true" />

      <div className="cinematic-topline container">
        <span><i /> KX NETWORK / ONLINE</span>
        <span className="hero-coordinate">REAL PLAY // PORTABLE VALUE</span>
        <span>{liveWorlds.toString().padStart(2, "0")} LIVE WORLDS</span>
      </div>

      <motion.div className="cinematic-copy container" style={{ y: copyY, opacity: copyOpacity }}>
        <p className="cinematic-kicker"><ShieldCheck size={15} /> Verified Minecraft economy</p>
        <h1 aria-label="KarixMC">
          <span>KARIX</span>
          <em>MC</em>
        </h1>
        <div className="cinematic-thesis" aria-label="Play. Earn. Everywhere.">
          <span>PLAY.</span>
          <span>EARN.</span>
          <strong>EVERYWHERE.</strong>
        </div>
        <p className="cinematic-lead">
          Your time should travel with you. Join verified worlds, earn while you are genuinely active, then spend the same wallet on ranks, items, and perks across the network.
        </p>
        <div className="cinematic-actions">
          <motion.div whileHover={reduceMotion ? undefined : { x: 6 }} whileTap={{ scale: 0.98 }}>
            <Link className="hero-primary-action" href="#servers"><span>Enter the atlas</span><ArrowDownRight size={21} /></Link>
          </motion.div>
          <motion.div whileHover={reduceMotion ? undefined : { x: 4 }} whileTap={{ scale: 0.98 }}>
            <Link className="hero-secondary-action" href="/account"><WalletCards size={17} /> Open wallet</Link>
          </motion.div>
          <motion.div whileHover={reduceMotion ? undefined : { x: 4 }} whileTap={{ scale: 0.98 }}>
            <Link className="hero-secondary-action" href={canManageServers ? "/account#servers" : "/login"}>
              {canManageServers ? <Server size={17} /> : <RadioTower size={17} />}
              {canManageServers ? "Creator studio" : "List a server"}
            </Link>
          </motion.div>
        </div>
      </motion.div>

      <motion.aside className="cinematic-ledger" style={{ y: ledgerY }} aria-label="Live network telemetry">
        <div className="ledger-title"><span>LIVE / LEDGER</span><i /></div>
        <dl>
          <div><dt>Campaign signal</dt><dd>{points(campaignPoints)}</dd></div>
          <div><dt>Network members</dt><dd>{members}</dd></div>
          <div><dt>Verified play</dt><dd>{compact(verifiedSeconds)}s</dd></div>
          <div><dt>Queued perks</dt><dd>{queuedPerks}</dd></div>
        </dl>
        <Link href="#servers">See worlds <ArrowUpRight size={15} /></Link>
      </motion.aside>

      <div className="cinematic-footerline">
        <span>ANTI-AFK VERIFIED</span><span>ONE WALLET</span><span>IN-GAME DELIVERY</span><span>SERVER FUNDED</span>
      </div>
    </section>
  );
}
