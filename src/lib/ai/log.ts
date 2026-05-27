import { createServiceClient } from "@/lib/supabase/server";
import type { AiActionType } from "@/types/db";

export interface AiActionLog {
  action_type: AiActionType;
  model: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
  duration_ms: number;
  success: boolean;
  error_message?: string | null;
  proposal_id?: string | null;
  site_walk_id?: string | null;
}

// Best-effort logger: never throws. Logging failures shouldn't break the
// AI pipeline.
export async function logAiAction(entry: AiActionLog): Promise<void> {
  try {
    const service = createServiceClient();
    await service.from("ai_actions").insert(entry as never);
  } catch (err) {
    console.error("[ai_actions] insert failed", err);
  }
}
