import { describe, expect, it } from "vitest";
import { loadFixtures } from "@/fixtures/load";
import { evaluate } from "@/lib/rules/engine";

/**
 * Replays T01–T20 through the rules engine using the hand-labelled
 * extraction in each fixture. (`npm run replay:live` runs the same
 * transcripts through the real LLM extractor and compares.)
 *
 * T10 expects "escalate" rather than "declined": the studio chose to
 * never auto-decline on a volunteered budget (DEFAULT_RULES.budgetConcernOutcome).
 */
const EXPECTED: Record<string, string> = {
  T01: "qualified", T02: "qualified", T05: "qualified", T06: "qualified", T11: "qualified",
  T12: "qualified", T13: "qualified", T14: "qualified", T15: "qualified", T16: "qualified",
  T17: "qualified", T20: "qualified",
  T03: "declined", T04: "declined", T07: "declined", T18: "declined", T19: "declined",
  T09: "escalate", T10: "escalate",
  T08: "missed",
};

const fixtures = loadFixtures();

describe("replay T01–T20", () => {
  it("has all twenty fixtures", () => expect(fixtures.map((f) => f.id)).toEqual(Object.keys(EXPECTED).sort()));

  for (const fx of fixtures) {
    it(`${fx.id} → ${EXPECTED[fx.id]}`, () => {
      expect(fx.expected).toBe(EXPECTED[fx.id]);
      if (EXPECTED[fx.id] === "missed") {
        expect(fx.calls.every((c) => c.status === "missed")).toBe(true);
        expect(fx.facts).toBeNull();
        return;
      }
      const lastCall = fx.calls[fx.calls.length - 1];
      const e = evaluate(fx.facts!, { now: new Date(lastCall.started_at), mode: "final" });
      expect(e.verdict, `${fx.id}: ${e.reason}`).toBe(EXPECTED[fx.id]);
    });
  }

  it("T09 is urgent, T10 is not", () => {
    const by = Object.fromEntries(fixtures.map((f) => [f.id, f]));
    const at = (id: string) => new Date(by[id].calls[0].started_at);
    expect(evaluate(by.T09.facts!, { now: at("T09") }).urgent).toBe(true);
    expect(evaluate(by.T10.facts!, { now: at("T10") }).urgent).toBe(false);
  });

  it("T12 and T05 are priority; T02 and T13 record price_asked", () => {
    const by = Object.fromEntries(fixtures.map((f) => [f.id, f]));
    const flags = (id: string) => evaluate(by[id].facts!, { now: new Date(by[id].calls[0].started_at) }).flags;
    expect(flags("T12")).toContain("priority");
    expect(flags("T05")).toContain("priority");
    expect(flags("T02")).toContain("price_asked");
    expect(flags("T13")).toContain("price_asked");
    expect(flags("T16")).toContain("handle_with_care");
    expect(flags("T18")).toContain("small_commercial");
  });

  it("T17 is two calls from one number (dedupe fixture)", () => {
    const t17 = fixtures.find((f) => f.id === "T17")!;
    expect(t17.calls.map((c) => c.status)).toEqual(["dropped", "completed"]);
  });
});
