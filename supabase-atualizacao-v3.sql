-- EMPRESA 3D INTELIGENTE — ATUALIZAÇÃO V3
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run.
-- Adiciona exclusão segura de salas usando a mesma senha de edição.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.delete_scene(
  p_room text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing_hash text;
  v_supplied_hash text;
begin
  if p_room is null or p_room !~ '^[A-Za-z0-9_-]{1,50}$' then
    raise exception 'Código de sala inválido.';
  end if;

  if p_pin is null or length(p_pin) < 4 then
    raise exception 'Digite a senha de edição da sala.';
  end if;

  select editor_pin_hash
    into v_existing_hash
    from public.scenes
   where room_code = p_room
   for update;

  if not found then
    raise exception 'Sala não encontrada.';
  end if;

  if v_existing_hash is null then
    raise exception 'Essa sala não possui senha de edição. Publique-a novamente antes de excluir.';
  end if;

  v_supplied_hash := encode(extensions.digest(convert_to(p_pin, 'UTF8'), 'sha256'), 'hex');

  if v_supplied_hash <> v_existing_hash then
    raise exception 'Senha de edição incorreta.';
  end if;

  delete from public.scenes where room_code = p_room;

  return jsonb_build_object('ok', true, 'room_code', p_room, 'deleted_at', now());
end;
$$;

revoke all on function public.delete_scene(text, text) from public;
grant execute on function public.delete_scene(text, text) to anon, authenticated;
