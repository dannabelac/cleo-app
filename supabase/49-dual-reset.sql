-- ══════════════════════════════════════════════════════════════════════════════
-- 49-dual-reset.sql
-- CLEO Pruebas primero — después produccion-funciones.sql
--
-- Crea la función cleo_dual_reset() que borra todos los datos del negocio
-- del usuario autenticado (clientes, pedidos, eventos, etc.) dejando la
-- cuenta intacta con schema_ver='dual'.
--
-- Seguridad: SECURITY DEFINER + SET search_path = public — solo opera sobre
-- las filas cuyo negocio pertenece a auth.uid(). Nadie puede borrar datos
-- de otro usuario.
--
-- Reversible: la cuenta y el negocio sobreviven; solo los datos de negocio
-- desaparecen. No toca auth.users ni la fila de negocios en sí.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleo_dual_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_neg_id   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('estado', 'error', 'detalle', 'no autenticado');
  end if;

  -- Obtener el negocio del usuario
  select id into v_neg_id
    from public.negocios
   where user_id = v_uid
   limit 1;

  -- Siempre borrar el blob (aplica a blob y dual)
  delete from public.user_data where user_id = v_uid;

  if v_neg_id is null then
    -- Usuario blob puro sin negocio: blob ya borrado, nada más que hacer
    return jsonb_build_object('estado', 'ok', 'detalle', 'sin_negocio');
  end if;

  -- ── Borrar datos relacionales del negocio ─────────────────────────────────
  -- Pagos (referencia a pedidos/cotizaciones/ventas)
  delete from public.pagos            where negocio_id = v_neg_id;
  -- Eventos (gastos, productos vendidos, inventario llevado)
  delete from public.eventos_gastos   where negocio_id = v_neg_id;
  delete from public.eventos_productos where negocio_id = v_neg_id;
  delete from public.eventos_inventario where negocio_id = v_neg_id;
  -- Pedidos y cotizaciones
  delete from public.pedidos          where negocio_id = v_neg_id;
  delete from public.cotizaciones     where negocio_id = v_neg_id;
  -- Ventas directas
  delete from public.ventas           where negocio_id = v_neg_id;
  -- Historial y oportunidades
  delete from public.historial_contactos where negocio_id = v_neg_id;
  delete from public.oportunidades    where negocio_id = v_neg_id;
  -- Tombstones
  delete from public.tombstones       where negocio_id = v_neg_id;
  -- Clientes (al final, porque otros los referencian)
  delete from public.clientes         where negocio_id = v_neg_id;

  return jsonb_build_object('estado', 'ok');
end;
$$;

-- Revocar acceso público y otorgar solo a usuarios autenticados
revoke all on function public.cleo_dual_reset() from public;
grant execute on function public.cleo_dual_reset() to authenticated;

comment on function public.cleo_dual_reset() is
  'Borra todos los datos del negocio del usuario autenticado (clientes, pedidos, eventos, etc.) '
  'dejando la cuenta y el negocio intactos. Solo opera sobre el negocio propio.';
