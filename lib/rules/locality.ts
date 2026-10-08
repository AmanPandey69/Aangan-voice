import { ALIASES, OUT_OF_AREA, PCMC, PUNE_CITY, PUNE_CONFIRMED_EXTRA } from "@/config/localities";

export type LocalityMatch =
  | { area: "in"; locality: string; zone: "pune" | "pcmc" }
  | { area: "out"; locality: string }
  | { area: "unknown"; locality: string | null };

function normalise(s: string): string {
  return s.toLowerCase().replace(/[.,()/-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Whole-word / whole-phrase containment, so "aundh" doesn't match "maundh". */
function containsPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

/**
 * Look a locality up against the services.md lists. `locality` and `city`
 * are both checked because callers say "Wakad", "Pune" or "Talegaon, near Pune".
 * Out-of-area names win over in-area ones ("Talegaon, near Pune" is out).
 */
export function matchLocality(locality: string | null, city: string | null = null): LocalityMatch {
  const text = normalise([locality, city].filter(Boolean).join(" "));
  if (!text) return { area: "unknown", locality: null };

  const resolved = Object.entries(ALIASES).reduce(
    (acc, [alias, target]) => (containsPhrase(acc, alias) ? `${acc} ${target}` : acc),
    text,
  );

  for (const place of OUT_OF_AREA) if (containsPhrase(resolved, place)) return { area: "out", locality: place };
  for (const place of PCMC) if (containsPhrase(resolved, place)) return { area: "in", locality: place, zone: "pcmc" };
  for (const place of [...PUNE_CITY, ...PUNE_CONFIRMED_EXTRA])
    if (containsPhrase(resolved, place)) return { area: "in", locality: place, zone: "pune" };

  return { area: "unknown", locality: locality ?? city };
}
