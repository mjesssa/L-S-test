import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  ProposalPdf,
  type PdfLineItem,
  type PdfProposalData,
} from "@/lib/pdf/proposal-template";
import { createDepositPaymentLink } from "@/lib/stripe/create-payment-link";
import { sendProposalEmail } from "@/lib/email/send-proposal";

export const runtime = "nodejs";
export const maxDuration = 90;

const PDF_BUCKET = "proposal-pdfs";
const HIGH_VALUE_BLOCK_THRESHOLD = 120_000;

const paramsSchema = z.object({ id: z.string().uuid() });

interface ProposalForSend {
  id: string;
  client_id: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  high_value_block: boolean;
  pdf_url: string | null;
  stripe_payment_link: string | null;
  created_at: string;
  clients: { full_name: string; email: string; address: string | null } | null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });
  }
  const proposalId = parsed.data.id;

  const service = createServiceClient();

  // Load the proposal.
  const { data: proposal, error: loadError } = await service
    .from("proposals")
    .select(
      "id,client_id,status,approved_by,approved_at,total,subtotal,tax,high_value_block,pdf_url,stripe_payment_link,created_at,clients(full_name,email,address)",
    )
    .eq("id", proposalId)
    .single<ProposalForSend>();
  if (loadError || !proposal) {
    return NextResponse.json(
      { error: `Proposal not found: ${loadError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }

  // HARD GUARDRAIL #1 — human-in-the-loop check at the data layer.
  if (!proposal.approved_by) {
    return NextResponse.json(
      { error: "Proposal has not been approved" },
      { status: 403 },
    );
  }
  // HARD GUARDRAIL #2 — high-value block.
  if (
    proposal.high_value_block ||
    (proposal.total != null && proposal.total > HIGH_VALUE_BLOCK_THRESHOLD)
  ) {
    return NextResponse.json(
      {
        error:
          "High-value proposals must be sent manually. Auto-send is disabled.",
      },
      { status: 403 },
    );
  }
  if (proposal.status === "sent") {
    return NextResponse.json(
      { error: "Proposal already sent", proposal_id: proposalId },
      { status: 409 },
    );
  }
  if (!proposal.clients || !proposal.clients.email) {
    return NextResponse.json(
      { error: "Proposal client has no email" },
      { status: 400 },
    );
  }
  if (proposal.total == null) {
    return NextResponse.json(
      { error: "Proposal total is null" },
      { status: 400 },
    );
  }

  // Load line items.
  const { data: lineItems, error: liError } = await service
    .from("proposal_line_items")
    .select(
      "scope_description,matched_name,quantity,unit,unit_price,line_total,position",
    )
    .eq("proposal_id", proposalId)
    .order("position", { ascending: true })
    .returns<Array<PdfLineItem & { position: number }>>();
  if (liError || !lineItems || lineItems.length === 0) {
    return NextResponse.json(
      { error: `No line items: ${liError?.message ?? "proposal is empty"}` },
      { status: 400 },
    );
  }

  // 1) Render PDF.
  let pdfBuffer: Buffer;
  try {
    const data: PdfProposalData = {
      client_name: proposal.clients.full_name,
      client_address: proposal.clients.address,
      proposal_id: proposal.id,
      created_at: proposal.created_at,
      line_items: lineItems.map((l) => ({
        scope_description: l.scope_description,
        matched_name: l.matched_name,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        line_total: l.line_total,
      })),
      subtotal: proposal.subtotal ?? 0,
      tax: proposal.tax ?? 0,
      total: proposal.total,
    };
    // renderToBuffer takes a React Document element. The TS types insist on
    // DocumentProps for the root element, but ProposalPdf returns a Document
    // wrapper — cast through unknown to satisfy the signature.
    const element = createElement(ProposalPdf, { data }) as unknown as Parameters<
      typeof renderToBuffer
    >[0];
    pdfBuffer = (await renderToBuffer(element)) as Buffer;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `PDF render failed: ${message}` },
      { status: 500 },
    );
  }

  // 2) Upload PDF to private storage.
  const pdfPath = `${proposalId}/${Date.now()}.pdf`;
  const { error: uploadError } = await service.storage
    .from(PDF_BUCKET)
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `PDF upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }
  const { data: signed } = await service.storage
    .from(PDF_BUCKET)
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 30); // 30-day signed URL
  const pdfUrl = signed?.signedUrl ?? pdfPath;

  // 3) Stripe payment link (50% deposit).
  let paymentLink: string;
  try {
    paymentLink =
      proposal.stripe_payment_link ??
      (await createDepositPaymentLink({
        proposalId,
        clientName: proposal.clients.full_name,
        totalUsd: proposal.total,
      }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // PDF is uploaded; persist it so the next attempt can reuse it.
    await service
      .from("proposals")
      .update({ pdf_url: pdfUrl } as never)
      .eq("id", proposalId);
    return NextResponse.json(
      {
        error: `Stripe payment link failed: ${message}. Retry from the dashboard.`,
      },
      { status: 500 },
    );
  }

  // 4) Send email via Resend.
  try {
    await sendProposalEmail({
      to: proposal.clients.email,
      clientName: proposal.clients.full_name,
      total: proposal.total,
      paymentLink,
      pdf: pdfBuffer,
      proposalId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist PDF + payment link so retry doesn't re-do the work.
    await service
      .from("proposals")
      .update({
        pdf_url: pdfUrl,
        stripe_payment_link: paymentLink,
      } as never)
      .eq("id", proposalId);
    return NextResponse.json(
      {
        error: `Email send failed: ${message}. PDF and payment link saved — retry from the dashboard.`,
      },
      { status: 500 },
    );
  }

  // 5) Mark sent.
  const sentAt = new Date().toISOString();
  const { error: finalUpdateError } = await service
    .from("proposals")
    .update({
      status: "sent" as const,
      pdf_url: pdfUrl,
      stripe_payment_link: paymentLink,
      sent_at: sentAt,
    } as never)
    .eq("id", proposalId);
  if (finalUpdateError) {
    return NextResponse.json(
      {
        error: `Email sent but DB update failed: ${finalUpdateError.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    proposal_id: proposalId,
    status: "sent",
    pdf_url: pdfUrl,
    stripe_payment_link: paymentLink,
    sent_at: sentAt,
  });
}
