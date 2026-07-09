-- Cozy Canvas Database Schema

-- Enable UUID extension if not enabled
create extension if not exists "uuid-ossp";

-- 1. ROOMS TABLE
create table if not exists public.rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    host_id text not null,
    status text not null default 'waiting', -- 'waiting', 'playing', 'finished'
    settings jsonb not null default '{"maxRounds": 3, "roundDuration": 60, "collabMode": false}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for rooms
alter table public.rooms enable row level security;

create policy "Allow public access to rooms" 
    on public.rooms for all 
    using (true) 
    with check (true);

-- 2. ROUNDS TABLE
create table if not exists public.rounds (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms(id) on delete cascade,
    round_number integer not null,
    prompt text not null,
    status text not null default 'drawing', -- 'drawing', 'reveal', 'completed'
    duration_seconds integer not null default 60,
    started_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for rounds
alter table public.rounds enable row level security;

create policy "Allow public access to rounds" 
    on public.rounds for all 
    using (true) 
    with check (true);

-- 3. DRAWINGS TABLE
create table if not exists public.drawings (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms(id) on delete cascade,
    round_id uuid references public.rounds(id) on delete cascade,
    player_id text not null,
    player_name text not null,
    canvas_data jsonb not null, -- Stores the JSON structure of lines/shapes
    image_url text, -- Storage URL for exported PNG/JPEG
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    -- Ensure a player has only one drawing per room+round combination
    unique (room_id, round_id, player_id)
);

-- Enable RLS for drawings
alter table public.drawings enable row level security;

create policy "Allow public access to drawings" 
    on public.drawings for all 
    using (true) 
    with check (true);

-- 4. STORAGE BUCKET FOR EXPORTED IMAGES
-- Create bucket for storing drawing png exports
insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', true)
on conflict (id) do nothing;

-- Add policies to allow anonymous upload and download of drawings
create policy "Allow public select from drawings bucket"
on storage.objects for select
using (bucket_id = 'drawings');

create policy "Allow public insert into drawings bucket"
on storage.objects for insert
with check (bucket_id = 'drawings');

create policy "Allow public update of drawings bucket"
on storage.objects for update
using (bucket_id = 'drawings');

create policy "Allow public delete from drawings bucket"
on storage.objects for delete
using (bucket_id = 'drawings');

-- 5. REALTIME REPLICATION ENABLEMENT
-- Drop the publication if it already exists or just attempt to add tables to publication
-- In Supabase, the publication is typically named 'supabase_realtime'
begin;
  -- If supabase_realtime publication exists, add our tables to it
  do $$
  begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.rooms;
      alter publication supabase_realtime add table public.rounds;
      alter publication supabase_realtime add table public.drawings;
    end if;
  end $$;
commit;
