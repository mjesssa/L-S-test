import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const metadataSchema = z.object({
  client_full_name: z.string().min(1, "Client name is required"),
  client_email: z.string().email("Valid email is required"),
  client_phone: z.string().optional().default(""),
  client_address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const AUDIO_BUCKET = "site-walk-audio";

function extFromMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/wav")) return "wav";
  return "audio";
}

export async function POST(request: Request) {
  // Auth check — only signed-in users can create site walks.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "Missing audio file" },
      { status: 400 },
    );
  }

  const parsed = metadataSchema.safeParse({
    client_full_name: formData.get("client_full_name"),
    client_email: formData.get("client_email"),
    client_phone: formData.get("client_phone") ?? "",
    client_address: formData.get("client_address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid metadata" },
      { status: 400 },
    );
  }
  const meta = parsed.data;

  // Use the service client for writes so RLS doesn't trip us up; we've
  // already verified auth above.
  const service = createServiceClient();

  // Upsert the client by email so re-recording for the same customer doesn't
  // create dupes. Returning the existing row's id either way.
  const { data: existingClients, error: clientLookupError } = await service
    .from("clients")
    .select("id")
    .eq("email", meta.client_email)
    .limit(1)
    .returns<Array<{ id: string }>>();
  if (clientLookupError) {
    return NextResponse.json(
      { error: `Client lookup failed: ${clientLookupError.message}` },
      { status: 500 },
    );
  }

  let clientId: string;
  if (existingClients && existingClients.length > 0) {
    clientId = existingClients[0].id;
  } else {
    const clientInsert = {
      full_name: meta.client_full_name,
      email: meta.client_email,
      phone: meta.client_phone || null,
      address: meta.client_address || null,
      created_by: user.id,
    };
    const { data: insertedClient, error: clientInsertError } = await service
      .from("clients")
      .insert(clientInsert as never)
      .select("id")
      .single<{ id: string }>();
    if (clientInsertError || !insertedClient) {
      return NextResponse.json(
        {
          error: `Client insert failed: ${clientInsertError?.message ?? "unknown"}`,
        },
        { status: 500 },
      );
    }
    clientId = insertedClient.id;
  }

  // Upload audio to private storage. Object path scoped by client.
  const ext = extFromMime(audio.type);
  const path = `${clientId}/${Date.now()}.${ext}`;
  const arrayBuffer = await audio.arrayBuffer();
  const { error: uploadError } = await service.storage
    .from(AUDIO_BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: audio.type || "audio/webm",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `Audio upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // Create the site_walk row.
  const siteWalkInsert = {
    client_id: clientId,
    audio_url: path,
    transcription_status: "pending" as const,
    notes: meta.notes || null,
    created_by: user.id,
  };
  const { data: siteWalk, error: siteWalkError } = await service
    .from("site_walks")
    .insert(siteWalkInsert as never)
    .select("id")
    .single<{ id: string }>();
  if (siteWalkError || !siteWalk) {
    return NextResponse.json(
      {
        error: `Site walk insert failed: ${siteWalkError?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    site_walk_id: siteWalk.id,
    client_id: clientId,
    audio_path: path,
  });
}
