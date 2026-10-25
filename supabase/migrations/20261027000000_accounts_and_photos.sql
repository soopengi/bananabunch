-- Adds what the bananacircle version needs: private photo storage, a way to
-- sign someone out everywhere, and removal of the old demo circle.

-- Private bucket for wishlist and gift-idea photos. Only the "circle" Edge
-- Function (service role) reads or writes it; people view photos through
-- short-lived signed links it hands out.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Signs a user out of every device by deleting their sessions (their refresh
-- tokens stop working). Used after password changes, resets and deletions.
create or replace function public.revoke_user_sessions(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = target;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- The shared demo circle is gone: the app is login-only now.
delete from public.circles where id = 'demo';
