"use client";
import { useEffect } from "react";

/**
 * One delegated pointer listener for the whole dashboard:
 *  .glow  → light follows the cursor (--mx/--my)
 *  .tilt  → gentle 3D tilt (--rx/--ry)
 *  .hero  → photo drifts with the cursor (parallax)
 * Does nothing for people who prefer reduced motion.
 */
export function FX() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last: { glow?: HTMLElement; tilt?: HTMLElement } = {};
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = e.target as HTMLElement | null;
        const glow = t?.closest<HTMLElement>(".glow") ?? undefined;
        const tilt = t?.closest<HTMLElement>(".tilt") ?? undefined;
        const hero = t?.closest<HTMLElement>(".hero") ?? undefined;
        if (last.tilt && last.tilt !== tilt) { last.tilt.style.setProperty("--rx", "0deg"); last.tilt.style.setProperty("--ry", "0deg"); }
        for (const el of [glow, tilt, hero]) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          if (el === glow) { el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`); }
          if (el === tilt) { el.style.setProperty("--rx", `${(0.5 - y) * 6}deg`); el.style.setProperty("--ry", `${(x - 0.5) * 8}deg`); }
          if (el === hero) el.style.backgroundPosition = `${50 + (x - 0.5) * 6}% ${50 + (y - 0.5) * 6}%`;
        }
        last = { glow, tilt };
      });
    };
    const onLeave = () => { if (last.tilt) { last.tilt.style.setProperty("--rx", "0deg"); last.tilt.style.setProperty("--ry", "0deg"); } };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
