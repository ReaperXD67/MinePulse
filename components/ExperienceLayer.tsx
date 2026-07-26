"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export function ExperienceLayer() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    let lenis: Lenis | null = null;
    let pointerFrame = 0;
    let progressFrame = 0;

    if (!reducedMotion.matches && finePointer.matches) {
      lenis = new Lenis({
        autoRaf: true,
        anchors: true,
        lerp: 0.085,
        smoothWheel: true,
        wheelMultiplier: 0.82
      });
      root.dataset.smoothScroll = "true";
    }

    const updateProgress = () => {
      cancelAnimationFrame(progressFrame);
      progressFrame = requestAnimationFrame(() => {
        const available = document.documentElement.scrollHeight - window.innerHeight;
        const progress = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0;
        root.style.setProperty("--kx-scroll-progress", progress.toFixed(4));
      });
    };

    const updatePointer = (event: PointerEvent) => {
      if (!finePointer.matches) return;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        root.style.setProperty("--kx-pointer-x", `${event.clientX}px`);
        root.style.setProperty("--kx-pointer-y", `${event.clientY}px`);
      });
    };

    updateProgress();

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    window.addEventListener("pointermove", updatePointer, { passive: true });

    return () => {
      lenis?.destroy();
      cancelAnimationFrame(pointerFrame);
      cancelAnimationFrame(progressFrame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
      window.removeEventListener("pointermove", updatePointer);
      root.style.removeProperty("--kx-pointer-x");
      root.style.removeProperty("--kx-pointer-y");
      root.style.removeProperty("--kx-scroll-progress");
      delete root.dataset.smoothScroll;
    };
  }, []);

  return (
    <div className="experience-layer" aria-hidden="true">
      <div className="experience-pointer" />
      <div className="experience-grain" />
      <div className="experience-scroll"><i /></div>
    </div>
  );
}
