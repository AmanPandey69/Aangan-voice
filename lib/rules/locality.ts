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

  // Speech-to-text often mishears place names ("Banir" for Baner). Accept a near-miss
  // (one letter off) when both the heard word and the place name have five or more letters.
  const words = resolved.split(" ");
  const near = (place: string) => {
    const n = place.split(" ").length;
    if (place.replace(/ /g, "").length < 5) return false;
    for (let i = 0; i + n <= words.length; i++) {
      const said = words.slice(i, i + n).join(" ");
      if (said.replace(/ /g, "").length >= 5 && editDistance(said, place) <= 1) return true;
    }
    return false;
  };
  for (const place of OUT_OF_AREA) if (near(place)) return { area: "out", locality: place };
  for (const place of PCMC) if (near(place)) return { area: "in", locality: place, zone: "pcmc" };
  for (const place of [...PUNE_CITY, ...PUNE_CONFIRMED_EXTRA]) if (near(place)) return { area: "in", locality: place, zone: "pune" };

  return { area: "unknown", locality: locality ?? city };
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
