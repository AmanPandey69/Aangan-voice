import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentLines, findPriceLeaks } from "@/lib/guard/price-guard";
import { CLEAN, LEAKY } from "@/fixtures/adversarial/agent-lines";
import * as copy from "@/lib/rules/copy";
import { evaluate } from "@/lib/rules/engine";
import { loadFixtures } from "@/fixtures/load";

/**
 * Fails the build if any price-like content appears in agent output or
 * anything we generate. vercel-build runs the test suite before next build.
 */
describe("price guard — adversarial agent output", () => {
  it.each(LEAKY)("catches: %s", (line) => expect(findPriceLeaks(line).length).toBeGreaterThan(0));
  it.each(CLEAN)("allows: %s", (line) => expect(findPriceLeaks(line)).toEqual([]));

  it("flags leaks inside a full transcript but only on agent lines", () => {
    const transcript = [
      "Caller: My budget is 5 lakh, can you do it?",
      "Agent: Thanks for sharing that.",
      "Caller: Seriously, just a ballpark per sq ft?",
      "Agent: Fine, it's roughly 2,000 per sq ft.",
    ].join("\n");
    const leaks = agentLines(transcript).flatMap(findPriceLeaks);
    expect(leaks.length).toBeGreaterThan(0);
    expect(agentLines(transcript)[0]).toBe("Thanks for sharing that.");
  });

  it("catches the historic front-desk slips in T10 and T13", () => {
    const by = Object.fromEntries(loadFixtures().map((f) => [f.id, f]));
    const lines = (id: string) => by[id].calls.flatMap((c) => c.turns.filter((t) => t.speaker === "agent").map((t) => t.text));
    expect(lines("T10").flatMap(findPriceLeaks).length).toBeGreaterThan(0); // repeated "1 to 1.5 lakh"
    expect(lines("T13").flatMap(findPriceLeaks).length).toBeGreaterThan(0); // "3× the cost"
  });
});

describe("price guard — everything we say", () => {
  it("every fixed line the agent may speak is clean", () => {
    const lines = Object.values(copy).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v)));
    for (const l of lines) expect(findPriceLeaks(l), l).toEqual([]);
  });

  it("the pricing line is exactly the approved wording", () =>
    expect(copy.PRICING_LINE).toBe("Pricing depends on the site, the materials you choose, and the scope. Your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like."));

  it("engine output (reasons, say, questions) never carries a price", () => {
    for (const fx of loadFixtures().filter((f) => f.facts)) {
      const e = evaluate(fx.facts!, { now: new Date(fx.calls[0].started_at) });
      for (const s of [e.say, e.question, e.reason, ...e.uncertainties]) expect(findPriceLeaks(s), `${fx.id}: ${s}`).toEqual([]);
    }
  });

  it("the agent system prompt is clean", () => {
    const p = path.join(process.cwd(), "agent", "system-prompt.md");
    expect(fs.existsSync(p), "agent/system-prompt.md must exist").toBe(true);
    expect(findPriceLeaks(fs.readFileSync(p, "utf8"))).toEqual([]);
  });

  it("no figure from the internal pricing guide appears in the repo's outbound text (runs only if the guide is present locally)", () => {
    const guide = path.join(process.cwd(), "docs", "pricing.md");
    if (!fs.existsSync(guide)) return;
    const figures = [...fs.readFileSync(guide, "utf8").matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => m[0]).filter((n) => n.replace(/,/g, "").length >= 3);
    const outbound = [fs.readFileSync(path.join(process.cwd(), "agent", "system-prompt.md"), "utf8"), ...Object.values(copy).flat().map(String)].join("\n");
    for (const f of figures) expect(outbound.includes(f), f).toBe(false);
  });
});

describe("agent prompt content", () => {
  const prompt = fs.readFileSync(path.join(process.cwd(), "agent", "system-prompt.md"), "utf8");
  it("contains the exact pricing line, AI + recording disclosure, and the closing lines", () => {
    for (const line of [copy.PRICING_LINE, copy.DISCLOSURE_LINE, copy.GRACEFUL_CLOSE, copy.BUDGET_CLOSE, copy.ESCALATION_LINE, copy.PRICING_REFUSAL_INTERNAL_DOCS])
      expect(prompt).toContain(line);
  });
  it("forbids asking for budget, payment details and IDs, and never says unqualified", () => {
    expect(prompt).toMatch(/Never ask about budget/);
    expect(prompt).toMatch(/Never collect payment details/);
    expect(prompt).toMatch(/Never tell a caller they are unqualified/);
  });
  it("asks the five criteria questions", () => {
    for (const k of ["real_project", "service_area", "timeline", "decision_maker"] as const) expect(prompt).toContain(copy.QUESTIONS[k]);
  });
});
