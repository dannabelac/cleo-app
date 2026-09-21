-- ══════════════════════════════════════════════════════════════════════════════
-- 12-activar-dual-prueba.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — solo esta rama, nunca producción
--
-- Activa schema_ver='dual' para dual09@cleo.test.
-- Después de este script, la cuenta usa cleo_dual_read (pull) y
-- cleo_dual_flush (push) en lugar de leer/escribir user_data directamente.
--
-- PRERREQUISITOS
--   1. 10-dual-flush.sql ejecutado
--   2. 11-tests-dual-flush.sql ejecutado (negocio y datos de prueba presentes)
--   3. dual09@cleo.test existe en Auth de CLEO Pruebas
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_sv     text;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  if v_uid is null then
    raise exception 'FALLO: dual09@cleo.test no existe en Auth.';
  end if;

  select id, schema_ver into v_neg_id, v_sv
    from public.negocios where user_id = v_uid;

  if v_neg_id is null then
    raise exception 'FALLO: no existe negocio para dual09@cleo.test. Ejecuta 11-tests-dual-flush.sql primero.';
  end if;

  if v_sv = 'dual' then
    raise notice 'INFO: schema_ver ya es "dual". Sin cambios.';
    return;
  end if;

  if v_sv != 'blob' then
    raise exception 'FALLO: schema_ver="%", esperaba "blob".', v_sv;
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cleo_dual_flush'
  ) then
    raise exception 'FALLO: cleo_dual_flush no existe. Ejecuta 10-dual-flush.sql primero.';
  end if;

  update public.negocios set schema_ver = 'dual' where id = v_neg_id;

  raise notice 'OK: dual09@cleo.test → schema_ver=dual  (negocio_id: %)', v_neg_id;
end;
$$;

-- Verificación
select
  u.email,
  n.schema_ver,
  n.tipo_perfil,
  (select count(*) from public.clientes     where negocio_id = n.id) as clientes,
  (select count(*) from public.oportunidades where negocio_id = n.id) as oportunidades,
  (select updated_at from public.user_data  where user_id = n.user_id limit 1) as ultimo_sync
from public.negocios n
join auth.users u on u.id = n.user_id
where u.email = 'dual09@cleo.test';
