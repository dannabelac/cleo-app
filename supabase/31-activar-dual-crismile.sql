-- ══════════════════════════════════════════════════════════════════════════════
-- 31-activar-dual-crismile.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — SOLO CLEO Pruebas, nunca producción
--
-- Activa dual mode para crismile@cleo.test: blob → dual
-- Ejecutar DESPUÉS de 30-copia-crismile.sql y verificación manual en la app.
-- ══════════════════════════════════════════════════════════════════════════════

do $main$
declare
  v_test_email constant text := 'crismile@cleo.test';
  v_user_id    uuid;
  v_neg_id     uuid;
  v_sv_antes   text;
  v_sv_despues text;
begin

select id into v_user_id from auth.users where email = v_test_email limit 1;
if v_user_id is null then
  raise exception 'No se encontró % en auth.users.', v_test_email;
end if;

select id, schema_ver into v_neg_id, v_sv_antes
  from public.negocios where user_id = v_user_id;
if v_neg_id is null then
  raise exception 'No existe negocio para %.', v_test_email;
end if;

if v_sv_antes = 'dual' then
  raise notice 'Ya está en dual mode. Nada que hacer.';
  return;
end if;

if v_sv_antes <> 'blob' then
  raise exception 'schema_ver=% inesperado (esperaba blob).', v_sv_antes;
end if;

update public.negocios set schema_ver = 'dual' where id = v_neg_id;

select schema_ver into v_sv_despues from public.negocios where id = v_neg_id;
if v_sv_despues <> 'dual' then
  raise exception 'La actualización no se aplicó correctamente.';
end if;

raise notice 'OK: % — schema_ver % → % (negocio_id=%)',
  v_test_email, v_sv_antes, v_sv_despues, v_neg_id;

end;
$main$;
