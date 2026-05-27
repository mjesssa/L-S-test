"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveProposal, rejectProposal } from "./actions";

interface Props {
  proposalId: string;
  status: string;
  highValueBlock: boolean;
  siteWalkId: string | null;
}

export function ProposalActions({
  proposalId,
  status,
  highValueBlock,
  siteWalkId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isReviewable = status === "needs_review" || status === "drafting";
  const isDraftStuck = status === "drafting" || status === "rejected";
  const isApproved = status === "approved";

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveProposal(proposalId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function reject() {
    if (!confirm("Reject this proposal? It won't be sent.")) return;
    setError(null);
    startTransition(async () => {
      const res = await rejectProposal(proposalId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  async function regenerate() {
    if (!siteWalkId) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_walk_id: siteWalkId }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? `Regenerate failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Send failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {isReviewable ? (
          <>
            <Button onClick={approve} disabled={pending}>
              {pending ? "Approving…" : "Approve"}
            </Button>
            <Button variant="outline" onClick={reject} disabled={pending}>
              Reject
            </Button>
          </>
        ) : null}
        {isDraftStuck && siteWalkId ? (
          <Button
            variant="outline"
            onClick={regenerate}
            disabled={regenerating || pending}
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </Button>
        ) : null}
        {isApproved ? (
          <Button
            onClick={send}
            disabled={sending || highValueBlock}
            title={
              highValueBlock
                ? "Manual review required for high-value projects"
                : undefined
            }
          >
            {sending ? "Sending…" : "Send to customer"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
