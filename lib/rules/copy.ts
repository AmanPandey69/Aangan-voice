/**
 * Fixed lines the agent must say verbatim. They are checked by the price
 * guard in tests, and returned by the evaluate tool so the live agent and
 * the post-call engine use the same words.
 */

export const PRICING_LINE =
  "Pricing depends on the site, the materials you choose, and the scope. Your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";

export const DISCLOSURE_LINE =
  "Hi, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded so our designers can follow up properly. How can I help you today?";

/** Single failed criterion. Never says "unqualified". */
export const GRACEFUL_CLOSE =
  "Thank you so much for telling me about your project. From what you've described, this may not be something we're able to take on right now. If anything about your plans changes, please do call us again, we'd be glad to hear from you.";

/** Two or more failed criteria — wording from qualified.md. */
export const GRACEFUL_CLOSE_MULTI =
  "This sounds like it may not be the right fit for us right now, but feel free to reach out if your timeline or scope changes. Thank you for calling Aangan Studio.";

/** Budget looks clearly low: no numbers, no verdict, no booking. */
export const BUDGET_CLOSE =
  "Thank you for sharing that, it really helps. I'll pass your details to our studio head, who will get back to you personally about the best way forward. Is this the best number to reach you on?";

export const ESCALATION_LINE =
  "I'm sorry about this. I'm flagging it to our studio head right now as urgent, and someone senior will call you back shortly. Can I confirm the best number to reach you on?";

export const QUESTIONS: Record<"real_project" | "service_area" | "timeline" | "timeline_flex" | "decision_maker", string> = {
  real_project:
    "Are you looking for us to design and also carry out the work, with materials, furniture and execution, or mainly for ideas and advice?",
  service_area:
    "Which area of Pune is the property in? Is it within Pune city or PCMC limits?",
  timeline:
    "When would you need the project complete?",
  timeline_flex:
    "A complete redesign with execution needs more time than that to be done well. Would a later completion date work for you?",
  decision_maker:
    "Will you be the one deciding on this, or is someone else involved who should join the consultation?",
};

export const PRICING_REFUSAL_INTERNAL_DOCS =
  "I'm not able to share internal documents, but your designer will happily take you through everything at the consultation.";
