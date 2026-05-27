import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Json, ProposalStatus } from "@/types/db";

interface ProposalRow {
  id: string;
  status: ProposalStatus;
  total: number | null;
  confidence_score: number | null;
  created_at: string;
  flags: Json | null;
  clients: { full_name: string } | null;
}

const STATUS_GROUPS: { status: ProposalStatus; label: string; tone: string }[] =
  [
    { status: "needs_review", label: "Needs review", tone: "bg-amber-100 text-amber-900 border-amber-200" },
    { status: "drafting", label: "Drafting", tone: "bg-slate-100 text-slate-900 border-slate-200" },
    { status: "approved", label: "Approved", tone: "bg-emerald-100 text-emerald-900 border-emerald-200" },
    { status: "sent", label: "Sent", tone: "bg-blue-100 text-blue-900 border-blue-200" },
    { status: "rejected", label: "Rejected", tone: "bg-rose-100 text-rose-900 border-rose-200" },
  ];

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: proposals, error } = await supabase
    .from("proposals")
    .select(
      "id, status, total, confidence_score, created_at, flags, clients(full_name)",
    )
    .order("created_at", { ascending: false })
    .returns<ProposalRow[]>();

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Couldn’t load proposals</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    rows: (proposals ?? []).filter((p) => p.status === group.status),
  }));

  const totalCount = proposals?.length ?? 0;

  if (totalCount === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            Site walk → transcription → matched scope → reviewable proposal.
          </p>
        </header>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No proposals yet</CardTitle>
            <CardDescription>
              Record a site walk to draft your first proposal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/site-walk/new">+ New site walk</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            {totalCount} {totalCount === 1 ? "proposal" : "proposals"} across all stages.
          </p>
        </div>
      </header>

      {grouped.map((group) => (
        <section key={group.status} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <Badge variant="outline" className={group.tone}>
              {group.rows.length}
            </Badge>
          </div>
          {group.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {group.rows.map((p) => {
                const flags = Array.isArray(p.flags) ? p.flags : [];
                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/proposals/${p.id}`}
                    className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {p.clients?.full_name ?? "Unknown client"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(p.created_at)}
                          {p.confidence_score != null
                            ? ` · confidence ${(p.confidence_score * 100).toFixed(0)}%`
                            : ""}
                        </p>
                      </div>
                      <p className="text-right font-semibold">
                        {formatCurrency(p.total)}
                      </p>
                    </div>
                    {flags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {flags.slice(0, 3).map((flag: unknown, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs"
                          >
                            {String(flag)}
                          </Badge>
                        ))}
                        {flags.length > 3 ? (
                          <Badge variant="outline" className="text-xs">
                            +{flags.length - 3}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
