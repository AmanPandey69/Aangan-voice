"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface PaletteItem { id: string; name: string; phone: string; locality: string; verdict: string | null }

/** ⌘K / Ctrl+K: jump to any enquiry or page. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-palette", onOpen); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); inputRef.current?.focus(); } }, [open]);

  const pages = [
    { href: "/calls", label: "Enquiries", sub: "All calls" },
    { href: "/review", label: "Review queue", sub: "Things that need a person" },
    { href: "/costs", label: "Costs & performance", sub: "Spend, answer rate, conversions" },
  ];
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const leads = items.filter((i) => !s || [i.name, i.phone, i.locality, i.verdict ?? ""].some((v) => v.toLowerCase().includes(s))).slice(0, 8)
      .map((i) => ({ href: `/calls/${i.id}`, label: i.name, sub: [i.locality, i.phone, i.verdict ?? "pending"].filter(Boolean).join(" · ") }));
    const pg = pages.filter((p) => !s || p.label.toLowerCase().includes(s));
    return [...pg, ...leads];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, items]);

  if (!open) return null;
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Jump to" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} autoFocus value={q} placeholder="Search customers, localities, pages…" aria-label="Search"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(x + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)); }
            if (e.key === "Enter" && results[sel]) go(results[sel].href);
          }} />
        <ul>
          {results.map((r, i) => (
            <li key={r.href} className={i === sel ? "sel" : undefined} onMouseEnter={() => setSel(i)}>
              <a href={r.href} onClick={(e) => { e.preventDefault(); go(r.href); }}>
                <span className="avatar">{r.label.slice(0, 1).toUpperCase()}</span>
                <span><b>{r.label}</b><div className="muted small">{r.sub}</div></span>
              </a>
            </li>
          ))}
          {results.length === 0 && <li className="muted small" style={{ padding: 14 }}>Nothing matches “{q}”.</li>}
        </ul>
        <div className="hint"><span>↑↓ to move</span><span>↵ to open</span><span>esc to close</span></div>
      </div>
    </div>
  );
}

export function PaletteTrigger() {
  return (
    <button type="button" className="palette-trigger" onClick={() => window.dispatchEvent(new Event("open-palette"))}>
      Search <span className="kbd">⌘K</span>
    </button>
  );
}
