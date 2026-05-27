# Quote Acceleration Agent

> **Deployed URL:** https://l-s-test.vercel.app
> **GitHub:** https://github.com/mjesssa/L-S-test
> **Loom walkthrough:** _(added after recording)_

Turns a contractor's site-walk voice memo into a sent customer proposal in under 24 hours, with mandatory human approval before any external send. Built for the License & Scale AI Developer take-home (client: Greenscape Pro, Phoenix AZ).

The full priority audit and the rationale for picking this as the P0 agent lives in [`STRATEGY.md`](STRATEGY.md). The full build spec — schema, prompts, guardrails — lives in [`CLAUDE.md`](CLAUDE.md).

---

## What it does

```
┌───────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────────┐
│ Voice memo on │    │   Whisper    │    │   Claude     │    │   Claude   │    │  Reviewer    │
│ mobile (site  │───▶│ transcribe   │───▶│  extract     │───▶│   match    │───▶│   reviews    │
│   walk)       │    │              │    │   scope      │    │  pricing   │    │  & approves  │
└───────────────┘    └──────────────┘    └──────────────┘    └────────────┘    └──────┬───────┘
                                                                                       │
                            ┌──────────────────────────────────────────────────────────┘
                            ▼
                    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                    │  PDF render  │───▶│   Stripe     │───▶│   Resend     │
                    │ @react-pdf   │    │ Payment Link │    │  email out   │
                    │              │    │ (50% deposit)│    │ + PDF attach │
                    └──────────────┘    └──────────────┘    └──────────────┘
```

Every AI step:
- Logs cost + tokens + duration to `ai_actions` (Supabase table).
- Validates output with Zod, retries once with `temperature=0` on schema failure, then surfaces the failure to the dashboard with a retry button.

The send route (`POST /api/proposals/[id]/send`) checks `approved_by IS NOT NULL` at the database layer before any external call. Human in the loop is enforced in the data, not the UI.

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) | One repo, server actions, easy Vercel deploy |
| Styling | Tailwind v4 + shadcn/ui | Fast, looks like a real product |
| Database | Supabase Postgres | Required by brief, instant Postgres + Storage + Auth |
| Auth | Supabase email/password | Single admin; multi-tenant is post-MVP |
| File storage | Supabase Storage (private buckets) | Audio + signed-URL PDFs |
| LLM | Claude Sonnet 4 (`claude-sonnet-4-20250514`) | Best at structured extraction; swappable via `ANTHROPIC_MODEL` env var |
| Transcription | OpenAI Whisper (`whisper-1`) | Cheap, accurate, simple |
| Email | Resend | Cleanest API; free tier covers demo via `onboarding@resend.dev` |
| Payment link | Stripe Payment Links API | One API call → one link; full checkout is future work |
| PDF | `@react-pdf/renderer` (server-side) | React-based template, no headless browser |
| Deploy | Vercel | Native Next.js; ~30 sec rebuilds |

**Schema** lives in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql). Seven tables: `users`, `clients`, `pricing_items`, `site_walks`, `proposals`, `proposal_line_items`, `ai_actions`. RLS on. A trigger mirrors new `auth.users` into `public.users` so app joins work.

**File layout** (the bits that matter):

```
src/
├── app/
│   ├── api/
│   │   ├── site-walks/route.ts          POST  upload audio, create client, create site walk
│   │   ├── transcribe/route.ts          POST  Whisper transcription
│   │   ├── proposals/
│   │   │   ├── generate/route.ts        POST  scope extract → pricing match → write proposal
│   │   │   └── [id]/send/route.ts       POST  PDF + Stripe link + Resend (gated on approved_by)
│   ├── login/                           email/password sign-in (Supabase)
│   ├── site-walk/new/                   mobile-friendly recorder + client form
│   └── dashboard/
│       ├── page.tsx                     proposals grouped by status + pending site walks
│       └── proposals/[id]/              editable line items + markdown preview + approve/send
├── lib/
│   ├── ai/{extract-scope,match-pricing,write-proposal,log,anthropic,openai}.ts
│   ├── supabase/{client,server,middleware}.ts
│   ├── pdf/proposal-template.tsx        @react-pdf Document
│   ├── stripe/create-payment-link.ts
│   ├── email/send-proposal.ts
│   └── cost.ts                          per-model token pricing for ai_actions
├── components/{VoiceRecorder,LineItemRow,ConfidenceBadge,...}
└── middleware.ts                        Supabase auth + route protection

seed/pricing_items.csv                   200-line Greenscape catalogue
scripts/seed.ts                          parses CSV → upserts pricing_items
```

---

## Local setup

1. **Clone and install.**
   ```bash
   git clone https://github.com/mjesssa/L-S-test.git
   cd L-S-test
   npm install
   ```

2. **Set up Supabase.** Create a project at https://supabase.com → SQL Editor → paste and run `supabase/migrations/0001_initial_schema.sql`. Then in Storage, create two private buckets: `site-walk-audio` and `proposal-pdfs`.

3. **Copy env and fill in keys.**
   ```bash
   cp .env.example .env
   ```
   You need Supabase URL/anon/service-role keys, an Anthropic key, an OpenAI key (Whisper), a Resend key, and a Stripe secret key. The `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-20250514`; change it here without touching code.

4. **Seed the pricing catalogue.**
   ```bash
   npm run seed
   ```
   Should print `Seeded 200 pricing items.`

5. **Create a user.** Supabase Dashboard → Authentication → Users → "Add user". Tick "Auto Confirm" so you can sign in immediately.

6. **Run.**
   ```bash
   npm run dev
   ```
   Visit http://localhost:3030. Sign in. Click "+ New site walk" and try the demo script below.

---

## Demo

1. Sign in.
2. Click **+ New site walk**.
3. Client name: `Sarah Chen`. Client email: **your own email** (see note below). Address: any.
4. Tap **Start recording** and read this scope aloud (~60 sec):
   > "Sarah's backyard, about 800 square feet of premium tumbled concrete pavers, a custom 42-inch gas fire pit, three Mediterranean fan palms, drip irrigation around the perimeter with a smart 8-zone controller, low-voltage bronze path lighting both sides. Premium tier. HOA approval will be needed."
5. Stop, submit. You'll land on `/dashboard` and see a "Transcribing" pill on the new site walk; refresh after ~15 sec to see the proposal appear in **Needs review**.
6. Open the proposal. You should see:
   - Recognisable SKUs: `Premium Tumbled Concrete Paver`, `Custom Gas Fire Pit Round 42in`, `Mediterranean Fan Palm × 3`, drip + smart controller, bronze path lighting + transformer, HOA submission package.
   - Total in the $25K–$35K range.
   - A flag at the top mentioning HOA.
7. **Approve**. Then **Send to customer**.
8. Open your inbox — PDF attached, Stripe payment link CTA.

> **Resend note for the demo:** the free `onboarding@resend.dev` sender only delivers to the email address that owns the Resend account. Use your own email as the client email when running the demo so you actually receive the proof message.

---

## Cost per quote

Per-call costs are logged to the `ai_actions` table on every run. Typical 8-item proposal:

| Step | Model | Approx cost |
|---|---|---|
| Transcription (10-min memo) | Whisper-1 | $0.06 |
| Scope extraction | Sonnet 4 | $0.04 |
| Pricing match (8 items × ~3K input each) | Sonnet 4 | $0.10 |
| Proposal write-up | Sonnet 4 | $0.04 |
| **Total per quote** | | **≈$0.24** |

For context: Marcus's current cost-per-quote is roughly **two hours of his time**. At any reasonable hourly cost, this is a 4-figure cost reduction per quote — and the upside is the 35–40% close-rate leakage we recover by being fast enough to beat competitors to the inbox.

Pricing constants live in [`src/lib/cost.ts`](src/lib/cost.ts) and are easy to update when vendor prices change.

---

## What I'd build next

**Post-Sign Onboarding Agent** (Strategy item #3). Once quote velocity goes up, the post-sign drag — HOA, permits, deposit chasing — becomes the new bottleneck. Building #3 immediately keeps the unblock momentum going. Full reasoning in [`STRATEGY.md`](STRATEGY.md).

Other immediate follow-ups:
- Stripe webhook on `payment_intent.succeeded` → auto-stage to "deposit paid" status and trigger the onboarding workflow.
- Replace the LLM-based pricing match with embedding search once the catalogue grows past 1,000 items.
- Per-user RLS and a real multi-tenant story (today everything is single-admin scoped).

---

## Known limitations (the honest version)

- **No SKU-swap UI** on edit. The reviewer can change the matched name as free text and the qty/price, but switching to a different `pricing_items` row needs a manual DB poke. Trivial to add — out of MVP scope.
- **`onboarding@resend.dev` only delivers to the Resend account owner's email.** Production would need a verified domain.
- **Stripe Payment Link, not embedded checkout.** Faster to ship; loses customisation. Full embedded checkout if this becomes the long-term billing flow.
- **Whisper duration cost is estimated from file size**, not the actual audio runtime (we don't run ffprobe server-side). The estimate is good to ±15% and only affects cost logging, not the user flow.
- **Supabase TypeScript generic doesn't fully propagate through hand-typed `Database`**, so you'll see `as never` casts on inserts and `.returns<T>()` on selects. Replacing `src/types/db.ts` with `supabase gen types typescript --project-id <id>` would clean these up — straightforward, deferred to keep the demo build tight.
- **Sequential `Promise.all` for pricing match.** Fine for 8 items, would saturate Anthropic rate limits at 50+. Switch to a small concurrency limiter (e.g., `p-limit(5)`) before that's a real problem.
- **No HOA / permit upload UI** for documents the customer needs to submit. Out of scope for the P0; lives in the Phase 3 ("Post-Sign Onboarding Agent") build.

---

## Submission checklist (per the brief)

- [x] Deployed to a public URL (Vercel)
- [x] GitHub repo with incremental commit history (one commit per phase)
- [x] Persistent storage via Supabase Postgres
- [x] Real LLM call doing meaningful work (extract + match + write — three Sonnet calls per quote)
- [x] Two external integrations (Resend + Stripe; Whisper + Supabase Storage also touched)
- [x] `.env.example` at repo root
- [x] Human-in-the-loop approval enforced at the data layer
- [x] Zod-validated AI output with retry-once + dashboard failure surface
- [x] Cost-per-action logging via `ai_actions` table
