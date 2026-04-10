-- ============================================================================
-- MATIJAMON BACHELOR — Supabase Schema
-- Run this entire file in Supabase SQL Editor to set up the database.
-- ============================================================================

-- Drop existing tables (safe to re-run)
drop table if exists public.player_actions cascade;
drop table if exists public.players cascade;
drop table if exists public.rooms cascade;

-- ============================================================================
-- ROOMS — one row per game session
-- ============================================================================
create table public.rooms (
    code text primary key,                     -- 4-letter join code (e.g. "DECK")
    state jsonb not null default '{}'::jsonb,  -- entire game state (current card, round, etc.)
    host_id text,                              -- random ID of the host browser
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_activity timestamptz not null default now()
);

create index rooms_last_activity_idx on public.rooms(last_activity);

-- ============================================================================
-- PLAYERS — one row per player joined to a room
-- ============================================================================
create table public.players (
    id uuid primary key default gen_random_uuid(),
    room_code text not null references public.rooms(code) on delete cascade,
    name text not null,
    fighter_id text not null,
    is_groom boolean not null default false,
    is_kum boolean not null default false,
    total_sips integer not null default 0,
    total_shots integer not null default 0,
    chickened_out_count integer not null default 0,
    drinks_caused integer not null default 0,
    cards_drawn integer not null default 0,
    mates jsonb not null default '[]'::jsonb,
    joined_at timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    -- Each player gets a session token they keep in localStorage to reconnect
    session_token text not null
);

create index players_room_idx on public.players(room_code);
create unique index players_room_session_idx on public.players(room_code, session_token);

-- ============================================================================
-- PLAYER_ACTIONS — vote/input events from players (host reads them)
-- ============================================================================
create table public.player_actions (
    id uuid primary key default gen_random_uuid(),
    room_code text not null references public.rooms(code) on delete cascade,
    player_id uuid not null references public.players(id) on delete cascade,
    action_type text not null,                -- 'vote', 'pick', 'chicken', 'did_it', 'agree', 'disagree', etc.
    payload jsonb not null default '{}'::jsonb,
    card_id text,                             -- for vote attribution to a specific card
    created_at timestamptz not null default now()
);

create index actions_room_idx on public.player_actions(room_code);
create index actions_card_idx on public.player_actions(card_id);

-- ============================================================================
-- ROW LEVEL SECURITY — anyone can read/write rooms they have the code for
-- (we trust the room code as a "secret" for this party game)
-- ============================================================================
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.player_actions enable row level security;

-- Rooms: anyone (anon) can do everything (no auth in this game)
create policy "rooms_anon_all" on public.rooms
    for all using (true) with check (true);

create policy "players_anon_all" on public.players
    for all using (true) with check (true);

create policy "actions_anon_all" on public.player_actions
    for all using (true) with check (true);

-- ============================================================================
-- REALTIME — enable realtime broadcasts on these tables
-- ============================================================================
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.player_actions;

-- ============================================================================
-- CLEANUP — auto-delete rooms older than 24 hours
-- (we won't run this on a schedule for now, but we can call it manually)
-- ============================================================================
create or replace function public.cleanup_old_rooms()
returns void as $$
begin
    delete from public.rooms where last_activity < now() - interval '24 hours';
end;
$$ language plpgsql security definer;

-- ============================================================================
-- DONE
-- ============================================================================
-- Verify with:
--   select * from public.rooms;
--   select * from public.players;
