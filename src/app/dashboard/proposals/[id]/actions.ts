"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const lineItemUpdateSchema = z.object({
  line_item_id: z.string().uuid(),
  scope_description: z.string().min(1).max(500),
  matched_name: z.string().max(200).nullable(),
  quantity: z.number().min(0).max(1_000_000),
  unit_price: z.number().min(0).max(1_000_000),
});

const proposalIdSchema = z.string().uuid();

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function recomputeProposalTotals(
  service: ReturnType<typeof createServiceClient>,
  proposalId: string,
): Promise<{ subtotal: number; total: number }> {
  const { data: lines } = await service
    .from("proposal_line_items")
    .select("line_total")
    .eq("proposal_id", proposalId)
    .returns<Array<{ line_total: number }>>();

  const subtotal = Number(
    (lines ?? []).reduce((sum, l) => sum + Number(l.line_total), 0).toFixed(2),
  );
  const tax = 0;
  const total = Number((subtotal + tax).toFixed(2));

  const update = {
    subtotal,
    tax,
    total,
    needs_render: total > 30_000,
    high_value_block: total > 120_000,
  };
  await service
    .from("proposals")
    .update(update as never)
    .eq("id", proposalId);

  return { subtotal, total };
}

export async function updateLineItem(input: unknown): Promise<ActionResult> {
  try {
    await requireUser();
    const parsed = lineItemUpdateSchema.parse(input);
    const service = createServiceClient();

    const lineTotal = Number(
      (parsed.quantity * parsed.unit_price).toFixed(2),
    );

    const update = {
      scope_description: parsed.scope_description,
      matched_name: parsed.matched_name || null,
      quantity: parsed.quantity,
      unit_price: parsed.unit_price,
      line_total: lineTotal,
    };

    const { data, error } = await service
      .from("proposal_line_items")
      .update(update as never)
      .eq("id", parsed.line_item_id)
      .select("proposal_id")
      .single<{ proposal_id: string }>();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Update failed" };
    }
    await recomputeProposalTotals(service, data.proposal_id);
    revalidatePath(`/dashboard/proposals/${data.proposal_id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function approveProposal(
  proposalId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = proposalIdSchema.parse(proposalId);
    const service = createServiceClient();

    const { error } = await service
      .from("proposals")
      .update({
        status: "approved" as const,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/dashboard/proposals/${id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function rejectProposal(
  proposalId: string,
): Promise<ActionResult> {
  try {
    await requireUser();
    const id = proposalIdSchema.parse(proposalId);
    const service = createServiceClient();

    const { error } = await service
      .from("proposals")
      .update({ status: "rejected" as const } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/dashboard/proposals/${id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
