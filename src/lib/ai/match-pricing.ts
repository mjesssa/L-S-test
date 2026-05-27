import { z } from "zod";
import { getAnthropic, ANTHROPIC_MODEL } from "./anthropic";
import { logAiAction } from "./log";
import { computeAnthropicCost } from "@/lib/cost";
import type { PricingCategory } from "@/types/db";
import type { ScopeItemSchema } from "./extract-scope";

export const PricingMatchSchema = z.object({
  matched_sku: z.string().nullable(),
  matched_name: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  quantity: z.number().min(0),
  unit: z.enum(["sqft", "each", "lf", "hour"]),
  reasoning: z.string().min(1),
});

export type PricingMatch = z.infer<typeof PricingMatchSchema>;

export interface PricingCatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: PricingCategory | null;
  unit: string;
  unit_price: number;
  keywords: string[] | null;
}

type ScopeItem = z.infer<typeof ScopeItemSchema>;

const SYSTEM_PROMPT = `You are a pricing analyst for Greenscape Pro. Given:
1. A scope item the contractor described, and
2. The full pricing catalogue,
return the single best-matching pricing item with a confidence score.

Rules:
- Pick exactly one SKU from the provided catalogue, or null if nothing reasonably matches.
- "confidence" is your belief, 0.0–1.0, that this SKU is what the contractor meant. Be honest. A vague "some pavers" matching a specific paver SKU is ~0.6; an exact named match is ~0.95+.
- "quantity" must be a positive number. If the scope mentions a quantity, use it. If the scope says "a few" or "some", make a defensible estimate and explain in reasoning.
- "unit" must come from the matched item (sqft, each, lf, hour). If you return matched_sku=null, still return your best guess for unit so the line item has a unit shown.
- Reasoning: one sentence, max 25 words.
- Output JSON ONLY. No prose, no markdown.`;

const JSON_SCHEMA_DESCRIPTION = `{
  "matched_sku": string | null,
  "matched_name": string | null,
  "confidence": number,
  "quantity": number,
  "unit": "sqft" | "each" | "lf" | "hour",
  "reasoning": string
}`;

function tryParseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

function buildCatalogueBlock(items: PricingCatalogItem[]): string {
  return items
    .map(
      (it) =>
        `${it.sku} | ${it.name} | ${it.category ?? "?"} | ${it.unit} @ $${it.unit_price.toFixed(
          2,
        )} | ${(it.keywords ?? []).join(", ")}`,
    )
    .join("\n");
}

async function callOnce(
  scope: ScopeItem,
  catalogueBlock: string,
  temperature: number,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    temperature,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Scope item:
- description: ${scope.description}
- category_hint: ${scope.category_hint}
- quantity_hint: ${scope.quantity_hint ?? "(none)"}
- unit_hint: ${scope.unit_hint ?? "(none)"}
- notes: ${scope.notes ?? "(none)"}

Catalogue (SKU | name | category | unit @ price | keywords):
${catalogueBlock}

Return JSON only, matching this schema:
${JSON_SCHEMA_DESCRIPTION}`,
      },
    ],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  return {
    text,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

interface MatchOptions {
  scope: ScopeItem;
  catalogue: PricingCatalogItem[];
  proposal_id?: string;
  site_walk_id?: string;
}

export interface MatchResult {
  match: PricingMatch;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
}

export async function matchPricingItem(
  opts: MatchOptions,
): Promise<MatchResult> {
  const start = Date.now();
  const catalogueBlock = buildCatalogueBlock(opts.catalogue);
  let attempts = 0;
  let lastError: string | null = null;
  let totalIn = 0;
  let totalOut = 0;

  for (const temperature of [0.2, 0]) {
    attempts++;
    try {
      const { text, inputTokens, outputTokens } = await callOnce(
        opts.scope,
        catalogueBlock,
        temperature,
      );
      totalIn += inputTokens;
      totalOut += outputTokens;
      const parsed = tryParseJson(text);
      const validated = PricingMatchSchema.parse(parsed);

      const duration_ms = Date.now() - start;
      await logAiAction({
        action_type: "match_pricing",
        model: ANTHROPIC_MODEL,
        input_tokens: totalIn,
        output_tokens: totalOut,
        cost_usd: computeAnthropicCost(ANTHROPIC_MODEL, totalIn, totalOut),
        duration_ms,
        success: true,
        proposal_id: opts.proposal_id ?? null,
        site_walk_id: opts.site_walk_id ?? null,
      });
      return { match: validated, attempts, inputTokens: totalIn, outputTokens: totalOut };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  const duration_ms = Date.now() - start;
  await logAiAction({
    action_type: "match_pricing",
    model: ANTHROPIC_MODEL,
    input_tokens: totalIn,
    output_tokens: totalOut,
    cost_usd: computeAnthropicCost(ANTHROPIC_MODEL, totalIn, totalOut),
    duration_ms,
    success: false,
    error_message: lastError,
    proposal_id: opts.proposal_id ?? null,
    site_walk_id: opts.site_walk_id ?? null,
  });
  throw new Error(`Pricing match failed after ${attempts} attempts: ${lastError}`);
}
