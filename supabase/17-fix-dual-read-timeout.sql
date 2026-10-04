-- ══════════════════════════════════════════════════════════════════════════════
-- 17-fix-dual-read-timeout.sql
-- Cambia statement_timeout de cleo_dual_read y cleo_dual_flush de '0' a '20s'.
--
-- Script 16 desactivó el timeout completamente (='0'), lo que hace que la
-- función cuelgue indefinidamente cuando Supabase está lenta. 20 segundos es
-- suficiente para que la query termine en condiciones normales, y sirve como
-- válvula de escape si la instancia está saturada.
--
-- Entorno autorizado: CLEO Pruebas (pconfadsbtwjbjeblxgl)
-- ══════════════════════════════════════════════════════════════════════════════

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

alter function public.cleo_dual_read()
  set statement_timeout to '20s';

alter function public.cleo_dual_flush(jsonb, text, timestamptz)
  set statement_timeout to '20s';

do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'cleo_dual_read'
       and proconfig @> array['statement_timeout=20s']
  ) then
    raise exception 'FAIL: cleo_dual_read no tiene statement_timeout=20s';
  end if;
  if not exists (
    select 1 from pg_proc
     where proname = 'cleo_dual_flush'
       and proconfig @> array['statement_timeout=20s']
  ) then
    raise exception 'FAIL: cleo_dual_flush no tiene statement_timeout=20s';
  end if;
  raise notice 'OK: statement_timeout=20s en cleo_dual_read y cleo_dual_flush';
end;
$$;
