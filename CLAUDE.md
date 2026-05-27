# Quote Acceleration Agent — Build Spec

> **Use this file as the source of truth for Claude Code. Work top to bottom. Do not skip phases.**

---

## What We're Building

A web app that turns a contractor's site-walk voice memo into a sent customer proposal in under 24 hours, with human approval before send. Built for Greenscape Pro, a Phoenix hardscape company. Owner-bottlenecked today (6–9 day quote cycle); this removes the owner from the critical path while keeping him as the final approver.

**Core flow:**

1. Owner finishes site walk, opens mobile web app, records 5–10 min voice memo
2. App transcribes (Whisper), extracts structured scope (Claude), matches to pricing DB (Claude with confidence scoring)
3. Generates draft proposal as HTML/PDF
4. Owner reviews on dashboard, edits or approves
5. On approve: PDF emailed to customer via Resend, with Stripe deposit link embedded
6. Every step logged for audit + cost tracking

---

## Hard Requirements (from take-home brief — do not skip)

- ✅ **Deployed** to a public URL on Vercel
- ✅ **GitHub repo** with real commit history (small, incremental commits per phase below)
- ✅ **Persistent storage** via Supabase Postgres
- ✅ **Real LLM call** doing meaningful work (Claude Sonnet 4 for extraction + matching + proposal writing)
- ✅ **External integration** — Resend (email) + Stripe (payment link). Two integrations, not one
- ✅ **Documented `.env.example`** at repo root
- ✅ **Human-in-the-loop** approval before any customer-facing send
- ✅ **Error handling** on AI output (JSON schema validation, retry once, then surface to user)
- ✅ **Cost considerations** — log token usage per action

---

## Tech Stack — Locked

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | One repo, one deploy, server actions for AI calls |
| Styling | Tailwind + shadcn/ui | Fast, looks professional, no design time wasted |
| Database | Supabase Postgres | Required by brief, instant Postgres + Storage + Auth |
| Auth | Supabase Auth (email + password) | Single admin user for MVP |
| File Storage | Supabase Storage | Voice memos, generated PDFs |
| LLM | Claude Sonnet 4 (`claude-sonnet-4-20250514`) | Best at structured extraction + tool use |
| Transcription | OpenAI Whisper API (`whisper-1`) | Cheap, accurate, simple |
| Email | Resend | Cleanest API, free tier covers MVP |
| Payment Link | Stripe Payment Links API | One API call → one link, no checkout build needed |
| PDF | `@react-pdf/renderer` (server-side) | React-based, easy to template |
| Deploy | Vercel | Native Next.js, free tier covers MVP |

**Do not introduce anything outside this list without flagging first.**

---

## Database Schema

Run this SQL in Supabase SQL Editor first. RLS policies included.

```sql
-- USERS (just Marcus for MVP, but built for multi-user)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- CLIENTS (customers receiving proposals)
create table clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  address text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- PRICING_ITEMS (Greenscape's 200-line catalog — seeded from CSV)
create table pricing_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  description text,
  category text,                -- one of: hardscape | landscape | irrigation | lighting | water_feature | turf | labor
  unit text not null,           -- 'sqft', 'each', 'lf', 'hour'
  unit_price numeric(10,2) not null,
  keywords text[],              -- for matching aid
  active boolean default true,
  created_at timestamptz default now()
);

-- SITE_WALKS (one per visit)
create table site_walks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  audio_url text,
  transcription text,
  transcription_status text default 'pending', -- pending | done | failed
  notes text,
  walked_at timestamptz default now(),
  created_by uuid references users(id)
);

-- PROPOSALS
create table proposals (
  id uuid primary key default gen_random_uuid(),
  site_walk_id uuid references site_walks(id) on delete set null,
  client_id uuid references clients(id) on delete cascade,
  status text default 'drafting',
    -- drafting | needs_review | approved | sent | rejected
  subtotal numeric(12,2),
  tax numeric(12,2) default 0,
  total numeric(12,2),
  proposal_md text,             -- generated proposal body
  pdf_url text,                 -- after PDF render
  stripe_payment_link text,
  needs_render boolean default false,  -- true if total > $30K
  confidence_score numeric(3,2),       -- 0.00–1.00 overall match confidence
  flags jsonb,                  -- array of warnings/notes for reviewer
  approved_by uuid references users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- PROPOSAL_LINE_ITEMS
create table proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade,
  pricing_item_id uuid references pricing_items(id),
  scope_description text not null,  -- what the AI heard
  matched_name text,                -- what pricing item it mapped to
  quantity numeric(10,2) not null,
  unit text,
  unit_price numeric(10,2) not null,
  line_total numeric(12,2) not null,
  confidence numeric(3,2),          -- per-line confidence
  needs_review boolean default false,
  position int default 0
);

-- AI_ACTIONS (cost + debug log)
create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete set null,
  action_type text not null,        -- transcribe | extract_scope | match_pricing | write_proposal
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  duration_ms int,
  success boolean,
  error_message text,
  created_at timestamptz default now()
);

-- INDEXES
create index on pricing_items (category) where active = true;
create index on pricing_items using gin (keywords);
create index on proposals (status);
create index on proposals (client_id);
create index on proposal_line_items (proposal_id);
create index on ai_actions (proposal_id);

-- RLS — admin-only for MVP
alter table users enable row level security;
alter table clients enable row level security;
alter table pricing_items enable row level security;
alter table site_walks enable row level security;
alter table proposals enable row level security;
alter table proposal_line_items enable row level security;
alter table ai_actions enable row level security;

create policy "authenticated read all" on clients for select using (auth.role() = 'authenticated');
create policy "authenticated write all" on clients for all using (auth.role() = 'authenticated');
-- Repeat the above pattern for the other tables
```

---

## File Structure

```
/
├── .env.example
├── README.md
├── CLAUDE.md                      ← this file
├── STRATEGY.md                    ← the 2-page strategy doc
├── seed/
│   └── pricing_items.csv          ← 200 fake-but-realistic line items
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               ← landing → redirect to /dashboard
│   │   ├── login/page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx           ← list of proposals by status
│   │   │   └── proposals/[id]/
│   │   │       └── page.tsx       ← review + approve view
│   │   ├── site-walk/
│   │   │   └── new/page.tsx       ← mobile-friendly recorder
│   │   └── api/
│   │       ├── site-walks/route.ts
│   │       ├── transcribe/route.ts
│   │       ├── proposals/
│   │       │   ├── generate/route.ts    ← scope + match + write
│   │       │   ├── [id]/approve/route.ts
│   │       │   └── [id]/send/route.ts
│   │       └── webhooks/
│   │           └── stripe/route.ts      ← deposit-paid hook (optional)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── ai/
│   │   │   ├── anthropic.ts             ← Claude client
│   │   │   ├── openai.ts                ← Whisper client
│   │   │   ├── extract-scope.ts         ← prompt + JSON schema
│   │   │   ├── match-pricing.ts         ← prompt + scoring
│   │   │   └── write-proposal.ts        ← prompt + format
│   │   ├── pdf/
│   │   │   └── proposal-template.tsx    ← @react-pdf template
│   │   ├── email/
│   │   │   └── send-proposal.ts         ← Resend wrapper
│   │   ├── stripe/
│   │   │   └── create-payment-link.ts
│   │   └── cost.ts                       ← per-model pricing map
│   ├── components/
│   │   ├── ui/                           ← shadcn primitives
│   │   ├── VoiceRecorder.tsx
│   │   ├── ProposalEditor.tsx
│   │   ├── LineItemRow.tsx
│   │   └── ConfidenceBadge.tsx
│   └── types/
│       └── db.ts                         ← generated Supabase types
└── public/
```

---

## AI Prompts — Exact Specs

### 1. Scope extraction

**Input:** transcription text
**Model:** `claude-sonnet-4-20250514`
**Output:** structured JSON

```ts
// Expected JSON schema
{
  client_signals: {
    suggested_name: string | null,
    suggested_address: string | null,
    timeline_mentioned: string | null,
    budget_mentioned: string | null
  },
  scope_items: [
    {
      description: string,        // raw scope as heard
      category_hint: string,      // hardscape | landscape | irrigation | lighting | water_feature | other
      quantity_hint: number | null,
      unit_hint: string | null,   // sqft | each | lf | null
      notes: string | null
    }
  ],
  flags: string[]                  // e.g. ["HOA mentioned", "rush requested"]
}
```

Use Claude's structured output via JSON schema. Validate with Zod on receipt. If invalid: retry once with `temperature=0`, then surface to user as "extraction failed — please add scope manually."

### 2. Pricing match

**Per scope item**, send Claude the scope description + the full pricing catalog (200 items is well within context). Ask it to return:

```ts
{
  matched_sku: string | null,
  matched_name: string | null,
  confidence: number,              // 0.0–1.0
  quantity: number,
  unit: string,
  reasoning: string                // 1 sentence
}
```

If `confidence < 0.7`: mark line as `needs_review = true`.

### 3. Proposal write-up

**Input:** matched line items + client info
**Output:** markdown proposal body using the Greenscape voice: confident, premium, specific.

Template the cover note, scope summary, line items table, payment terms (50% deposit, 50% on completion), and timeline boilerplate. Total at the bottom.

---

## Implementation Order

> Each phase = one commit (or two if cleanly separable). Do not batch.

### Phase 0 — Project Skeleton (30 min)

1. `npx create-next-app@latest` with TypeScript + Tailwind + App Router
2. Install: `@supabase/supabase-js @supabase/ssr @anthropic-ai/sdk openai resend stripe @react-pdf/renderer zod`
3. Initialise shadcn/ui, install: button, input, table, card, dialog, badge, textarea
4. Create `.env.example` with all keys (see env section below)
5. **Commit: "Project skeleton with Next.js, Tailwind, shadcn"**

### Phase 1 — Supabase Setup (30 min)

1. Create Supabase project, paste schema SQL from above
2. Create Storage bucket: `site-walk-audio` (private), `proposal-pdfs` (private with signed URLs)
3. Generate TS types: `npx supabase gen types typescript`
4. Build `src/lib/supabase/client.ts` and `server.ts`
5. Seed `pricing_items` from the **provided** `seed/pricing_items.csv` using `scripts/seed.ts` (full spec in the Seed Data section below — uses pipe-delimited keywords, requires `csv-parse` and `tsx`)
6. **Commit: "Supabase schema, storage, seed data"**

### Phase 2 — Auth + Dashboard Shell (45 min)

1. Login page with Supabase email/password
2. Middleware redirecting unauthenticated users
3. `/dashboard` showing proposals grouped by status (drafting, needs_review, approved, sent)
4. Empty states + loading skeletons
5. **Commit: "Auth + dashboard shell"**

### Phase 3 — Site Walk Capture (90 min)

1. `/site-walk/new` page — mobile-first
2. Client form fields: client name, email, phone, address (manual for MVP — autofill from transcription in Phase 5 polish)
3. `VoiceRecorder.tsx` component using MediaRecorder API
4. POST audio to `/api/site-walks` → uploads to Supabase Storage → creates `site_walks` row → returns id
5. **Commit: "Site walk capture with voice recording"**

### Phase 4 — Transcription (45 min)

1. `/api/transcribe` route: takes `site_walk_id`, downloads audio, calls Whisper
2. Updates `site_walks.transcription` + `transcription_status = done`
3. Logs to `ai_actions`
4. Triggered automatically on upload completion
5. Handle failures: log to `ai_actions` with `success=false`, set `transcription_status=failed`
6. **Commit: "Whisper transcription pipeline"**

### Phase 5 — Scope Extraction + Pricing Match (2 hr — the brain)

1. `src/lib/ai/extract-scope.ts` with the prompt from above
2. `src/lib/ai/match-pricing.ts` — pulls all active pricing items, sends with each scope item
3. `/api/proposals/generate` route: takes `site_walk_id`, runs extract → match → creates `proposals` + `proposal_line_items` rows
4. Aggregate confidence: average per-line confidence, weighted by `line_total`
5. Flags array populated with: items needing review, items not matched at all, HOA mentions, rush mentions, total >$30K (needs render)
6. Updates `proposals.status = 'needs_review'`
7. Log all token usage to `ai_actions`
8. **Commit: "Scope extraction and pricing match"**

### Phase 6 — Proposal Generation (60 min)

1. `src/lib/ai/write-proposal.ts` — generates markdown body using matched line items
2. Store in `proposals.proposal_md`
3. **Commit: "Proposal markdown generation"**

### Phase 7 — Review Dashboard (90 min)

1. `/dashboard/proposals/[id]` — review page
2. Left side: scope items as editable table (quantity, price, matched item) with confidence badges
3. Right side: rendered proposal preview (markdown → HTML)
4. Flags banner at top (yellow/red)
5. Buttons: "Edit", "Approve & Generate PDF", "Reject"
6. **Commit: "Proposal review and edit interface"**

### Phase 8 — PDF + Send (90 min)

1. On Approve: render PDF via `@react-pdf/renderer`, upload to Storage, save URL
2. Create Stripe Payment Link for 50% of total (with metadata: `proposal_id`)
3. Resend email to client with: short cover note, PDF attached, payment link CTA
4. Update `proposals.status = 'sent'`, set `sent_at`
5. **Commit: "PDF generation and email send"**

### Phase 9 — Error Handling Pass (45 min)

1. Wrap every AI call in try/catch with structured error logging
2. Retry once on transient failures (rate limit, 5xx)
3. Surface failures to dashboard with retry button
4. Validate ALL AI JSON output with Zod; on schema failure, retry once then fail
5. **Commit: "Error handling and retry logic"**

### Phase 10 — Deploy + Final Polish (45 min)

1. Push to GitHub (public or invite L&S team)
2. Connect Vercel, set env vars, deploy
3. Test full flow end-to-end on production URL
4. Add seed data on production Supabase
5. Update README with: deployed URL, how to test, architectural notes
6. **Commit: "Production deploy and documentation"**

---

## Environment Variables (`.env.example`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# OpenAI (Whisper only)
OPENAI_API_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=quotes@yourdomain.com

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Cost Per Quote (Document This)

| Step | Model | Approx Cost |
|---|---|---|
| Transcription | Whisper (10 min avg) | $0.06 |
| Scope extraction | Sonnet 4 | $0.04 |
| Pricing match (avg 8 items × ~3K input each) | Sonnet 4 | $0.10 |
| Proposal writing | Sonnet 4 | $0.04 |
| **Total per quote** |  | **~$0.24** |

For context: Marcus's current cost-per-quote is ~2 hours of his time. At any reasonable hourly cost, this is a 1000x+ cost reduction even before considering recovered deals.

---

## Guardrails

1. **Hard rule:** No proposal can be sent without `approved_by` being set in the database. The send endpoint must check this.
2. **Total >$120K:** force a `needs_render` flag and block auto-send entirely; banner reads "manual review required — high-value project".
3. **Confidence <0.6 on any line:** that line gets `needs_review=true`; the dashboard surfaces a yellow warning.
4. **No matched pricing item:** line is created with `pricing_item_id = null`, `unit_price = 0`, marked `needs_review=true`. Won't blow up the total but flags clearly.
5. **AI returns invalid JSON:** retry once with `temperature=0`, then mark the proposal `drafting` with error in `flags` and surface to user.
6. **Stripe link creation fails:** proposal can still be approved but send is blocked until link generates successfully (retry button).

---

## Seed Data — Pricing Items (Provided)

A pre-built catalog of 200 realistic Greenscape Pro line items is provided at `seed/pricing_items.csv`. **Do not generate replacement data.** Use this file as-is.

**Distribution (matches the schema):**

- Hardscape (60): pavers, concrete, walls, fire features, pergolas, outdoor kitchens
- Landscape (40): trees, shrubs, ground covers, soil prep
- Irrigation (30): drip, sprinkler, controllers, misc
- Lighting (20): path lights, uplights, wash, transformers, electrical
- Water features (15): boulders, fountains, waterfalls, koi ponds, plumbing
- Turf (15): turf types, base, infill, accessories
- Labor (20): demo, excavation, permits, design, management

**Price range:** $0.00 (warranties/inclusive items) to $28,000.00 (custom ramada). Average paver is $14–$28/sqft, fire pits $2.4K–$22K, pergolas $7.8K–$28K. These are Phoenix-market premium-tier prices.

**CSV format:**

```
sku,name,description,category,unit,unit_price,keywords
HSC-PAV-001,Standard Concrete Paver 4x8,"Basic gray or tan concrete paver, installed on aggregate base",hardscape,sqft,14.50,paver|concrete paver|patio|standard paver
```

**Important parsing notes:**

- `keywords` is **pipe-delimited** (`|`), not a JSON array or Postgres literal. The seed script must split on `|` and convert to a string array before insert.
- `description` may contain commas; the CSV is properly quoted — use a real CSV parser, not `.split(",")`.
- `unit_price` is a string with 2 decimal places — cast to number before insert.
- `category` values map exactly to the partial index in the schema: `hardscape | landscape | irrigation | lighting | water_feature | turf | labor`.

**Seed script (`scripts/seed.ts`) — exact spec:**

```ts
// Pseudocode for the seed script
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!     // service role required for seeding
);

const csv = fs.readFileSync("seed/pricing_items.csv", "utf-8");
const rows = parse(csv, { columns: true, skip_empty_lines: true });

const items = rows.map((r: any) => ({
  sku: r.sku,
  name: r.name,
  description: r.description,
  category: r.category,
  unit: r.unit,
  unit_price: parseFloat(r.unit_price),
  keywords: r.keywords.split("|"),
  active: true,
}));

// Insert in chunks of 100 to stay under payload limits
for (let i = 0; i < items.length; i += 100) {
  const chunk = items.slice(i, i + 100);
  const { error } = await supabase.from("pricing_items").upsert(chunk, { onConflict: "sku" });
  if (error) throw error;
}
console.log(`Seeded ${items.length} pricing items.`);
```

Run with: `npx tsx scripts/seed.ts`. Add `csv-parse` and `tsx` to devDependencies.

---

## Demo Script for the End-to-End Test

Before recording the Loom, run this exact flow on the deployed URL:

1. Log in as Marcus
2. Click "New Site Walk"
3. Enter test client: "Sarah Chen", `sarah@example.com`
4. Record a 60-second voice memo describing a realistic scope: *"Sarah's backyard, about 800 square feet of premium tumbled concrete pavers, a custom 42-inch gas fire pit, three Mediterranean fan palms, drip irrigation around the perimeter with a smart 8-zone controller, low-voltage bronze path lighting both sides. Premium tier. HOA approval will be needed."*
5. Stop recording → see status transitions: "Transcribing..." → "Extracting scope..." → "Matching pricing..." → "Drafting proposal..."
6. Land on the review page. You should see line items mapped to roughly:
   - HSC-PAV-002 (Premium Tumbled Concrete Paver) × 800 sqft = $14,400
   - HSC-FPT-001 (Custom Gas Fire Pit Round 42in) × 1 = $4,200
   - LND-TRE-003 (Mediterranean Fan Palm) × 3 = $2,550
   - IRR-DRP-001 (Drip Line) + IRR-CTR-001 (Smart Controller 8 Zone) + zone valves
   - LGT-PTH-001 (Path Light LED Bronze) × ~8 + LGT-TRF-001 (300W transformer) + wire
   - LAB-PRM-002 (HOA Submission Package) flag
   - Total in the $25K–$35K range
7. Confirm the "HOA mentioned" flag is at the top of the page
8. Approve
9. See PDF generated, email sent, status flips to `sent`
10. Open the inbox of the test email — proposal PDF + Stripe link both present

The recognisable SKUs landing in the review table is the moment the Loom audience realises this isn't a stub — it's actually matching against a real catalogue. Make sure the demo script reads cleanly into items that the CSV contains.

If any step breaks: fix before recording.

---

## README.md Requirements (for the repo)

The README must include:
- One-paragraph project summary
- Deployed URL (top of file)
- Loom link
- Architecture diagram (can be ASCII or a single image)
- Local setup instructions (clone → env → seed → run)
- Cost-per-quote breakdown
- What I'd build next if I had another week (link to STRATEGY.md for full thinking)
- Known limitations (be honest — what would break first at scale)

---

## What "What I'd Build Next" Section Should Say (For The Loom)

If they ask what's next, the answer is: **Post-Sign Onboarding Agent (Strategy #3)**. Reason: as soon as quote velocity goes up, post-sign bottleneck becomes the new constraint. Building #3 immediately keeps the unblock momentum going. This is the interdependency call-out the brief asks for.

---

## Honest Trade-offs (For The Loom + Live Walkthrough)

Be ready to volunteer these unprompted — it scores points:

1. **Pricing match is LLM-based, not vector search.** Faster to ship, accurate enough for 200 items. Would migrate to embeddings if catalog grew past 1000 items.
2. **No multi-user RLS in MVP.** Single-admin design. Multi-tenancy is a real refactor — would do it before selling this as a product.
3. **No mobile native app.** Web-only voice capture. Browser MediaRecorder works fine; native would only matter if offline use was required.
4. **Stripe link, not full checkout.** Faster to ship, but loses customisation. Full embedded checkout if this was the long-term billing flow.
5. **What breaks first at scale:** the pricing match loop runs sequentially per line item. At 50+ items it would feel slow. Parallel calls with rate limiting is the fix.

---

## Done = Recording the Loom

When this entire spec is built, tested, deployed, and the demo script runs clean — only then record the Loom. See `LOOM_SCRIPT.md` for what to cover in 5 minutes.
