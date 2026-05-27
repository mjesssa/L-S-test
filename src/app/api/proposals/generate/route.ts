import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractScope } from "@/lib/ai/extract-scope";
import {
  matchPricingItem,
  type PricingCatalogItem,
} from "@/lib/ai/match-pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  site_walk_id: z.string().uuid(),
});

const HIGH_VALUE_BLOCK_THRESHOLD = 120_000;
const RENDER_RECOMMENDED_THRESHOLD = 30_000;
const LINE_REVIEW_CONFIDENCE = 0.7;
const OVERALL_LOW_CONFIDENCE = 0.6;

export async function POST(request: Request) {
  // Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body.
  let parsedBody;
  try {
    parsedBody = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid body" },
      { status: 400 },
    );
  }
  const { site_walk_id } = parsedBody;

  const service = createServiceClient();

  // Load site walk + transcription + client.
  const { data: siteWalk, error: swError } = await service
    .from("site_walks")
    .select("id, client_id, transcription, transcription_status")
    .eq("id", site_walk_id)
    .single<{
      id: string;
      client_id: string | null;
      transcription: string | null;
      transcription_status: string;
    }>();
  if (swError || !siteWalk) {
    return NextResponse.json(
      { error: `Site walk not found: ${swError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }
  if (siteWalk.transcription_status !== "done" || !siteWalk.transcription) {
    return NextResponse.json(
      { error: "Transcription not ready" },
      { status: 409 },
    );
  }
  if (!siteWalk.client_id) {
    return NextResponse.json(
      { error: "Site walk missing client_id" },
      { status: 400 },
    );
  }

  // If a proposal already exists for this site walk, return it.
  const { data: existing } = await service
    .from("proposals")
    .select("id, status")
    .eq("site_walk_id", site_walk_id)
    .limit(1)
    .returns<Array<{ id: string; status: string }>>();
  if (existing && existing.length > 0) {
    return NextResponse.json({
      proposal_id: existing[0].id,
      status: existing[0].status,
      note: "proposal already exists for this site walk",
    });
  }

  // Create the draft proposal up-front so AI actions can be attributed.
  const draftInsert = {
    site_walk_id,
    client_id: siteWalk.client_id,
    status: "drafting" as const,
    flags: [] as unknown as never,
  };
  const { data: draft, error: draftError } = await service
    .from("proposals")
    .insert(draftInsert as never)
    .select("id")
    .single<{ id: string }>();
  if (draftError || !draft) {
    return NextResponse.json(
      {
        error: `Draft proposal insert failed: ${draftError?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const proposal_id = draft.id;

  // 1) Extract scope from transcription.
  let extraction;
  try {
    extraction = await extractScope({
      transcription: siteWalk.transcription,
      proposal_id,
      site_walk_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await service
      .from("proposals")
      .update({
        status: "drafting" as const,
        flags: [`extraction failed: ${message}`] as unknown as never,
      } as never)
      .eq("id", proposal_id);
    return NextResponse.json(
      { error: `Scope extraction failed: ${message}`, proposal_id },
      { status: 500 },
    );
  }

  // Load full active catalogue.
  const { data: catalogueData, error: catError } = await service
    .from("pricing_items")
    .select("id,sku,name,description,category,unit,unit_price,keywords")
    .eq("active", true)
    .returns<PricingCatalogItem[]>();
  if (catError || !catalogueData) {
    return NextResponse.json(
      {
        error: `Loading pricing catalogue failed: ${catError?.message ?? "unknown"}`,
        proposal_id,
      },
      { status: 500 },
    );
  }

  // 2) Match each scope item — run in parallel for latency, but keep a per-item
  // try/catch so one failure doesn't kill the whole proposal.
  const matchResults = await Promise.all(
    extraction.scope.scope_items.map(async (scope) => {
      try {
        const { match } = await matchPricingItem({
          scope,
          catalogue: catalogueData,
          proposal_id,
          site_walk_id,
        });
        return { scope, match, error: null as string | null };
      } catch (err) {
        return {
          scope,
          match: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  // Build line items + compute totals + confidence.
  const catalogueBySku = new Map<string, PricingCatalogItem>();
  for (const it of catalogueData) {
    catalogueBySku.set(it.sku, it);
  }

  type LineDraft = {
    proposal_id: string;
    pricing_item_id: string | null;
    scope_description: string;
    matched_name: string | null;
    quantity: number;
    unit: string | null;
    unit_price: number;
    line_total: number;
    confidence: number | null;
    needs_review: boolean;
    position: number;
  };

  const lineDrafts: LineDraft[] = [];
  const aggregatedFlags: string[] = [...extraction.scope.flags];

  for (const [position, result] of matchResults.entries()) {
    const scope = result.scope;
    if (result.error || !result.match) {
      aggregatedFlags.push(
        `Match failed for "${scope.description.slice(0, 50)}"`,
      );
      lineDrafts.push({
        proposal_id,
        pricing_item_id: null,
        scope_description: scope.description,
        matched_name: null,
        quantity: scope.quantity_hint ?? 1,
        unit: scope.unit_hint ?? null,
        unit_price: 0,
        line_total: 0,
        confidence: 0,
        needs_review: true,
        position,
      });
      continue;
    }

    const match = result.match;
    let pricingItemId: string | null = null;
    let unitPrice = 0;
    let unit = match.unit;

    if (match.matched_sku) {
      const catalogue = catalogueBySku.get(match.matched_sku);
      if (catalogue) {
        pricingItemId = catalogue.id;
        unitPrice = catalogue.unit_price;
        unit = (catalogue.unit as typeof unit) ?? unit;
      }
    }

    const quantity = Math.max(0, match.quantity);
    const lineTotal = Number((quantity * unitPrice).toFixed(2));
    const needsReview =
      !match.matched_sku ||
      match.confidence < LINE_REVIEW_CONFIDENCE ||
      !pricingItemId;

    lineDrafts.push({
      proposal_id,
      pricing_item_id: pricingItemId,
      scope_description: scope.description,
      matched_name: match.matched_name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal,
      confidence: match.confidence,
      needs_review: needsReview,
      position,
    });

    if (!match.matched_sku) {
      aggregatedFlags.push(
        `No pricing match: "${scope.description.slice(0, 50)}"`,
      );
    } else if (match.confidence < LINE_REVIEW_CONFIDENCE) {
      aggregatedFlags.push(
        `Low confidence (${(match.confidence * 100).toFixed(0)}%): ${match.matched_name ?? match.matched_sku}`,
      );
    }
  }

  // Insert all line items.
  if (lineDrafts.length > 0) {
    const { error: liError } = await service
      .from("proposal_line_items")
      .insert(lineDrafts as never);
    if (liError) {
      return NextResponse.json(
        {
          error: `Line item insert failed: ${liError.message}`,
          proposal_id,
        },
        { status: 500 },
      );
    }
  }

  const subtotal = Number(
    lineDrafts.reduce((sum, l) => sum + l.line_total, 0).toFixed(2),
  );
  const tax = 0;
  const total = Number((subtotal + tax).toFixed(2));

  // Weighted average confidence by line_total (lines with $0 get a small floor
  // weight so they aren't ignored).
  const totalWeight = lineDrafts.reduce(
    (sum, l) => sum + Math.max(l.line_total, 100),
    0,
  );
  const weightedConfidence =
    totalWeight > 0
      ? lineDrafts.reduce(
          (sum, l) =>
            sum + (l.confidence ?? 0) * Math.max(l.line_total, 100),
          0,
        ) / totalWeight
      : null;

  const needs_render = total > RENDER_RECOMMENDED_THRESHOLD;
  const high_value_block = total > HIGH_VALUE_BLOCK_THRESHOLD;

  if (high_value_block) {
    aggregatedFlags.unshift(
      `High-value project ($${total.toLocaleString()}) — manual review required before send`,
    );
  } else if (needs_render) {
    aggregatedFlags.push(
      `Render recommended (total $${total.toLocaleString()})`,
    );
  }
  if (
    weightedConfidence !== null &&
    weightedConfidence < OVERALL_LOW_CONFIDENCE
  ) {
    aggregatedFlags.push(
      `Overall match confidence below ${Math.round(OVERALL_LOW_CONFIDENCE * 100)}%`,
    );
  }

  // Update the proposal row with the computed numbers and move to needs_review.
  const proposalUpdate = {
    status: "needs_review" as const,
    subtotal,
    tax,
    total,
    confidence_score: weightedConfidence,
    flags: aggregatedFlags as unknown as never,
    needs_render,
    high_value_block,
  };
  const { error: updateError } = await service
    .from("proposals")
    .update(proposalUpdate as never)
    .eq("id", proposal_id);
  if (updateError) {
    return NextResponse.json(
      {
        error: `Proposal update failed: ${updateError.message}`,
        proposal_id,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    proposal_id,
    status: "needs_review",
    subtotal,
    total,
    confidence_score: weightedConfidence,
    line_items: lineDrafts.length,
    flags: aggregatedFlags,
  });
}
