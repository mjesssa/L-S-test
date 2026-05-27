# Greenscape Pro — AI Agent Strategy

**Client:** Greenscape Pro (Phoenix, AZ) · **Auditor:** [Candidate]
**Date:** 27 May 2026

---

## The 5 Agents — In Priority Order

### 1. Quote Acceleration Agent

**Purpose:** Turn a site walk into a sent proposal in under 24 hours, without Marcus drafting it.

- Ingests a voice memo + photos Marcus records during the site walk
- Transcribes, extracts structured scope, matches each item to Greenscape's 200-line pricing DB
- Generates a draft proposal PDF; flags any item not confidently matched
- Routes to Marcus's dashboard for one-click approval (or edit-then-approve)
- Sends final PDF via email with embedded Stripe deposit link

**Replaces:** Marcus's entire current workflow — site walk notes → pricing spreadsheet lookup → Google Doc → PDF → send. Today this takes 6–9 days. Target: under 24 hours, with Marcus's hands on it for ~10 minutes total.

**ROI:** Marcus loses 35–40% of qualified leads to faster competitors. Roughly 500 qualified leads/year (150 closes at ~30% lead-to-signed). Of the ~175 lost, recovering even 25% = ~44 deals × $28K = **$1.2M in recovered annual revenue**. Plus ~10 hours/week of Marcus's time returned.

**Why #1:** This is the only intervention that compounds. Every other agent helps a stock of deals or projects. This one rewires the flow — every future lead benefits, forever.

---

### 2. Closed-Lost Reactivation Agent

**Purpose:** Mine the 1,400 dead leads in GHL with personalised re-engagement that sounds like Marcus.

- Pulls closed-lost contacts and their GHL notes
- Generates a per-lead message referencing what they originally wanted (backyard, pergola, etc.) in Marcus's voice
- Drips outreach via GHL SMS/email, paced to avoid spam flags
- Marcus reviews batches of 20 in his dashboard before send

**Replaces:** Brittany's sporadic, generic re-engagement blasts.

**ROI:** 1,400 leads × 2% reactivation × $28K = **$784K latent revenue**. Marcus has already confirmed personalised outreach works; the system just makes it repeatable.

---

### 3. Post-Sign Onboarding Agent

**Purpose:** Stop the 4–6 week post-signature drag by automating HOA, permit, and deposit chasing.

- Triggers on contract signing in GHL
- Sends scheduled HOA submission package, deposit reminder, and design sign-off requests on a timeline
- Escalates to Jenna only when a customer goes silent past defined thresholds
- Live dashboard: every signed project, what stage it's stuck at, days in limbo

**Replaces:** Jenna's manual chasing across Slack, email, and phone.

**ROI:** 8–12 projects in limbo at $28K average = **$224K–$336K in delayed revenue at any time**. Cutting the average post-sign cycle from 4 weeks to 2 unlocks ~2 extra crew weeks per year = ~$200K additional throughput.

---

### 4. Build Communication Agent

**Purpose:** Send a Marcus-voiced customer update every time CompanyCam fires.

- Hooks CompanyCam webhook on photo upload
- Drafts a 3-sentence "here's what we did today" update in Marcus's voice, attaches photo
- Auto-sends for routine progress; flags milestone events (demo done, pour done, final walk) for Marcus to record a 30-second Loom
- Tracks customer message-open rate per project

**Replaces:** Inconsistent crew-lead texting; eliminates the daily "what's happening" inbound to Jenna.

**ROI:** Eliminates ~5–10 anxiety calls/week to Jenna. More importantly, Marcus has confirmed update-rich projects drive referrals. Lifting referral rate by 1 deal/month = $336K/year.

---

### 5. Small Approvals Decision Agent

**Purpose:** Codify Marcus's pricing and approval framework so Jenna stops pinging him 5–10x/day.

- Marcus answers ~50 "what would you charge / what would you do" scenarios up front (one weekend's work)
- Agent handles routine change orders, refund requests, add-on pricing inside set guardrails
- Escalates only edge cases to Marcus
- Logs every decision so the framework refines over time

**Replaces:** Slack interrupt-driven decision-making.

**ROI:** Returns ~1 hour/day of Marcus's focus + frees Jenna from being a relay. Real number is the meta-value: Marcus's evenings back, which he explicitly asked for.

---

## Two Required Answers

### Why is #1 the right #1, not Marcus's stated #1?

Marcus's stated #1 *is* quote speed — and I agree on the headline. But we disagree on the diagnosis. Marcus believes the problem is **speed**. The actual problem is that **he is the only person in the company who can turn a site walk into a proposal**. Speed is a symptom; bottleneck is the disease.

If you "just speed up quoting" without fixing the bottleneck, you get a slightly faster Marcus — still capped at his bandwidth, still the single point of failure, still working evenings he says he wants back. The agent has to do the cognitive work (interpret site walk → assemble scope → price it), not just the typing. That's why this isn't a template-filler; it's a codification of Marcus's pricing brain. Same #1, different theory of the case.

### One agent I considered but did not include — and why not

**Crew Coaching Agent in their pocket.** Marcus's stated #3, and emotionally important to him. The math kills it: 4 crews × 1 miss/week × $500 = ~$104K/year. That's an order of magnitude below the quote-cycle leakage. Worse, the adoption risk is high — crews working in 105°F heat aren't pulling out phones to ask an AI for upsell scripts mid-install. The right fix here isn't an AI agent; it's a 30-minute weekly crew huddle and a one-page upsell cheat sheet laminated in every truck. Telling Marcus that, and not building him an agent for it, is part of the audit.

---

## Interdependencies (Worth Flagging)

- **#1 unblocks #3.** Faster quotes mean more signed projects which means more pressure on post-sign onboarding. Build #1, then immediately #3 — otherwise the bottleneck just moves downstream.
- **#5 makes everything else stick.** If Marcus is still being pinged 10x/day on approvals, he doesn't have bandwidth to review the queues from #1 and #2. #5 is unglamorous infrastructure that protects the value of the others.
- **#2 has the fastest time-to-cash** (no operational change required), but doesn't compound. Good ROI, not strategic.
