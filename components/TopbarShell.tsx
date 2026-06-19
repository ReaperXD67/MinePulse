"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function TopbarShell({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    function update() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const scrollingDown = currentY > lastY + 8;
        const scrollingUp = currentY < lastY - 8;

        setArmed(currentY > 24);

        if (scrollingDown && currentY > 140) {
          setHidden(true);
        }

        if (scrollingUp || currentY < 70) {
          setHidden(false);
        }

        lastY = currentY;
      });
    }

    function revealFromKeyboard(event: KeyboardEvent) {
      if (event.altKey) {
        setHidden(false);
      }
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("keydown", revealFromKeyboard);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("keydown", revealFromKeyboard);
    };
  }, []);

  return (
    <header className={`topbar ${armed ? "topbar-armed" : ""} ${hidden ? "topbar-hidden" : ""}`}>
      {children}
    </header>
  );
}
