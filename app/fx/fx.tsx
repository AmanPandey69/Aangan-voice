"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Page motion for the dashboard:
 *  - html.scrolled once the page moves (the floating nav tightens)
 *  - hero photos/videos drift slower than the page (parallax)
 *  - .reveal sections fade up as they scroll into view
 *  - .rail rows can be dragged sideways with the mouse
 * Nothing moves for people who prefer reduced motion.
 */
export function FX() {
  const path = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.add("fx");

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.classList.toggle("scrolled", window.scrollY > 24);
        if (reduce) return;
        document.querySelectorAll<HTMLElement>(".hero, .vhero").forEach((h) => {
          const r = h.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          h.style.setProperty("--py", `${Math.round(-r.top * 0.18)}px`);
        });
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => (reduce ? el.classList.add("in") : io.observe(el)));

    const cleanups: (() => void)[] = [];
    document.querySelectorAll<HTMLElement>(".rail").forEach((rail) => {
      let down = false, startX = 0, startLeft = 0, moved = false;
      const onDown = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; down = true; moved = false; startX = e.clientX; startLeft = rail.scrollLeft; };
      const onMove = (e: PointerEvent) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) { moved = true; rail.classList.add("dragging"); }
        rail.scrollLeft = startLeft - dx;
      };
      const onUp = () => { down = false; setTimeout(() => rail.classList.remove("dragging"), 0); };
      const onClick = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); } };
      rail.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      rail.addEventListener("click", onClick, true);
      cleanups.push(() => { rail.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); rail.removeEventListener("click", onClick, true); });
    });

    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); io.disconnect(); cleanups.forEach((c) => c()); };
  }, [path]);

  return null;
}
