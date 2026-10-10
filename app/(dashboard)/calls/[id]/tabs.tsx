"use client";
import { useState, type ReactNode } from "react";

export function Tabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={on === t.key} className={on === t.key ? "on" : ""} onClick={() => setOn(t.key)}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.key} role="tabpanel" hidden={on !== t.key}>{t.content}</div>)}
    </>
  );
}

export function CopyButton({ text, label = "📋 Copy brief" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="act" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ }
    }}>{done ? "✓ Copied" : label}</button>
  );
}
