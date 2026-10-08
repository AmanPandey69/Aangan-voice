/**
 * Service-area lookup, taken from docs/services.md.
 * IN: Pune city and PCMC localities named in services.md.
 * OUT: places services.md names as outside the area, plus other cities.
 * Anything else is "unknown" (see DEFAULT_RULES.unknownLocalityOutcome).
 *
 * To add an "adjoining area" once Nikhil confirms it, append it to
 * PUNE_CONFIRMED_EXTRA — do not edit the services.md lists.
 */

export const PUNE_CITY = [
  "kothrud", "baner", "aundh", "wakad", "koregaon park", "kalyani nagar",
  "viman nagar", "hadapsar", "magarpatta", "nibm", "kondhwa", "undri",
  "shivane", "warje", "erandwane", "deccan",
];

export const PCMC = [
  "pimpri", "chinchwad", "pimple saudagar", "pimple nilakh", "ravet", "hinjewadi",
];

/** Localities confirmed by the studio after go-live. Empty by default. */
export const PUNE_CONFIRMED_EXTRA: string[] = [];

export const OUT_OF_AREA = [
  "talegaon", "lonavala", "nashik", "mumbai", "navi mumbai", "thane",
  "satara", "kolhapur", "nagpur", "aurangabad", "sambhajinagar", "ahmednagar",
  "bangalore", "bengaluru", "hyderabad", "delhi", "gurgaon", "gurugram",
  "noida", "goa", "chennai", "kolkata", "ahmedabad",
];

/** Spelling variants and landmarks that map to a listed locality. */
export const ALIASES: Record<string, string> = {
  "kp": "koregaon park",
  "koregaon": "koregaon park",
  "magarpatta city": "magarpatta",
  "cybercity": "magarpatta",
  "nibm road": "nibm",
  "dahanukar colony": "kothrud",
  "pimple-saudagar": "pimple saudagar",
  "pimple-nilakh": "pimple nilakh",
  "hinjawadi": "hinjewadi",
  "hinjewadi phase 1": "hinjewadi",
  "kalyaninagar": "kalyani nagar",
  "vimannagar": "viman nagar",
  "sunderban": "aundh",
  "pcmc": "pimpri",
  "pimpri chinchwad": "pimpri",
  "talegaon dabhade": "talegaon",
};
