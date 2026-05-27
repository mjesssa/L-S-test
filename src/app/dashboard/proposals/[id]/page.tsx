import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { marked } from "marked";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineItemRow } from "@/components/LineItemRow";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Json, ProposalStatus } from "@/types/db";
import { ProposalActions } from "./proposal-actions";

interface ProposalRow {
  id: string;
  status: ProposalStatus;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  proposal_md: string | null;
  pdf_url: string | null;
  stripe_payment_link: string | null;
  needs_render: boolean;
  high_value_block: boolean;
  confidence_score: number | null;
  flags: Json | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  clients: { full_name: string; email: string; address: string | null } | null;
  site_walks: { transcription: string | null } | null;
}

interface LineItemRowData {
  id: string;
  scope_description: string;
  matched_name: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  confidence: number | null;
  needs_review: boolean;
  position: number;
}

function money(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

const STATUS_LABEL: Record<ProposalStatus, string> = {
  drafting: "Drafting",
  needs_review: "Needs review",
  approved: "Approved",
  sent: "Sent",
  rejected: "Rejected",
};

const STATUS_TONE: Record<ProposalStatus, string> = {
  drafting: "bg-slate-100 text-slate-900 border-slate-200",
  needs_review: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  sent: "bg-blue-100 text-blue-900 border-blue-200",
  rejected: "bg-rose-100 text-rose-900 border-rose-200",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalReviewPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const { data: proposal, error } = await service
    .from("proposals")
    .select(
      "id,status,subtotal,tax,total,proposal_md,pdf_url,stripe_payment_link,needs_render,high_value_block,confidence_score,flags,approved_at,sent_at,created_at,clients(full_name,email,address),site_walks(transcription)",
    )
    .eq("id", id)
    .single<ProposalRow>();
  if (error || !proposal) {
    notFound();
  }

  const { data: lineItems } = await service
    .from("proposal_line_items")
    .select(
      "id,scope_description,matched_name,quantity,unit,unit_price,line_total,confidence,needs_review,position",
    )
    .eq("proposal_id", id)
    .order("position", { ascending: true })
    .returns<LineItemRowData[]>();

  const flags = Array.isArray(proposal.flags) ? proposal.flags : [];
  const status = proposal.status;
  const locked =
    status === "approved" || status === "sent" || status === "rejected";

  const html = proposal.proposal_md
    ? marked.parse(proposal.proposal_md, { async: false })
    : "<p class='text-muted-foreground'>No proposal markdown yet.</p>";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">← Back</Link>
            </Button>
            <Badge variant="outline" className={STATUS_TONE[status]}>
              {STATUS_LABEL[status]}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {proposal.clients?.full_name ?? "Unknown client"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {proposal.clients?.email}
            {proposal.clients?.address ? ` · ${proposal.clients.address}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold">{money(proposal.total)}</p>
          {proposal.confidence_score != null ? (
            <p className="text-sm text-muted-foreground">
              Overall confidence{" "}
              {(proposal.confidence_score * 100).toFixed(0)}%
            </p>
          ) : null}
        </div>
      </header>

      {flags.length > 0 ? (
        <Card
          className={
            proposal.high_value_block
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {proposal.high_value_block
                ? "Manual review required"
                : "Reviewer flags"}
            </CardTitle>
            <CardDescription>
              {proposal.high_value_block
                ? "This proposal exceeds the $120K auto-send threshold. Sending is blocked until manually approved."
                : "Things worth double-checking before approving."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {flags.map((flag, idx) => (
                <li key={idx} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{String(flag)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ProposalActions
        proposalId={proposal.id}
        status={status}
        highValueBlock={proposal.high_value_block}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Line items ({lineItems?.length ?? 0})
            </h2>
            <span className="text-sm text-muted-foreground">
              Subtotal {money(proposal.subtotal)}
            </span>
          </div>
          <div className="space-y-3">
            {(lineItems ?? []).map((line) => (
              <LineItemRow key={line.id} line={line} locked={locked} />
            ))}
            {lineItems && lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Proposal preview
          </h2>
          <Card>
            <CardContent
              className="prose prose-sm max-w-none p-6 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Card>

          {proposal.site_walks?.transcription ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transcription</CardTitle>
                <CardDescription>
                  What we heard from the site walk.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {proposal.site_walks.transcription}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}
