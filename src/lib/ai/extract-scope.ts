import { z } from "zod";
import { getAnthropic, ANTHROPIC_MODEL } from "./anthropic";
import { logAiAction } from "./log";
import { computeAnthropicCost } from "@/lib/cost";

export const ClientSignalsSchema = z.object({
  suggested_name: z.string().nullable(),
  suggested_address: z.string().nullable(),
  timeline_mentioned: z.string().nullable(),
  budget_mentioned: z.string().nullable(),
});

export const ScopeItemSchema = z.object({
  description: z.string().min(1),
  category_hint: z.enum([
    "hardscape",
    "landscape",
    "irrigation",
    "lighting",
    "water_feature",
    "turf",
    "labor",
    "other",
  ]),
  quantity_hint: z.number().nullable(),
  unit_hint: z.enum(["sqft", "each", "lf", "hour"]).nullable(),
  notes: z.string().nullable(),
});

export const ExtractedScopeSchema = z.object({
  client_signals: ClientSignalsSchema,
  scope_items: z.array(ScopeItemSchema).min(1),
  flags: z.array(z.string()),
});

export type ExtractedScope = z.infer<typeof ExtractedScopeSchema>;

const SYSTEM_PROMPT = `You are an expert estimator for Greenscape Pro, a premium hardscape and landscape design-build company in Phoenix, AZ. Your job: read a contractor's voice-memo transcript from a site walk and convert it into a structured scope.

Rules:
- Extract every distinct scope item the contractor mentions. Do not invent items.
- "category_hint" must be one of: hardscape, landscape, irrigation, lighting, water_feature, turf, labor, other. Use your best guess; the downstream pricing match will refine it.
- "unit_hint" must be one of: sqft, each, lf, hour, or null when ambiguous.
- Quantities: pull numbers the contractor states ("about 800 square feet", "three palms"). Use null when not stated.
- Flags: short strings (≤ 6 words) calling out anything a reviewer should see: HOA mentioned, rush requested, budget mentioned, large project, unusual material, etc.
- Client signals: pull the customer's name, address, timeline, and budget if the contractor stated them.
- Output JSON ONLY matching the provided schema. No prose, no markdown.`;

const JSON_SCHEMA_DESCRIPTION = `{
  "client_signals": {
    "suggested_name": string | null,
    "suggested_address": string | null,
    "timeline_mentioned": string | null,
    "budget_mentioned": string | null
  },
  "scope_items": [
    {
      "description": string,
      "category_hint": "hardscape" | "landscape" | "irrigation" | "lighting" | "water_feature" | "turf" | "labor" | "other",
      "quantity_hint": number | null,
      "unit_hint": "sqft" | "each" | "lf" | "hour" | null,
      "notes": string | null
    }
  ],
  "flags": string[]
}`;

function tryParseJson(text: string): unknown {
  // Models sometimes wrap JSON in ```json fences; strip them.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

interface ExtractOptions {
  transcription: string;
  proposal_id?: string;
  site_walk_id?: string;
}

interface ExtractResult {
  scope: ExtractedScope;
  attempts: number;
}

async function callOnce(
  transcription: string,
  temperature: number,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    temperature,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcript:\n"""\n${transcription}\n"""\n\nReturn JSON only, matching this schema:\n${JSON_SCHEMA_DESCRIPTION}`,
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

export async function extractScope(
  opts: ExtractOptions,
): Promise<ExtractResult> {
  const start = Date.now();
  let attempts = 0;
  let lastError: string | null = null;
  let totalIn = 0;
  let totalOut = 0;

  for (const temperature of [0.2, 0]) {
    attempts++;
    try {
      const { text, inputTokens, outputTokens } = await callOnce(
        opts.transcription,
        temperature,
      );
      totalIn += inputTokens;
      totalOut += outputTokens;

      const parsed = tryParseJson(text);
      const validated = ExtractedScopeSchema.parse(parsed);

      const duration_ms = Date.now() - start;
      await logAiAction({
        action_type: "extract_scope",
        model: ANTHROPIC_MODEL,
        input_tokens: totalIn,
        output_tokens: totalOut,
        cost_usd: computeAnthropicCost(ANTHROPIC_MODEL, totalIn, totalOut),
        duration_ms,
        success: true,
        proposal_id: opts.proposal_id ?? null,
        site_walk_id: opts.site_walk_id ?? null,
      });
      return { scope: validated, attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Retry once at temperature=0 if the first call returned invalid JSON.
      continue;
    }
  }

  const duration_ms = Date.now() - start;
  await logAiAction({
    action_type: "extract_scope",
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
  throw new Error(`Scope extraction failed after ${attempts} attempts: ${lastError}`);
}
