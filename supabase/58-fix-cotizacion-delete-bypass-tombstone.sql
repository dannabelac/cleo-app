-- 58-fix-cotizacion-delete-bypass-tombstone.sql
-- PROBLEMA (confirmado con logs reales de producción, usuario Artur,
-- 31 oct 2026, después de aplicar el parche 57):
--   P0001 cotizacion: no se puede eliminar mientras está vinculada a una
--   oportunidad (cleo_id: 1792521206702). Para retirar del pipeline, usa
--   estatus='Cancelada'. Para eliminar la cuenta usa la función de cierre
--   de negocio.
--
-- CAUSA: el parche 57 quitó el UPDATE innecesario antes del DELETE, pero el
-- propio DELETE sigue bloqueado por un segundo trigger independiente,
-- cleo_guard_cotizacion_delete (trigger trg_cotizaciones_delete), que impide
-- borrar una cotización vinculada a una oportunidad activa salvo que se esté
-- borrando el negocio completo (marcador cleo.deleting_negocio_id).
--
-- Este trigger NUNCA tuvo una excepción para el borrado legítimo de
-- cotizaciones tombstoneadas (el usuario borra una cotización vieja desde la
-- app, sin borrar ni la oportunidad ni el negocio). Ya existía una función
-- corregida y PROBADA para esto — supabase/14-fix-tombstone-triggers.sql —
-- pero ese archivo dice explícitamente "CLEO Pruebas, nunca producción" y
-- jamás se portó al esquema de producción (supabase/produccion-schema-completo.sql).
-- Esta es exactamente esa corrección, aplicada ahora a producción.
--
-- MECANISMO: cleo_dual_flush ya activa 'cleo.procesando_tombstones' = 'true'
-- (set_config local a la transacción) justo antes de procesar los borrados
-- (ver "-- 5. PROCESAR BORRADOS" en cleo_dual_flush) — eso no cambia aquí.
-- Lo único que falta es que cleo_guard_cotizacion_delete respete esa bandera,
-- igual que ya la respeta cleo_guard_cotizacion_origen.
--
-- Idempotente; seguro de re-ejecutar. No requiere recrear el trigger
-- (CREATE OR REPLACE FUNCTION actualiza el cuerpo que el trigger ya usa).
-- ══════════════════════════════════════════════════════════════════════════════

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
