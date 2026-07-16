-- EMPRESA 3D INTELIGENTE — ATUALIZAÇÃO V2
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run.
-- Mantém entrada sem login e protege somente a publicação com senha de edição.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scenes (
  room_code text primary key,
  scene jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  editor_pin_hash text,
  constraint scenes_room_code_format
    check (room_code ~ '^[A-Za-z0-9_-]{1,50}$')
);

alter table public.scenes add column if not exists editor_pin_hash text;
alter table public.scenes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.scenes to anon, authenticated;
revoke insert, update, delete on table public.scenes from anon, authenticated;

drop policy if exists "visitantes podem ler cenarios" on public.scenes;
create policy "visitantes podem ler cenarios"
on public.scenes
for select
to anon, authenticated
using (true);

drop policy if exists "visitantes podem criar cenarios" on public.scenes;
drop policy if exists "visitantes podem atualizar cenarios" on public.scenes;

create or replace function public.publish_scene(
  p_room text,
  p_pin text,
  p_scene jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing_hash text;
  v_new_hash text;
  v_exists boolean;
begin
  if p_room is null or p_room !~ '^[A-Za-z0-9_-]{1,50}$' then
    raise exception 'Código de sala inválido.';
  end if;

  if p_pin is null or length(p_pin) < 4 then
    raise exception 'A senha de edição precisa ter pelo menos 4 caracteres.';
  end if;

  if p_scene is null or jsonb_typeof(p_scene) not in ('array', 'object') then
    raise exception 'Formato de cenário inválido.';
  end if;

  v_new_hash := encode(extensions.digest(convert_to(p_pin, 'UTF8'), 'sha256'), 'hex');

  select true, editor_pin_hash
    into v_exists, v_existing_hash
    from public.scenes
   where room_code = p_room
   for update;

  if coalesce(v_exists, false) then
    if v_existing_hash is not null and v_existing_hash <> v_new_hash then
      raise exception 'Senha de edição incorreta.';
    end if;

    update public.scenes
       set scene = p_scene,
           editor_pin_hash = coalesce(editor_pin_hash, v_new_hash),
           updated_at = now()
     where room_code = p_room;
  else
    insert into public.scenes (room_code, scene, editor_pin_hash, updated_at)
    values (p_room, p_scene, v_new_hash, now());
  end if;

  return jsonb_build_object('ok', true, 'room_code', p_room, 'updated_at', now());
end;
$$;

revoke all on function public.publish_scene(text, text, jsonb) from public;
grant execute on function public.publish_scene(text, text, jsonb) to anon, authenticated;
