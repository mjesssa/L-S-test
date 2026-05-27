// Hand-typed schema mirror of supabase/migrations/0001_initial_schema.sql.
// Replace with `supabase gen types typescript --project-id <id> > src/types/db.ts`
// once the Supabase project is provisioned.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProposalStatus =
  | "drafting"
  | "needs_review"
  | "approved"
  | "sent"
  | "rejected";

export type TranscriptionStatus = "pending" | "done" | "failed";

export type AiActionType =
  | "transcribe"
  | "extract_scope"
  | "match_pricing"
  | "write_proposal";

export type PricingCategory =
  | "hardscape"
  | "landscape"
  | "irrigation"
  | "lighting"
  | "water_feature"
  | "turf"
  | "labor";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      clients: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          address: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          phone?: string | null;
          address?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      pricing_items: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          category: PricingCategory | null;
          unit: string;
          unit_price: number;
          keywords: string[] | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          category?: PricingCategory | null;
          unit: string;
          unit_price: number;
          keywords?: string[] | null;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_items"]["Insert"]>;
      };
      site_walks: {
        Row: {
          id: string;
          client_id: string | null;
          audio_url: string | null;
          transcription: string | null;
          transcription_status: TranscriptionStatus;
          notes: string | null;
          walked_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          audio_url?: string | null;
          transcription?: string | null;
          transcription_status?: TranscriptionStatus;
          notes?: string | null;
          walked_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["site_walks"]["Insert"]>;
      };
      proposals: {
        Row: {
          id: string;
          site_walk_id: string | null;
          client_id: string | null;
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
          approved_by: string | null;
          approved_at: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_walk_id?: string | null;
          client_id?: string | null;
          status?: ProposalStatus;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          proposal_md?: string | null;
          pdf_url?: string | null;
          stripe_payment_link?: string | null;
          needs_render?: boolean;
          high_value_block?: boolean;
          confidence_score?: number | null;
          flags?: Json | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["proposals"]["Insert"]>;
      };
      proposal_line_items: {
        Row: {
          id: string;
          proposal_id: string;
          pricing_item_id: string | null;
          scope_description: string;
          matched_name: string | null;
          quantity: number;
          unit: string | null;
          unit_price: number;
          line_total: number;
          confidence: number | null;
          needs_review: boolean;
          position: number;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          pricing_item_id?: string | null;
          scope_description: string;
          matched_name?: string | null;
          quantity: number;
          unit?: string | null;
          unit_price: number;
          line_total: number;
          confidence?: number | null;
          needs_review?: boolean;
          position?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["proposal_line_items"]["Insert"]
        >;
      };
      ai_actions: {
        Row: {
          id: string;
          proposal_id: string | null;
          site_walk_id: string | null;
          action_type: AiActionType;
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_usd: number | null;
          duration_ms: number | null;
          success: boolean | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id?: string | null;
          site_walk_id?: string | null;
          action_type: AiActionType;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cost_usd?: number | null;
          duration_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_actions"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      proposal_status: ProposalStatus;
      transcription_status: TranscriptionStatus;
      ai_action_type: AiActionType;
      pricing_category: PricingCategory;
    };
  };
}
