import { getAnthropic, ANTHROPIC_MODEL } from "./anthropic";
import { logAiAction } from "./log";
import { computeAnthropicCost } from "@/lib/cost";

export interface ProposalLineForWrite {
  scope_description: string;
  matched_name: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
}

export interface WriteProposalOptions {
  client_name: string;
  client_address: string | null;
  scope_summary_hint: string | null;
  line_items: ProposalLineForWrite[];
  subtotal: number;
  tax: number;
  total: number;
  flags: string[];
  proposal_id: string;
  site_walk_id?: string;
}

const SYSTEM_PROMPT = `You write proposals for Greenscape Pro, a premium hardscape and landscape design-build company in Phoenix, AZ.

Voice: confident, premium, specific. Like Marcus, the owner — direct but warm. Short declarative sentences. Lead with what we're building, not pleasantries. No filler like "hope this finds you well". No em dashes. No bullet padding.

Output a Markdown proposal with this exact structure (use these headings):

# Proposal for {Client Name}

## Project Overview
One short paragraph (2–3 sentences) describing what we're building, in plain language. Reference specifics from the scope.

## Scope of Work
A Markdown table with columns: Item | Qty | Unit | Unit Price | Total
One row per line item. Right-align money columns by using $ formatting.

## Investment
- Subtotal: $X,XXX
- Tax: $X (use $0 if zero)
- **Total: $XX,XXX**

## Timeline
A short paragraph. Typical project of this size runs 2–6 weeks. If flags mention HOA or rush, address that here in one sentence.

## Payment Terms
Two sentences. 50% deposit to schedule, 50% on completion. Deposit due before crew start.

## Next Steps
One short paragraph telling the customer what happens after they approve.

Do not include cover-letter pleasantries or signatures. Do not add disclaimers about quotes being estimates. Do not invent line items. Do not change quantities or prices.

Markdown only. No code fences.`;

interface WriteResult {
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

async function callOnce(
  body: string,
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
    messages: [{ role: "user", content: body }],
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

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export async function writeProposal(
  opts: WriteProposalOptions,
): Promise<WriteResult> {
  const start = Date.now();
  const lineRows = opts.line_items
    .map(
      (l) =>
        `- ${l.matched_name ?? l.scope_description}: ${l.quantity} ${l.unit ?? ""} @ ${formatMoney(
          l.unit_price,
        )} = ${formatMoney(l.line_total)}`,
    )
    .join("\n");

  const body = `Client: ${opts.client_name}${
    opts.client_address ? `\nAddress: ${opts.client_address}` : ""
  }

Scope items (use these names, quantities, prices verbatim in the Scope of Work table):
${lineRows}

Subtotal: ${formatMoney(opts.subtotal)}
Tax: ${formatMoney(opts.tax)}
Total: ${formatMoney(opts.total)}

Reviewer flags (use only to inform timeline/scope sections, do NOT enumerate them in the proposal):
${opts.flags.length > 0 ? opts.flags.map((f) => `- ${f}`).join("\n") : "(none)"}

${opts.scope_summary_hint ? `Original scope summary hint: ${opts.scope_summary_hint}` : ""}

Write the proposal now.`;

  let attempts = 0;
  let lastError: string | null = null;
  let totalIn = 0;
  let totalOut = 0;

  for (const temperature of [0.3, 0]) {
    attempts++;
    try {
      const { text, inputTokens, outputTokens } = await callOnce(
        body,
        temperature,
      );
      totalIn += inputTokens;
      totalOut += outputTokens;
      const trimmed = text.trim();
      if (!trimmed || !trimmed.includes("## Investment")) {
        throw new Error("proposal markdown missing required sections");
      }

      const duration_ms = Date.now() - start;
      await logAiAction({
        action_type: "write_proposal",
        model: ANTHROPIC_MODEL,
        input_tokens: totalIn,
        output_tokens: totalOut,
        cost_usd: computeAnthropicCost(ANTHROPIC_MODEL, totalIn, totalOut),
        duration_ms,
        success: true,
        proposal_id: opts.proposal_id,
        site_walk_id: opts.site_walk_id ?? null,
      });
      return {
        markdown: trimmed,
        inputTokens: totalIn,
        outputTokens: totalOut,
        attempts,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  const duration_ms = Date.now() - start;
  await logAiAction({
    action_type: "write_proposal",
    model: ANTHROPIC_MODEL,
    input_tokens: totalIn,
    output_tokens: totalOut,
    cost_usd: computeAnthropicCost(ANTHROPIC_MODEL, totalIn, totalOut),
    duration_ms,
    success: false,
    error_message: lastError,
    proposal_id: opts.proposal_id,
    site_walk_id: opts.site_walk_id ?? null,
  });
  throw new Error(`Proposal write-up failed after ${attempts} attempts: ${lastError}`);
}
