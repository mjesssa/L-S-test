// Per-model token pricing in USD. Source: vendor public pricing as of May 2026.
// Used by the AI-action logger to populate ai_actions.cost_usd.
// Numbers are USD per token (not per 1M) so the call sites stay simple.

interface ModelPricing {
  input: number;  // USD per input token
  output: number; // USD per output token
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4 family — $3 / MTok input, $15 / MTok output
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-sonnet-4-7": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  // Claude Opus 4 family — $15 / MTok input, $75 / MTok output
  "claude-opus-4-7": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  // Haiku 4.5 — $1 / MTok input, $5 / MTok output
  "claude-haiku-4-5-20251001": { input: 1 / 1_000_000, output: 5 / 1_000_000 },
};

// Whisper bills per audio minute, not per token. Tracked separately.
const WHISPER_PRICE_PER_MINUTE = 0.006;

export function computeAnthropicCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING["claude-sonnet-4-20250514"];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export function computeWhisperCost(audioMinutes: number): number {
  return Math.max(0, audioMinutes) * WHISPER_PRICE_PER_MINUTE;
}

export const PRICING_NOTE =
  "Pricing assumes Sonnet 4 ($3/$15 per MTok in/out) and Whisper-1 ($0.006/min). Update src/lib/cost.ts when models change.";
