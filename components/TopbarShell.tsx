"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, Menu, X } from "lucide-react";

export function TopbarShell({ account, children }: { account: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScroll = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onScroll() {
      const next = window.scrollY;
      const delta = next - lastScroll.current;
      if (next < 72 || delta < -7 || open) setHidden(false);
      else if (delta > 7 && next > 140) setHidden(true);
      lastScroll.current = next;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.clientY < 26) setHidden(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [open]);

  function closeFromLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <motion.header
      className={`navigation-shell nav-v2 ${open ? "navigator-open" : ""} ${hidden ? "navigator-hidden" : ""}`}
      initial={false}
      animate={{ y: hidden && !open ? -88 : 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
    >
      <div className="nav-v2-line">
        <Link className="nav-v2-brand" href="/" aria-label="KarixMC home">
          <span className="nav-v2-mark" aria-hidden="true">K</span>
          <span><strong>KARIX</strong><em>MC</em></span>
        </Link>

        <nav className="nav-v2-shortcuts" aria-label="Primary navigation">
          <Link href="/#servers">Worlds</Link>
          <Link href="/plugin">Bridge</Link>
          <Link href="/account">Wallet</Link>
        </nav>

        <div className="nav-v2-status" aria-hidden="true"><i /><span>Network live</span></div>
        <div className="navigator-account-anchor">{account}</div>
        <button
          className="nav-v2-menu navigator-launcher"
          type="button"
          aria-label={open ? "Close world navigator" : "Open world navigator"}
          aria-expanded={open}
          aria-controls="world-navigator"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{open ? "Close" : "Index"}</span>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.section
            id="world-navigator"
            className="world-navigator nav-v2-overlay"
            aria-label="World navigator"
            onClick={closeFromLink}
            initial={reduceMotion ? false : { clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={reduceMotion ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: reduceMotion ? 0 : 0.65, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="nav-v2-ambient" aria-hidden="true"><i /><i /><i /></div>
            <div className="navigator-frame">
              <div className="nav-v2-overlay-head">
                <span>KX / NETWORK INDEX</span>
                <p>Pick a destination.</p>
              </div>
              {children}
              <footer className="navigator-footer">
                <strong>One identity. Every verified world.</strong>
                <a href="#servers">Start exploring <ArrowDownRight size={18} /></a>
              </footer>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
