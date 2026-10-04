-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- 07-incremental-multi-oportunidad.sql
-- BORRADOR — revisar y aprobar antes de ejecutar en CLEO Pruebas.
-- Prerequisitos: 01-pruebas-guardado.sql y 03-schema-relacional.sql ejecutados.
-- Revertir: sección ROLLBACK al final, en orden inverso.
--
-- ESTADO: escrito, no ejecutado.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Guard ─────────────────────────────────────────────────────────────────────
-- Verifica prerequisitos y protege contra ejecución en producción o en una
-- instancia ya activada. Comprueba objetos esperados Y el estado de los datos.
do $guard$
begin
  -- 01 y 03 deben haber corrido.
  if to_regclass('public.user_data') is null then
    raise exception 'Corre 01-pruebas-guardado.sql primero.';
  end if;
  if to_regclass('public.negocios') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
  -- Ningún negocio debe tener schema_ver avanzado. Si alguno lo tiene, estamos
  -- en un entorno activado (producción o pruebas ya activadas): rechazar.
  if exists (select 1 from public.negocios where schema_ver <> 'blob') then
    raise exception
      '07-incremental: existe al menos un negocio con schema_ver <> ''blob''. '
      'Este archivo solo puede ejecutarse antes de la fase dual. '
      'Verifica que estés en CLEO Pruebas (pconfadsbtwjbjeblxgl).';
  end if;
  -- Idempotencia: rechazar si ya fue aplicado.
  if exists (
    select 1 from pg_indexes
     where indexname = 'uq_cot_oportunidad' and schemaname = 'public'
  ) then
    raise exception
      '07-incremental ya fue aplicado (uq_cot_oportunidad existe). '
      'Para revertir usa la sección ROLLBACK de este archivo.';
  end if;
end;
$guard$;

begin;


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 0: barrera de escritura al blob cuando schema_ver ≠ 'blob'
-- ══════════════════════════════════════════════════════════════════════════════
-- Rechaza INSERT/UPDATE en user_data si el negocio ya avanzó a 'dual' o
-- 'relacional'. La barrera opera en la base de datos, antes de cualquier
-- modificación de datos, para que una escritura stale de un cliente antiguo
-- nunca llegue a confirmarse.
--
-- El trigger corre como el rol que hace la escritura (autenticado).
-- RLS en negocios permite que ese rol lea su propio negocio vía user_id.
-- Si no existe negocio aún (nuevo usuario), v_schema_ver queda NULL → permitido.
--
-- cloudSync detecta el rechazo por SQLSTATE P0002 y lo presenta al usuario
-- como "la app necesita actualizarse" en lugar de un error genérico.
--
-- PENDIENTE (activación dual): definir la función cleo_dual_flush() que escribe
-- atómicamente en user_data Y en las tablas relacionales dentro de una
-- transacción serializable. Hasta que esa función exista y cloudSync la use,
-- la activación dual queda bloqueada.
create or replace function public.cleo_guard_blob_schema_ver()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_schema_ver text;
begin
  select schema_ver into v_schema_ver
    from public.negocios
   where user_id = new.user_id;

  if v_schema_ver is distinct from 'blob' and v_schema_ver is not null then
    raise exception
      using errcode = 'P0002',
            message = 'cleo: schema_ver=' || v_schema_ver ||
                      '. Este negocio ya no usa el blob como fuente de verdad. '
                      'Actualiza la app para continuar. (user_data write rejected)',
            hint    = v_schema_ver;
  end if;

  return new;
end;
$$;
revoke all on function public.cleo_guard_blob_schema_ver() from public;

create trigger trg_user_data_schema_ver
  before insert or update on public.user_data
  for each row execute function public.cleo_guard_blob_schema_ver();


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 1: categoria 'sin_clasificar' en recordatorios
-- ══════════════════════════════════════════════════════════════════════════════
-- Permite almacenar recordatorios migrados sin evidencia suficiente para
-- asignarles una categoría definitiva.
--
-- CÓDIGO QUE DEBE EXCLUIR 'sin_clasificar' ANTES DE LA FASE DUAL (CLEO.jsx):
--   · cancelarRecordatoriosPipeline(cliente): filtrar solo categoria='pipeline';
--     nunca cancelar 'sin_clasificar' aunque el texto coincida con patrones.
--   · esRecordatorioPipelineObsoleto(): retornar false inmediatamente si
--     rec.categoria === 'sin_clasificar', sin evaluar el texto.
--
-- HOY — regla de supresión corregida:
--   Una sugerencia calculada para oportunidad O se suprime ÚNICAMENTE si existe
--   un recordatorio pendiente con:
--     oportunidad_id = O, categoria = 'pipeline', fecha <= hoy.
--   'postventa' y 'reactivacion' NUNCA suprimen sugerencias (no son equivalentes
--   a acciones de pipeline ni a cotizaciones vencidas sin demostración).
--   'sin_clasificar' tampoco suprime nada.
--
-- RETIRO: cuando todos los 'sin_clasificar' estén reclasificados, eliminar
-- este valor con ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT en migración posterior.
alter table public.recordatorios
  drop constraint recordatorios_categoria_check,
  add  constraint recordatorios_categoria_check
       check (categoria in ('pipeline','postventa','reactivacion','manual','sin_clasificar'));


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 2: índice único parcial cotización↔oportunidad
-- ══════════════════════════════════════════════════════════════════════════════
-- Un índice UNIQUE ya es un índice; no se necesita uno adicional regular
-- sobre las mismas condiciones. El planificador lo usa para lecturas también.
drop index if exists public.idx_cot_oportunidad;

create unique index uq_cot_oportunidad
  on public.cotizaciones (oportunidad_id)
  where oportunidad_id is not null;
-- El índice anterior no-único se eliminó. Las queries de solo lectura
-- (WHERE oportunidad_id = X) usan uq_cot_oportunidad para el scan.


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 3: barrera contra borrado directo de cotización vinculada
-- ══════════════════════════════════════════════════════════════════════════════
-- Impide el patrón delete+re-insert que eludiría uq_cot_oportunidad.
-- La barrera es DB-level: no depende de validación en el cliente.
--
-- MECANISMO: el marcador almacena el UUID del negocio que está siendo borrado,
-- no solo un booleano. El trigger de cotizaciones verifica que el negocio_id de
-- la cotización coincida exactamente con ese UUID. Esto evita que el marcador
-- de un borrado permita eliminar cotizaciones de OTRO negocio en la misma txn.
--
-- LÍMITE CONOCIDO: set_config es una variable de sesión que cualquier código
-- en la misma sesión podría modificar. La protección principal contra abuso
-- deliberado es RLS: authenticated solo puede DELETE sus propias cotizaciones
-- (policy "cotizaciones del negocio"), y solo puede DELETE sus propios negocios
-- (policy "negocio propio"). Un usuario autenticado no puede suplantar el UUID
-- de otro negocio en la sesión sin violar RLS antes.
--
-- ALTERNATIVA MÁS ROBUSTA (fuera del alcance de este incremental): crear una
-- función SECURITY DEFINER cleo_delete_negocio() que orqueste el borrado y
-- elimine la necesidad del marcador de sesión.

create or replace function public.cleo_guard_negocio_delete_marker()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Almacena el UUID específico del negocio que se está borrando.
  -- local=true: se limpia al final de la transacción.
  perform set_config('cleo.deleting_negocio_id', old.id::text, true);
  return old;
end;
$$;
revoke all on function public.cleo_guard_negocio_delete_marker() from public;

create trigger trg_negocios_delete_marker
  before delete on public.negocios
  for each row execute function public.cleo_guard_negocio_delete_marker();


create or replace function public.cleo_guard_cotizacion_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Permitir solo si el marcador coincide con el negocio de ESTA cotización.
  -- Un marcador de otro negocio (o ausente) → rechazar.
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

create trigger trg_cotizaciones_delete
  before delete on public.cotizaciones
  for each row execute function public.cleo_guard_cotizacion_delete();


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 4: permisos para cleo_reabrir_cotizacion() (corrección de 03)
-- ══════════════════════════════════════════════════════════════════════════════
-- En 03, cleo_service tiene solo SELECT sobre oportunidades.
-- La versión actualizada de cleo_reabrir_cotizacion() necesita bloquear
-- (FOR UPDATE) y actualizar filas en esa tabla.
grant update on table public.oportunidades to cleo_service;


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 5: cleo_reabrir_cotizacion() — reapertura coordinada con oportunidad
-- ══════════════════════════════════════════════════════════════════════════════
-- Reemplaza la función del 03 (misma firma, comportamiento extendido).
-- Bloqueos en orden determinístico (cotización antes que oportunidad).
-- Pedidos, pagos y entregas existentes no se modifican.
--
-- Casos por estatus de la oportunidad vinculada:
--   ganada + Servicios  → cotización Enviada + oportunidad activa/cotizacion_enviada
--   ganada + Productos  → excepción (pendiente decisión de producto)
--   activa              → solo cotización Enviada
--   perdida/cancelada   → excepción (pendiente decisión de producto)
--   sin oportunidad     → solo cotización Enviada (comportamiento original)
create or replace function public.cleo_reabrir_cotizacion(p_cleo_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cot record;
  v_op  record;
begin
  -- Bloquear cotización primero.
  select id, oportunidad_id, items_aceptacion, monto_aceptacion
    into v_cot
    from public.cotizaciones
   where cleo_id    = p_cleo_id
     and negocio_id = public.auth_negocio_id()
     and estatus    = 'Aceptada'
     for update;

  if not found then
    raise exception
      'cleo_reabrir_cotizacion: no encontrada, no pertenece a este negocio, '
      'o no está en estado Aceptada. (cleo_id: %)', p_cleo_id;
  end if;

  -- Si hay oportunidad vinculada, bloquearla y validar.
  if v_cot.oportunidad_id is not null then
    select id, estatus, modo
      into v_op
      from public.oportunidades
     where id         = v_cot.oportunidad_id
       and negocio_id = public.auth_negocio_id()
       for update;

    if not found then
      raise exception
        'cleo_reabrir_cotizacion: la oportunidad vinculada no existe o no '
        'pertenece a este negocio. (cotizacion cleo_id: %)', p_cleo_id;
    end if;

    if v_op.estatus = 'ganada' then
      if v_op.modo = 'productos' then
        -- La etapa de retorno para Productos ganada no está decidida (depende
        -- de si hay pedido en curso y en qué estado está). Pendiente aprobación.
        raise exception
          'cleo_reabrir_cotizacion: reabrir en modo Productos desde oportunidad '
          'ganada requiere una decisión de producto pendiente. '
          '(cotizacion cleo_id: %)', p_cleo_id;
      end if;
      -- Servicios: ganada/ganado → activa/cotizacion_enviada.
      update public.oportunidades
         set estatus      = 'activa',
             etapa        = 'cotizacion_enviada',
             fecha_cierre = null,
             updated_at   = now()
       where id = v_op.id;

    elsif v_op.estatus = 'activa' then
      null; -- Oportunidad ya activa; solo cambia la cotización.

    elsif v_op.estatus in ('perdida', 'cancelada') then
      raise exception
        'cleo_reabrir_cotizacion: reabrir una cotización de una oportunidad % '
        'requiere una decisión de producto pendiente de aprobación. '
        'Por ahora, crea una nueva oportunidad para retomar la negociación. '
        '(cotizacion cleo_id: %)', v_op.estatus, p_cleo_id;
    end if;
  end if;

  -- Reabrir la cotización: archivar snapshot y volver a Enviada.
  update public.cotizaciones
     set estatus              = 'Enviada',
         items_aceptacion     = null,
         monto_aceptacion     = null,
         versiones_aceptacion = versiones_aceptacion || jsonb_build_array(
           jsonb_build_object(
             'items', v_cot.items_aceptacion,
             'monto', v_cot.monto_aceptacion,
             'en',    now()
           )
         )
   where id = v_cot.id;
end;
$$;
alter  function public.cleo_reabrir_cotizacion(text) owner to cleo_service;
revoke all    on function public.cleo_reabrir_cotizacion(text) from public;
grant  execute on function public.cleo_reabrir_cotizacion(text) to authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 6: permisos de cleo_service para las nuevas funciones de trigger
-- ══════════════════════════════════════════════════════════════════════════════
grant execute on function public.cleo_guard_blob_schema_ver()        to cleo_service;
grant execute on function public.cleo_guard_negocio_delete_marker()  to cleo_service;
grant execute on function public.cleo_guard_cotizacion_delete()      to cleo_service;


-- ══════════════════════════════════════════════════════════════════════════════
-- CAMBIO 7: comentario de deduplicación en oportunidades (reemplaza 03)
-- ══════════════════════════════════════════════════════════════════════════════
comment on table public.oportunidades is
  'Deduplicación en Hoy: identidad de tarjeta = recordatorio.id. '
  'Dos recordatorios de la misma oportunidad → dos tarjetas independientes. '
  'Sugerencias calculadas suprimidas solo por recordatorio pipeline pendiente con '
  'fecha<=hoy y misma oportunidad_id. postventa y reactivacion no son equivalentes '
  'a sugerencias pipeline; no suprimen nada. sin_clasificar tampoco suprime. '
  'Cobros, entregas y postventa son secciones propias basadas en campos de estado.';


-- ══════════════════════════════════════════════════════════════════════════════
-- NOTA: identidad de migración (no es DDL, es requisito del proceso)
-- ══════════════════════════════════════════════════════════════════════════════
-- Un hash del blob no contiene la lista de IDs. Para detectar diferencias y
-- para poder repetir la copia de forma idempotente, el proceso de migración
-- debe almacenar en negocios.datos_ui un inventario explícito:
--
--   datos_ui.migration_v1 = {
--     "copied_at": "<ISO8601>",
--     "blob_hash": "<sha256>",
--     "clientes":                ["<cleo_id1>", ...],
--     "cotizaciones":            ["<cleo_id1>", ...],
--     "pedidos":                 ["<cleo_id1>", ...],
--     "recordatorios_con_id":    ["<rec_id1>",  ...],
--     "recordatorios_legacy":    [{"cliente_cleo_id":"...", "fecha":"YYYY-MM-DD"}, ...]
--   }
--
-- Con este inventario:
--   - Se pueden detectar IDs nuevos (no estaban en el snapshot → creados después).
--   - Se pueden detectar IDs ausentes del blob (estaban → borrados después).
--   - Se puede repetir la copia comprobando qué cleo_ids ya existen en las tablas.
--   - "Ausente del blob" solo es "borrado" si aparece en el inventario original
--     Y ya no aparece en el blob actual. Entidades nuevas en las tablas (sin
--     cleo_id de blob) nunca se comparan con el blob.


commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
-- Ejecutar manualmente tras el commit para confirmar el estado.

-- C0: trigger en user_data
select tgname, tgrelid::regclass as tabla, tgenabled
  from pg_trigger
 where tgrelid = 'public.user_data'::regclass
   and tgname  = 'trg_user_data_schema_ver'
   and not tgisinternal;

-- C1: CHECK actualizado
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.recordatorios'::regclass
   and contype  = 'c'
   and conname  = 'recordatorios_categoria_check';

-- C2: índice único (solo uno)
select indexname, indexdef
  from pg_indexes
 where tablename  = 'cotizaciones'
   and schemaname = 'public'
   and indexname  like '%cot_oportunidad%'
 order by indexname;

-- C3: triggers de borrado
select tgname, tgrelid::regclass as tabla, tgenabled
  from pg_trigger
 where tgrelid in (
         'public.negocios'::regclass,
         'public.cotizaciones'::regclass
       )
   and tgname in ('trg_negocios_delete_marker', 'trg_cotizaciones_delete')
   and not tgisinternal
 order by tabla, tgname;

-- C4+C5: permisos cleo_service sobre oportunidades (debe incluir UPDATE)
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name   = 'oportunidades'
   and grantee      = 'cleo_service'
 order by privilege_type;


-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (ejecutar solo para revertir, en orden inverso)
-- ══════════════════════════════════════════════════════════════════════════════
/*
begin;

-- C7: limpiar comentario
comment on table public.oportunidades is null;

-- C6: no hay DDL que revertir (solo GRANT; no se revoca aquí para no romper
-- funciones previas que puedan necesitar el permiso)

-- C5: restaurar función original de reapertura
create or replace function public.cleo_reabrir_cotizacion(p_cleo_id text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_row record;
begin
  select id, items_aceptacion, monto_aceptacion
    into v_row
    from public.cotizaciones
   where cleo_id    = p_cleo_id
     and negocio_id = public.auth_negocio_id()
     and estatus    = 'Aceptada'
     for update;
  if not found then
    raise exception
      'cleo_reabrir_cotizacion: no encontrada o no Aceptada. (cleo_id: %)', p_cleo_id;
  end if;
  update public.cotizaciones
     set estatus              = 'Enviada',
         items_aceptacion     = null,
         monto_aceptacion     = null,
         versiones_aceptacion = versiones_aceptacion || jsonb_build_array(
           jsonb_build_object('items', v_row.items_aceptacion,
                              'monto', v_row.monto_aceptacion,
                              'en',    now()))
   where id = v_row.id;
end;
$fn$;
alter  function public.cleo_reabrir_cotizacion(text) owner to cleo_service;
revoke all    on function public.cleo_reabrir_cotizacion(text) from public;
grant  execute on function public.cleo_reabrir_cotizacion(text) to authenticated;

-- C4: revertir UPDATE sobre oportunidades para cleo_service
revoke update on table public.oportunidades from cleo_service;

-- C3: triggers de borrado
drop trigger  if exists trg_cotizaciones_delete    on public.cotizaciones;
drop function if exists public.cleo_guard_cotizacion_delete();
drop trigger  if exists trg_negocios_delete_marker on public.negocios;
drop function if exists public.cleo_guard_negocio_delete_marker();

-- C2: restaurar índice regular
drop index if exists public.uq_cot_oportunidad;
create index idx_cot_oportunidad
  on public.cotizaciones (oportunidad_id)
  where oportunidad_id is not null;

-- C1: restaurar CHECK original
alter table public.recordatorios
  drop constraint recordatorios_categoria_check,
  add  constraint recordatorios_categoria_check
       check (categoria in ('pipeline','postventa','reactivacion','manual'));

-- C0: trigger de blob
drop trigger  if exists trg_user_data_schema_ver on public.user_data;
drop function if exists public.cleo_guard_blob_schema_ver();

commit;
*/
