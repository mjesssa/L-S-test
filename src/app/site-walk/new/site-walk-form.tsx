"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "@/components/VoiceRecorder";

type Stage =
  | "idle"
  | "uploading"
  | "uploaded"
  | "error";

export function SiteWalkForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<{
    blob: Blob;
    mimeType: string;
    durationSec: number;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!audio) {
      setError("Record a voice memo before submitting.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const ext = audio.mimeType.includes("mp4")
      ? "m4a"
      : audio.mimeType.includes("ogg")
      ? "ogg"
      : "webm";
    formData.set("audio", audio.blob, `site-walk.${ext}`);

    setStage("uploading");
    try {
      const res = await fetch("/api/site-walks", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Upload failed (${res.status})`);
      }

      setStage("uploaded");

      // Kick off the rest of the pipeline (transcribe → extract → match →
      // write). These endpoints land in later phases; the page polls /dashboard
      // for status, so calling them here is fine to do in fire-and-forget.
      const siteWalkId: string = json.site_walk_id;
      fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_walk_id: siteWalkId }),
      })
        .then(() =>
          fetch("/api/proposals/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ site_walk_id: siteWalkId }),
          }),
        )
        .catch(() => {
          // The dashboard surfaces failures via flags/status; no UI noise here.
        });

      router.push("/dashboard");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      setStage("error");
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Client
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="client_full_name">Full name</Label>
            <Input
              id="client_full_name"
              name="client_full_name"
              required
              placeholder="Sarah Chen"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_email">Email</Label>
            <Input
              id="client_email"
              name="client_email"
              type="email"
              required
              placeholder="sarah@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_phone">Phone</Label>
            <Input
              id="client_phone"
              name="client_phone"
              type="tel"
              placeholder="(602) 555-1234"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_address">Address</Label>
            <Input
              id="client_address"
              name="client_address"
              placeholder="123 Camelback Rd, Phoenix AZ"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            placeholder="Anything you want to flag separate from the voice memo."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Voice memo
        </h2>
        <VoiceRecorder
          onRecorded={(blob, mimeType, durationSec) =>
            setAudio({ blob, mimeType, durationSec })
          }
          disabled={stage === "uploading"}
        />
        {audio ? (
          <p className="text-sm text-muted-foreground">
            Captured {audio.durationSec}s ·{" "}
            {(audio.blob.size / 1024).toFixed(0)} KB
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={stage === "uploading" || !audio}>
          {stage === "uploading"
            ? "Uploading…"
            : stage === "uploaded"
            ? "Redirecting…"
            : "Submit site walk"}
        </Button>
      </div>
    </form>
  );
}
