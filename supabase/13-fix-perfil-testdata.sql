-- ══════════════════════════════════════════════════════════════════════════════
-- 13-fix-perfil-testdata.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — solo esta rama, nunca producción
--
-- Qué hace este script:
--   A. Rellena los colores nulos en negocios para dual09@cleo.test
--      (el test setup 09-copia-prueba.sql no los incluyó).
--   B. Re-ejecuta cleo_dual_flush() vía 10-dual-flush.sql (ya editado):
--      agrega el paso 14b que sincroniza cleo_perfil → negocios en cada flush.
--
-- ORDEN DE EJECUCIÓN:
--   1. Ejecutar ESTE script (parte A) para corregir el test data de inmediato.
--   2. Ejecutar 10-dual-flush.sql de nuevo para aplicar el paso 14b.
--      (todas las ALTER TABLE usan IF NOT EXISTS; es idempotente)
--
-- PRE-REQUISITO: dual09@cleo.test activa en CLEO Pruebas con schema_ver='dual'.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A. PARCHE RÁPIDO: colores del negocio de prueba ──────────────────────────
-- Paleta "Índigo" (el default de CLEO) — consistente con perfilDemo en CLEO.jsx
do $$
declare
  v_uid    uuid;
  v_neg_id uuid;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  if v_uid is null then
    raise exception 'FALLO: dual09@cleo.test no existe en Auth.';
  end if;

  select id into v_neg_id from public.negocios where user_id = v_uid;
  if v_neg_id is null then
    raise exception 'FALLO: no existe negocio para dual09@cleo.test.';
  end if;

  update public.negocios set
    color     = coalesce(color,     '#4B5EFC'),
    color_sec = coalesce(color_sec, '#E8EBFF'),
    config    = coalesce(config, '{}'::jsonb) ||
                case when coalesce(config ->> 'colorTexto', '') = ''
                     then '{"colorTexto":"#0D1240"}'::jsonb
                     else '{}'::jsonb
                end
  where id = v_neg_id;

  raise notice 'OK: colores actualizados para dual09@cleo.test (negocio_id: %)', v_neg_id;
end;
$$;

-- ── Verificación ──────────────────────────────────────────────────────────────
select
  u.email,
  n.color,
  n.color_sec,
  n.config ->> 'colorTexto' as color_texto
from public.negocios n
join auth.users u on u.id = n.user_id
where u.email = 'dual09@cleo.test';
