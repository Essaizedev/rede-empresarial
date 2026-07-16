-- Empresa 3D: cenário persistente por código de sala.
-- Execute este arquivo no Supabase: SQL Editor > New query > Run.

create table if not exists public.scenes (
  room_code text primary key,
  scene jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint scenes_room_code_format
    check (room_code ~ '^[A-Za-z0-9_-]{1,50}$'),
  constraint scenes_scene_is_array
    check (jsonb_typeof(scene) = 'array')
);

alter table public.scenes enable row level security;

grant select, insert, update on table public.scenes to anon;

drop policy if exists "visitantes podem ler cenarios" on public.scenes;
create policy "visitantes podem ler cenarios"
on public.scenes
for select
to anon
using (true);

drop policy if exists "visitantes podem criar cenarios" on public.scenes;
create policy "visitantes podem criar cenarios"
on public.scenes
for insert
to anon
with check (
  room_code ~ '^[A-Za-z0-9_-]{1,50}$'
  and jsonb_typeof(scene) = 'array'
);

drop policy if exists "visitantes podem atualizar cenarios" on public.scenes;
create policy "visitantes podem atualizar cenarios"
on public.scenes
for update
to anon
using (true)
with check (
  room_code ~ '^[A-Za-z0-9_-]{1,50}$'
  and jsonb_typeof(scene) = 'array'
);
