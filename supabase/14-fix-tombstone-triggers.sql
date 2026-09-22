-- ══════════════════════════════════════════════════════════════════════════════
-- 14-fix-tombstone-triggers.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — solo esta rama, nunca producción
--
-- Problema:
--   cleo_dual_flush intenta borrar cotizaciones tombstoneadas pero dos triggers
--   lo bloquean:
--     1. cleo_guard_cotizacion_origen  → "oportunidad_vinculada no puede revertirse a false"
--                                        "oportunidad_id es inmutable una vez asignado"
--     2. cleo_guard_cotizacion_delete  → "no se puede eliminar mientras está vinculada"
--
-- Solución:
--   Mismo patrón que cleo.deleting_negocio_id: cleo_dual_flush activa
--   cleo.procesando_tombstones = 'true' (local a la TX) y los triggers lo
--   respetan como operación autorizada.
--
-- Cambios en este script:
--   A. CREATE OR REPLACE cleo_guard_cotizacion_origen   — early-return si tombstone
--   B. CREATE OR REPLACE cleo_guard_cotizacion_delete   — bypass si tombstone
--
-- Debe ejecutarse ANTES o junto con 10-dual-flush.sql (que activa el flag).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A. cleo_guard_cotizacion_origen ──────────────────────────────────────────
create or replace function public.cleo_guard_cotizacion_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  -- cleo_dual_flush activa 'cleo.procesando_tombstones' = 'true' (local a la TX)
  -- para borrar cotizaciones tombstoneadas. En ese contexto se permite modificar
  -- oportunidad_id y oportunidad_vinculada sin restricción de inmutabilidad.
  if current_setting('cleo.procesando_tombstones', true) = 'true' then
    return new;
  end if;

  -- oportunidad_vinculada nunca puede revertirse a false una vez marcado true.
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    raise exception
      'cotizacion: oportunidad_vinculada no puede revertirse a false (cleo_id: %)', old.cleo_id;
  end if;

  if TG_OP = 'UPDATE'
     and new.oportunidad_id is not null
     and old.oportunidad_id is not distinct from new.oportunidad_id
     and (old.cliente_id  is distinct from new.cliente_id
          or old.negocio_id is distinct from new.negocio_id) then
    select cliente_id into v_op_cli
      from public.oportunidades
     where id = new.oportunidad_id and negocio_id = new.negocio_id;
    if not found then
      raise exception 'cotizacion: oportunidad_id no pertenece a este negocio';
    end if;
    if v_op_cli is distinct from new.cliente_id then
      raise exception
        'cotizacion: la oportunidad pertenece al cliente %, '
        'pero la cotización referencia al cliente %',
        v_op_cli, new.cliente_id;
    end if;
    return new;
  end if;

  if TG_OP = 'UPDATE' and old.oportunidad_id is not distinct from new.oportunidad_id then
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if old.oportunidad_id is not null
       and new.oportunidad_id is null
       and not exists (
         select 1 from public.oportunidades
          where id = old.oportunidad_id and negocio_id = old.negocio_id
       ) then
      return new;
    end if;
    if not old.oportunidad_vinculada
       and old.oportunidad_id is null
       and new.oportunidad_id is not null then
      new.oportunidad_vinculada := true;
    else
      raise exception
        'cotizacion: oportunidad_id es inmutable una vez asignado (cleo_id: %)', old.cleo_id;
    end if;
  end if;

  if TG_OP = 'INSERT' and new.oportunidad_id is not null then
    new.oportunidad_vinculada := true;
  end if;

  if new.oportunidad_id is null then return new; end if;

  select cliente_id into v_op_cli
    from public.oportunidades
   where id = new.oportunidad_id and negocio_id = new.negocio_id;
  if not found then
    raise exception 'cotizacion: oportunidad_id no pertenece a este negocio';
  end if;
  if v_op_cli is distinct from new.cliente_id then
    raise exception
      'cotizacion: la oportunidad pertenece al cliente %, '
      'pero la cotización referencia al cliente %',
      v_op_cli, new.cliente_id;
  end if;
  return new;
end;
$$;
revoke all on function public.cleo_guard_cotizacion_origen() from public;


-- ── B. cleo_guard_cotizacion_delete ──────────────────────────────────────────
create or replace function public.cleo_guard_cotizacion_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('cleo.procesando_tombstones', true) = 'true' then
    return old;
  end if;
  if old.oportunidad_id is not null
     and current_setting('cleo.deleting_negocio_id', true)
         is distinct from old.negocio_id::text then
    raise exception
      'cotizacion: no se puede eliminar mientras está vinculada a una oportunidad '
      '(cleo_id: %). Para retirar del pipeline, usa estatus=''Cancelada''. '
      'Para eliminar la cuenta usa la función de cierre de negocio.',
      old.cleo_id;
  end if;
  return old;
end;
$$;
revoke all on function public.cleo_guard_cotizacion_delete() from public;


-- ── Verificación ──────────────────────────────────────────────────────────────
select
  p.proname                                          as funcion,
  pg_get_functiondef(p.oid) like '%procesando_tombstones%' as tiene_bypass
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cleo_guard_cotizacion_origen','cleo_guard_cotizacion_delete');
