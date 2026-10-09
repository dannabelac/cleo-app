-- 39-fix-guard-oportunidad-vinculada.sql
-- PROBLEMA: Los triggers cleo_guard_*_origen lanzan excepción cuando el flush
-- intenta escribir oportunidad_vinculada = false en un registro que ya tiene true
-- en la DB. Ocurre cuando el blob local está desactualizado (ej. la cotización/pedido
-- fue vinculada a una oportunidad desde otro dispositivo o sesión, y el blob local
-- aún tiene false). El flush falla y bloquea cualquier operación que lo dispare.
--
-- SOLUCIÓN: cambiar raise exception → new.oportunidad_vinculada := true
-- El trigger sigue protegiendo la invariante (nunca baja de true a false) pero
-- en lugar de abortar la transacción, corrige el valor silenciosamente.
-- La DB siempre gana: si tiene true, queda true independientemente del blob.
-- El resto de cada función es idéntico al original.
--
-- Afecta: cotizaciones, pedidos, historial_contactos/seguimiento.
-- Idempotente; seguro de re-ejecutar.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── cotizaciones ─────────────────────────────────────────────────────────────
create or replace function public.cleo_guard_cotizacion_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  -- FIX 39: preservar true silenciosamente en lugar de abortar el flush
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    new.oportunidad_vinculada := true;
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
      -- continúa a la verificación de coherencia
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

-- ── pedidos ───────────────────────────────────────────────────────────────────
create or replace function public.cleo_guard_pedido_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  -- FIX 39: preservar true silenciosamente en lugar de abortar el flush
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    new.oportunidad_vinculada := true;
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
      raise exception 'pedido: oportunidad_id no pertenece a este negocio';
    end if;
    if v_op_cli is distinct from new.cliente_id then
      raise exception
        'pedido: la oportunidad pertenece al cliente %, '
        'pero el pedido referencia al cliente %',
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
        'pedido: oportunidad_id es inmutable una vez asignado (cleo_id: %)', old.cleo_id;
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
    raise exception 'pedido: oportunidad_id no pertenece a este negocio';
  end if;
  if v_op_cli is distinct from new.cliente_id then
    raise exception
      'pedido: la oportunidad pertenece al cliente %, '
      'pero el pedido referencia al cliente %',
      v_op_cli, new.cliente_id;
  end if;
  return new;
end;
$$;

-- ── seguimiento / recordatorios ───────────────────────────────────────────────
create or replace function public.cleo_guard_seguimiento_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  -- FIX 39: preservar true silenciosamente en lugar de abortar el flush
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    new.oportunidad_vinculada := true;
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
      raise exception 'recordatorio: oportunidad_id no pertenece a este negocio';
    end if;
    if v_op_cli is distinct from new.cliente_id then
      raise exception
        'recordatorio: la oportunidad pertenece al cliente %, '
        'pero el recordatorio referencia al cliente %',
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
        'recordatorio: oportunidad_id es inmutable una vez asignado (id: %)', old.id;
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
    raise exception 'recordatorio: oportunidad_id no pertenece a este negocio';
  end if;
  if v_op_cli is distinct from new.cliente_id then
    raise exception
      'recordatorio: la oportunidad pertenece al cliente %, '
      'pero el recordatorio referencia al cliente %',
      v_op_cli, new.cliente_id;
  end if;
  return new;
end;
$$;

-- ── Verificación ─────────────────────────────────────────────────────────────
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'cleo_guard_cotizacion_origen',
    'cleo_guard_pedido_origen',
    'cleo_guard_seguimiento_origen'
  )
order by routine_name;
