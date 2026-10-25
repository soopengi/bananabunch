-- Each circle is stored as one JSON document: "group" (the private circle) and
-- "demo" (shared sample data). `version` goes up on every save, so two people
-- saving at the same moment can't overwrite each other's changes.
create table if not exists public.circles (
  id text primary key,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Row-level security on, with no policies: the browser can't read or write
-- this table at all. Only the "circle" Edge Function (using the service role
-- key) can, and it enforces who may see and change what.
alter table public.circles enable row level security;
