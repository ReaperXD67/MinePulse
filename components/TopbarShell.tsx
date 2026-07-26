"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, RadioTower, X } from "lucide-react";

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
      if (next < 84 || delta < -8 || open) {
        setHidden(false);
      } else if (delta > 8 && next > 150) {
        setHidden(true);
      }
      lastScroll.current = next;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.clientY < 28) setHidden(false);
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
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  }

  return (
    <motion.header
      className={`navigation-shell ${open ? "navigator-open" : ""} ${hidden ? "navigator-hidden" : ""}`}
      initial={false}
      animate={{ y: hidden && !open ? -78 : 0, opacity: hidden && !open ? 0.2 : 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
    >
      <div className="navigator-dock">
        <button
          className="navigator-launcher"
          type="button"
          aria-label={open ? "Close world navigator" : "Open world navigator"}
          aria-expanded={open}
          aria-controls="world-navigator"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="launcher-core" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
          </span>
          <span className="launcher-copy"><strong>KarixMC</strong><small><i className="live-pip" /> Network live</small></span>
          <span className="navigator-command"><RadioTower size={14} /><b>{open ? "Close" : "Explore"}</b>{open ? <X size={18} /> : <Menu size={18} />}</span>
        </button>

        <div className="navigator-scanline" aria-hidden="true"><i /></div>
        <div className="navigator-account-anchor">{account}</div>
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              className="navigator-scrim"
              type="button"
              aria-label="Close world navigator"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              id="world-navigator"
              className="world-navigator"
              aria-label="World navigator"
              onClick={closeFromLink}
              initial={reduceMotion ? false : { opacity: 0, y: -24, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.99 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="navigator-frame">
                <div className="navigator-kicker"><span>KX // REWARD NETWORK</span><i /> <b>LIVE DIRECTORY</b></div>
                <div className="navigator-title"><span>Navigator</span><h2>Pick your next signal.</h2><p>One identity across every verified Minecraft world.</p></div>
                {children}
                <footer className="navigator-footer"><strong>Verified worlds. Shared rewards.</strong><span><i /> Systems operational</span></footer>
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
