"use client";
import { useEffect, useRef, useState } from "react";

/** Animates the number inside a value like 21, "$0.187", "95%" or "2.0s" from zero. */
export function CountUp({ value, duration = 1100 }: { value: string | number; duration?: number }) {
  const text = String(value);
  const m = text.match(/-?\d[\d,]*(\.\d+)?/);
  const [shown, setShown] = useState(m ? text.replace(m[0], "0") : text);
  const done = useRef(false);
  useEffect(() => {
    if (!m || done.current) { setShown(text); return; }
    done.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(text); return; }
    const target = Number(m[0].replace(/,/g, ""));
    const decimals = m[1] ? m[1].length - 1 : 0;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = (target * eased).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      setShown(text.replace(m[0], v));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <>{shown}</>;
}
