"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PendingSiteWalk } from "./page";

function tone(status: PendingSiteWalk["transcription_status"]) {
  if (status === "failed")
    return "bg-rose-100 text-rose-900 border-rose-200";
  if (status === "done")
    return "bg-slate-100 text-slate-900 border-slate-200";
  return "bg-amber-100 text-amber-900 border-amber-200";
}

function label(status: PendingSiteWalk["transcription_status"]) {
  if (status === "failed") return "Transcription failed";
  if (status === "done") return "Generating proposal";
  return "Transcribing";
}

export function PendingSiteWalksClient({
  siteWalks,
}: {
  siteWalks: PendingSiteWalk[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(siteWalkId: string, kind: "transcribe" | "generate") {
    setBusyId(siteWalkId);
    setError(null);
    try {
      const path =
        kind === "transcribe" ? "/api/transcribe" : "/api/proposals/generate";
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_walk_id: siteWalkId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Retry failed (${res.status})`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">In flight</CardTitle>
        <CardDescription>
          Site walks waiting on transcription or proposal generation. Retry if
          something stalled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {siteWalks.map((sw) => {
          const isFailed = sw.transcription_status === "failed";
          const isPending = sw.transcription_status === "pending";
          const isGenerating = sw.transcription_status === "done";
          return (
            <div
              key={sw.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3"
            >
              <div className="space-y-1">
                <p className="font-medium">{sw.client_full_name}</p>
                <p className="text-xs text-muted-foreground">
                  Captured {sw.walked_at_display} UTC
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={tone(sw.transcription_status)}>
                  {label(sw.transcription_status)}
                </Badge>
                {isFailed ? (
                  <Button
                    size="sm"
                    onClick={() => retry(sw.id, "transcribe")}
                    disabled={pending || busyId === sw.id}
                  >
                    {busyId === sw.id ? "Retrying…" : "Retry transcribe"}
                  </Button>
                ) : isGenerating ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry(sw.id, "generate")}
                    disabled={pending || busyId === sw.id}
                  >
                    {busyId === sw.id ? "Generating…" : "Generate proposal"}
                  </Button>
                ) : isPending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry(sw.id, "transcribe")}
                    disabled={pending || busyId === sw.id}
                  >
                    {busyId === sw.id ? "Working…" : "Run transcribe"}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
