"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export function TopbarShell({ account, children }: { account: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function closeFromLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  }

  return (
    <header className={`navigation-shell ${open ? "navigator-open" : ""}`}>
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
        <span className="launcher-copy"><strong>KarixMC</strong><small><i className="live-pip" /> {open ? "Close navigator" : "Network live"}</small></span>
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>

      <div className="navigator-account-anchor">{account}</div>
      <button className="navigator-scrim" type="button" aria-label="Close world navigator" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />

      <section id="world-navigator" className="world-navigator" aria-hidden={!open} onClick={closeFromLink}>
        <div className="navigator-frame">
          <div className="navigator-kicker"><span>KX // REWARD NETWORK</span><i /> <b>LIVE DIRECTORY</b></div>
          <div className="navigator-title"><span>Navigator</span><h2>Move through the network.</h2></div>
          {children}
          <footer className="navigator-footer"><strong>Verified worlds. Shared rewards.</strong></footer>
        </div>
      </section>
    </header>
  );
}
