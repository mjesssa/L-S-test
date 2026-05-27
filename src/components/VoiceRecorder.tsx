"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type RecorderState = "idle" | "recording" | "stopped";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, mimeType: string, durationSec: number) => void;
  disabled?: boolean;
}

function pickSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onRecorded, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopStream]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("stopped");
        stopStream();
        onRecorded(blob, mimeType, durationSec);
      };

      recorder.start(250); // collect chunks every 250ms
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState("recording");
      timerRef.current = window.setInterval(() => {
        setElapsed(
          Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
      }, 250);
    } catch (e) {
      console.error(e);
      setError(
        "Could not access microphone. Allow mic permission in your browser settings and try again.",
      );
      stopStream();
    }
  }, [onRecorded, previewUrl, stopStream]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setElapsed(0);
    setState("idle");
    chunksRef.current = [];
  }, [previewUrl]);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              state === "recording"
                ? "animate-pulse bg-red-500"
                : state === "stopped"
                ? "bg-emerald-500"
                : "bg-muted-foreground/40"
            }`}
            aria-hidden
          />
          <span className="font-medium">
            {state === "recording"
              ? "Recording…"
              : state === "stopped"
              ? "Recorded"
              : "Ready"}
          </span>
        </div>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatTime(elapsed)}
        </span>
      </div>

      {previewUrl ? (
        <audio src={previewUrl} controls className="w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">
          Tap record and describe the scope, dimensions, materials, and any
          callouts (HOA, rush, budget).
        </p>
      )}

      <div className="flex gap-2">
        {state !== "recording" ? (
          <Button
            type="button"
            onClick={start}
            disabled={disabled || state === "stopped"}
          >
            {state === "stopped" ? "Recorded" : "Start recording"}
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={stop}>
            Stop
          </Button>
        )}
        {state === "stopped" ? (
          <Button type="button" variant="outline" onClick={reset}>
            Re-record
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
