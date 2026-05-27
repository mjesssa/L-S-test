import { NextResponse } from "next/server";
import { z } from "zod";
import { toFile } from "openai/uploads";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOpenAI, WHISPER_MODEL } from "@/lib/ai/openai";
import { logAiAction } from "@/lib/ai/log";
import { computeWhisperCost } from "@/lib/cost";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({
  site_walk_id: z.string().uuid(),
});

const AUDIO_BUCKET = "site-walk-audio";

function extensionFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1) : "webm";
}

export async function POST(request: Request) {
  // Auth check.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { site_walk_id } = parsed;

  const service = createServiceClient();

  // Load the site walk and its audio path.
  const { data: siteWalk, error: loadError } = await service
    .from("site_walks")
    .select("id, audio_url, transcription_status")
    .eq("id", site_walk_id)
    .single<{
      id: string;
      audio_url: string | null;
      transcription_status: string;
    }>();
  if (loadError || !siteWalk) {
    return NextResponse.json(
      { error: `Site walk not found: ${loadError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }
  if (!siteWalk.audio_url) {
    return NextResponse.json(
      { error: "Site walk has no audio attached" },
      { status: 400 },
    );
  }

  // Download audio bytes from private storage.
  const { data: audioBlob, error: dlError } = await service.storage
    .from(AUDIO_BUCKET)
    .download(siteWalk.audio_url);
  if (dlError || !audioBlob) {
    return NextResponse.json(
      { error: `Audio download failed: ${dlError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const ext = extensionFromPath(siteWalk.audio_url);
  const filename = `site-walk.${ext}`;
  const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());

  const openai = getOpenAI();
  const start = Date.now();
  let transcription: string;
  try {
    const upload = await toFile(audioBuffer, filename, {
      type: audioBlob.type || "audio/webm",
    });
    const res = await openai.audio.transcriptions.create({
      file: upload,
      model: WHISPER_MODEL,
      // Plain text response is sufficient and avoids JSON overhead.
      response_format: "text",
    });
    transcription =
      typeof res === "string" ? res : String((res as { text?: string }).text ?? "");
    transcription = transcription.trim();
    if (!transcription) {
      throw new Error("Whisper returned an empty transcription");
    }
  } catch (err) {
    const duration_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    await service
      .from("site_walks")
      .update({ transcription_status: "failed" } as never)
      .eq("id", site_walk_id);

    await logAiAction({
      action_type: "transcribe",
      model: WHISPER_MODEL,
      duration_ms,
      success: false,
      error_message: message,
      site_walk_id,
    });

    return NextResponse.json(
      { error: `Transcription failed: ${message}` },
      { status: 500 },
    );
  }
  const duration_ms = Date.now() - start;

  // Cost: Whisper bills per audio-minute. We don't have the exact runtime so
  // estimate from file size (an Opus webm at ~32kbps ≈ 240 KB/min). Good
  // enough for cost logging — Phase 9 can refine if needed.
  const estMinutes = audioBuffer.byteLength / (240 * 1024);
  const cost_usd = computeWhisperCost(estMinutes);

  await service
    .from("site_walks")
    .update({
      transcription,
      transcription_status: "done",
    } as never)
    .eq("id", site_walk_id);

  await logAiAction({
    action_type: "transcribe",
    model: WHISPER_MODEL,
    duration_ms,
    success: true,
    cost_usd,
    input_tokens: null,
    output_tokens: null,
    site_walk_id,
  });

  return NextResponse.json({
    site_walk_id,
    transcription,
    duration_ms,
  });
}
