-- Quote Acceleration Agent — initial schema
-- Run in the Supabase SQL Editor on a fresh project.

-- USERS (mirrors auth.users for app-level joins)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- CLIENTS (customers receiving proposals)
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  address text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- PRICING_ITEMS (Greenscape's catalogue — seeded from CSV)
create table if not exists pricing_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  description text,
  category text,                -- hardscape | landscape | irrigation | lighting | water_feature | turf | labor
  unit text not null,           -- 'sqft' | 'each' | 'lf' | 'hour'
  unit_price numeric(10,2) not null,
  keywords text[],
  active boolean default true,
  created_at timestamptz default now()
);

-- SITE_WALKS (one per visit)
create table if not exists site_walks (
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
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  site_walk_id uuid references site_walks(id) on delete set null,
  client_id uuid references clients(id) on delete cascade,
  status text default 'drafting',
    -- drafting | needs_review | approved | sent | rejected
  subtotal numeric(12,2),
  tax numeric(12,2) default 0,
  total numeric(12,2),
  proposal_md text,
  pdf_url text,
  stripe_payment_link text,
  needs_render boolean default false,  -- true when total > $30K (render recommended)
  high_value_block boolean default false, -- true when total > $120K (manual review required)
  confidence_score numeric(3,2),       -- 0.00–1.00 overall match confidence
  flags jsonb,                         -- array of warnings/notes for reviewer
  approved_by uuid references users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- PROPOSAL_LINE_ITEMS
create table if not exists proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade,
  pricing_item_id uuid references pricing_items(id),
  scope_description text not null,
  matched_name text,
  quantity numeric(10,2) not null,
  unit text,
  unit_price numeric(10,2) not null,
  line_total numeric(12,2) not null,
  confidence numeric(3,2),
  needs_review boolean default false,
  position int default 0
);

-- AI_ACTIONS (cost + debug log)
create table if not exists ai_actions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete set null,
  site_walk_id uuid references site_walks(id) on delete set null,
  action_type text not null,           -- transcribe | extract_scope | match_pricing | write_proposal
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
create index if not exists pricing_items_category_active_idx
  on pricing_items (category) where active = true;
create index if not exists pricing_items_keywords_gin_idx
  on pricing_items using gin (keywords);
create index if not exists proposals_status_idx on proposals (status);
create index if not exists proposals_client_id_idx on proposals (client_id);
create index if not exists proposal_line_items_proposal_id_idx
  on proposal_line_items (proposal_id);
create index if not exists ai_actions_proposal_id_idx on ai_actions (proposal_id);

-- ROW LEVEL SECURITY — single-admin MVP, any authenticated user can read/write
alter table users enable row level security;
alter table clients enable row level security;
alter table pricing_items enable row level security;
alter table site_walks enable row level security;
alter table proposals enable row level security;
alter table proposal_line_items enable row level security;
alter table ai_actions enable row level security;

-- Drop existing policies (idempotent re-run support) then recreate
do $$
declare
  t text;
begin
  foreach t in array array['users','clients','pricing_items','site_walks',
                            'proposals','proposal_line_items','ai_actions']
  loop
    execute format('drop policy if exists "authenticated read %1$s" on %1$s', t);
    execute format('drop policy if exists "authenticated write %1$s" on %1$s', t);
  end loop;
end $$;

create policy "authenticated read users"               on users               for select using (auth.role() = 'authenticated');
create policy "authenticated write users"              on users               for all    using (auth.role() = 'authenticated');
create policy "authenticated read clients"             on clients             for select using (auth.role() = 'authenticated');
create policy "authenticated write clients"            on clients             for all    using (auth.role() = 'authenticated');
create policy "authenticated read pricing_items"       on pricing_items       for select using (auth.role() = 'authenticated');
create policy "authenticated write pricing_items"      on pricing_items       for all    using (auth.role() = 'authenticated');
create policy "authenticated read site_walks"          on site_walks          for select using (auth.role() = 'authenticated');
create policy "authenticated write site_walks"         on site_walks          for all    using (auth.role() = 'authenticated');
create policy "authenticated read proposals"           on proposals           for select using (auth.role() = 'authenticated');
create policy "authenticated write proposals"          on proposals           for all    using (auth.role() = 'authenticated');
create policy "authenticated read proposal_line_items" on proposal_line_items for select using (auth.role() = 'authenticated');
create policy "authenticated write proposal_line_items" on proposal_line_items for all   using (auth.role() = 'authenticated');
create policy "authenticated read ai_actions"          on ai_actions          for select using (auth.role() = 'authenticated');
create policy "authenticated write ai_actions"         on ai_actions          for all    using (auth.role() = 'authenticated');

-- Auto-create a users row when a new auth.users row is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
