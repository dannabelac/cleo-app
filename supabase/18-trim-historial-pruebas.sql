-- ══════════════════════════════════════════════════════════════════════════════
-- 18-trim-historial-pruebas.sql
-- Limpia datos acumulados de sesiones de prueba para dual09@cleo.test.
--
-- Problema: tras múltiples sesiones de prueba el blob de cleo_dual_read creció
-- hasta superar los 5MB de localStorage, causando QuotaExceededError en
-- pullUserData y el error "No pudimos cargar tu información".
--
-- Este script es específico para el entorno de pruebas y no afecta producción.
-- Entorno autorizado: CLEO Pruebas (pconfadsbtwjbjeblxgl)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Guardia ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from public.negocios where schema_ver in ('blob','dual') limit 1
  ) then
    raise exception 'Guardia: no se detecta entorno CLEO — abortando.';
  end if;
end;
$$;

-- ── Negocio de prueba ─────────────────────────────────────────────────────────
do $$
declare
  v_neg_id uuid;
  v_hc_antes int;
  v_rec_antes int;
  v_hc_despues int;
  v_rec_despues int;
begin
  select n.id into v_neg_id
    from public.negocios n
    join auth.users u on u.id = n.user_id
   where u.email = 'dual09@cleo.test';

  if v_neg_id is null then
    raise exception 'dual09@cleo.test no encontrado';
  end if;

  select count(*) into v_hc_antes
    from public.historial_contactos where negocio_id = v_neg_id;

  select count(*) into v_rec_antes
    from public.recordatorios where negocio_id = v_neg_id;

  raise notice 'Antes — historial: %, recordatorios: %', v_hc_antes, v_rec_antes;

  -- ── 1. Conservar solo los 15 historial más recientes por cliente ──────────
  delete from public.historial_contactos
   where negocio_id = v_neg_id
     and id not in (
       select id from (
         select id,
                row_number() over (
                  partition by cliente_id
                  order by coalesce(fecha_hora, fecha::timestamptz) desc
                ) as rn
           from public.historial_contactos
          where negocio_id = v_neg_id
       ) ranked
        where rn <= 15
     );

  -- ── 2. Eliminar recordatorios completados (ya no aportan al estado) ───────
  delete from public.recordatorios
   where negocio_id = v_neg_id
     and completado = true;

  select count(*) into v_hc_despues
    from public.historial_contactos where negocio_id = v_neg_id;

  select count(*) into v_rec_despues
    from public.recordatorios where negocio_id = v_neg_id;

  raise notice 'Después — historial: %, recordatorios: %', v_hc_despues, v_rec_despues;
  raise notice 'Eliminados — historial: %, recordatorios: %',
    v_hc_antes - v_hc_despues, v_rec_antes - v_rec_despues;
end;
$$;
