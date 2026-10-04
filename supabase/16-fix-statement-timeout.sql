-- ══════════════════════════════════════════════════════════════════════════════
-- 16-fix-statement-timeout.sql
-- Desactiva el statement_timeout dentro de cleo_dual_read y cleo_dual_flush.
--
-- Problema: Supabase free tier aplica statement_timeout ~8s a sesiones
-- autenticadas (PostgREST). cleo_dual_read() hereda ese timeout y a veces
-- es cancelada con error 57014 ("canceling statement due to statement timeout"),
-- causando "No pudimos cargar tu información" en el app.
--
-- Fix: SET statement_timeout TO '0' a nivel de función. PostgreSQL aplica este
-- SET solo durante la ejecución de la función, sin afectar otras queries.
-- La función ya tiene SET search_path = '' — este ALTER agrega un SET más.
--
-- Entorno autorizado: CLEO Pruebas (pconfadsbtwjbjeblxgl)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Guardia ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from public.negocios
     where schema_ver in ('blob','dual')
     limit 1
  ) then
    raise exception 'Guardia: no se detecta entorno CLEO — abortando.';
  end if;
end;
$$;

-- ── Fix: deshabilitar timeout dentro de las funciones dual ────────────────────
alter function public.cleo_dual_read()
  set statement_timeout to '0';

alter function public.cleo_dual_flush(jsonb, text, timestamptz)
  set statement_timeout to '0';

-- ── Verificación ──────────────────────────────────────────────────────────────
do $$
declare
  v_timeout_read  text;
  v_timeout_flush text;
begin
  select p.setting into v_timeout_read
    from pg_proc pr
    join pg_catalog.pg_db_role_setting s
      on s.setrole = 0 and s.setdatabase = 0
    cross join unnest(s.setconfig) as p(setting)
   where pr.proname = 'cleo_dual_read'
     and p.setting like 'statement_timeout%'
   limit 1;

  -- Verificación alternativa: confirmar que la función existe con los parámetros SET
  if not exists (
    select 1 from pg_proc
     where proname = 'cleo_dual_read'
       and proconfig @> array['statement_timeout=0']
  ) then
    raise exception 'FAIL: cleo_dual_read no tiene statement_timeout=0 en proconfig';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'cleo_dual_flush'
       and proconfig @> array['statement_timeout=0']
  ) then
    raise exception 'FAIL: cleo_dual_flush no tiene statement_timeout=0 en proconfig';
  end if;

  raise notice 'OK: cleo_dual_read y cleo_dual_flush tienen statement_timeout=0';
end;
$$;
