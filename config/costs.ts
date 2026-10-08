/**
 * Unit costs of the services this app pays for, used only by the cost
 * panel. These are vendor rates, not studio pricing. Update when a
 * vendor changes its rates; every figure is overridable by env.
 */
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const COSTS = {
  /** Claude Opus 5.5, USD per million tokens (input / output). */
  llmInputUsdPerMTok: num(process.env.LLM_INPUT_USD_PER_MTOK, 4),
  llmOutputUsdPerMTok: num(process.env.LLM_OUTPUT_USD_PER_MTOK, 20),
  /** Voice minutes. TODO(vaani): set from the Vaani plan once confirmed. */
  voiceUsdPerMinute: num(process.env.VOICE_USD_PER_MINUTE, 0),
  /** Resend per-email marginal cost (0 on the free tier). */
  emailUsdEach: num(process.env.EMAIL_USD_EACH, 0),
  /** INR per USD, for the cost panel's rupee view. */
  inrPerUsd: num(process.env.INR_PER_USD, 84),
};
