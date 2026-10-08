import fs from "node:fs";
import path from "node:path";
import { emptyFacts, type LeadFacts } from "@/lib/domain/lead";

export interface FixtureTurn { speaker: "agent" | "caller"; text: string }
export interface FixtureCall {
  call_id: string;
  started_at: string;
  duration_sec: number;
  status: "completed" | "dropped" | "missed";
  turns: FixtureTurn[];
}
export interface Fixture {
  id: string;
  caller_phone: string;
  header: string;
  notes: string[];
  calls: FixtureCall[];
  expected: "qualified" | "declined" | "escalate" | "missed";
  /** Hand-labelled extraction (what a correct LLM extraction should return). */
  facts: LeadFacts | null;
}

const DIR = path.join(process.cwd(), "fixtures", "transcripts");

export function loadFixtures(): Fixture[] {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return { ...raw, facts: raw.facts ? emptyFacts(raw.facts) : null } as Fixture;
  });
}

export function transcriptText(call: FixtureCall): string {
  return call.turns.map((t) => `${t.speaker === "agent" ? "Agent" : "Caller"}: ${t.text}`).join("\n");
}
