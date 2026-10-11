-- ══════════════════════════════════════════════════════════════════════════════
-- 42-migrar-nuevos-usuarios-dual.sql
-- PRODUCCIÓN (gpvpvkeqfcgypuoxvjne)
--
-- 1. Migra artur.szklarski2@gmail.com de blob → dual (tiene datos reales)
-- 2. Migra zaci.facturas@gmail.com    de blob → dual (cuenta vacía)
-- 3. Cambia el DEFAULT de schema_ver en negocios a 'dual' (futuros usuarios)
--
-- Prerrequisito: parche 41 aplicado (tablas eventos existen).
-- Idempotente: ON CONFLICT DO NOTHING; guard si ya está en dual.
-- ══════════════════════════════════════════════════════════════════════════════

do $main$
declare
  v_email_artur  constant text := 'artur.szklarski2@gmail.com';
  v_email_zaci   constant text := 'zaci.facturas@gmail.com';

  v_user_id uuid;
  v_neg_id  uuid;
  v_sv      text;
  v_data    jsonb;

  v_it    jsonb;
  v_sub   jsonb;
  v_uuid  uuid;
  v_ci_id uuid;
  v_ev_id uuid;
begin

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. ARTURO — datos reales: productos, inventario, cliente, pedidos, evento
  -- ══════════════════════════════════════════════════════════════════════════
  select u.id into v_user_id from auth.users u where u.email = v_email_artur;
  if v_user_id is null then
    raise notice 'Usuario % no encontrado, saltando.', v_email_artur;
  else
    select n.id, n.schema_ver into v_neg_id, v_sv
      from public.negocios n where n.user_id = v_user_id;

    if v_sv = 'dual' then
      raise notice '% ya está en dual mode — nada que hacer.', v_email_artur;
    else
      select ud.data into v_data
        from public.user_data ud where ud.user_id = v_user_id;

      if v_data is null then
        raise notice '% no tiene datos en blob, solo cambiando schema_ver.', v_email_artur;
        update public.negocios set schema_ver = 'dual' where id = v_neg_id;
      else

        -- ── 1. Catálogo productos + movimientos de inventario ────────────────
        for v_it in
          select value from jsonb_array_elements(coalesce(v_data -> 'cleo_productos_cat', '[]'))
        loop
          insert into public.catalogo_items
            (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
             inventario_activo, stock, stock_minimo, costo_config)
          values (
            v_neg_id,
            v_it ->> 'id', 'productos',
            coalesce(v_it ->> 'nombre', ''),
            coalesce((v_it ->> 'precio')::numeric, 0),
            v_it ->> 'descripcion', v_it ->> 'condiciones',
            coalesce((v_it ->> 'inventarioActivo')::boolean, false),
            case when (v_it ->> 'inventarioActivo')::boolean
                 then nullif(v_it ->> 'stock', '')::int
                 else null end,
            nullif(v_it ->> 'stockMinimo', '')::int,
            v_it -> 'costoConfig'
          )
          on conflict (negocio_id, modo, cleo_id) do update set
            nombre            = excluded.nombre,
            precio            = excluded.precio,
            descripcion       = excluded.descripcion,
            inventario_activo = excluded.inventario_activo,
            stock             = excluded.stock,
            stock_minimo      = excluded.stock_minimo;

          select ci.id into v_ci_id
            from public.catalogo_items ci
           where ci.negocio_id = v_neg_id
             and ci.modo       = 'productos'
             and ci.cleo_id    = (v_it ->> 'id');

          for v_sub in
            select value from jsonb_array_elements(coalesce(v_it -> 'movimientos', '[]'))
          loop
            if (v_sub ->> 'id') is null then continue; end if;
            insert into public.inventario_movimientos (
              negocio_id, catalogo_item_id, cleo_id,
              fecha, tipo, nota, cant_antes, cant_despues
            )
            values (
              v_neg_id, v_ci_id, v_sub ->> 'id',
              nullif(v_sub ->> 'fecha', '')::date,
              v_sub ->> 'tipo',
              v_sub ->> 'nota',
              nullif(v_sub ->> 'cantAntes', '')::int,
              nullif(v_sub ->> 'cantDespues', '')::int
            )
            on conflict (negocio_id, cleo_id)
              where cleo_id is not null
            do nothing;
          end loop;
        end loop;

        -- ── 2. Clientes ───────────────────────────────────────────────────────
        for v_it in
          select value from jsonb_array_elements(coalesce(v_data -> 'cleo_clientes', '[]'))
        loop
          insert into public.clientes (
            negocio_id, cleo_id,
            nombre, empresa, telefono, email, instagram, messenger, canal,
            origen, etapa, fecha_etapa, estado_prospecto,
            motivo_perdida, ultimo_contacto,
            notas, etiqueta, nota_recontacto,
            fecha_pedido, seguimiento_custom,
            created_at
          )
          values (
            v_neg_id, v_it ->> 'id',
            coalesce(v_it ->> 'nombre', ''), v_it ->> 'negocio',
            v_it ->> 'contacto', v_it ->> 'email',
            v_it ->> 'instagram', v_it ->> 'messenger',
            v_it ->> 'canalPrincipal',
            v_it ->> 'origen',
            public.cleo_etapa_to_db(v_it ->> 'etapa'),
            nullif(v_it ->> 'fechaEtapa', '')::date,
            v_it ->> 'estadoProspecto',
            v_it ->> 'motivoPerdida',
            nullif(v_it ->> 'ultimoContacto', '')::date,
            v_it ->> 'notas', v_it ->> 'etiqueta',
            v_it ->> 'notaRecontacto',
            nullif(v_it ->> 'fechaPedido', '')::date,
            coalesce((v_it ->> 'seguimientoCustom')::boolean, false),
            coalesce(nullif(v_it ->> 'fecha', '')::timestamptz, now())
          )
          on conflict (negocio_id, cleo_id) do nothing;
        end loop;

        -- ── 3. Oportunidades ──────────────────────────────────────────────────
        for v_it in
          select value from jsonb_array_elements(coalesce(v_data -> 'cleo_oportunidades', '[]'))
        loop
          select c.id into v_uuid
            from public.clientes c
           where c.negocio_id = v_neg_id
             and c.cleo_id    = (v_it ->> 'clienteId');

          if v_uuid is null then
            raise notice 'oportunidad %: cliente % no encontrado, saltando.',
              v_it ->> 'id', v_it ->> 'clienteId';
            continue;
          end if;

          insert into public.oportunidades (
            negocio_id, cleo_id, cliente_id, modo,
            titulo, estatus, etapa,
            precio_interes, motivo_cierre,
            fecha, fecha_etapa, ultimo_contacto, fecha_cierre,
            origen_migracion
          )
          values (
            v_neg_id, v_it ->> 'id', v_uuid,
            coalesce(v_it ->> 'modo', 'productos'),
            coalesce(v_it ->> 'titulo', ''),
            coalesce(v_it ->> 'estatus', 'activa'),
            public.cleo_etapa_to_db(v_it ->> 'etapa'),
            nullif(v_it ->> 'precioInteres', '')::numeric,
            v_it ->> 'motivoCierre',
            coalesce(nullif(v_it ->> 'fecha', '')::date, current_date),
            nullif(v_it ->> 'fechaEtapa', '')::date,
            nullif(v_it ->> 'ultimoContacto', '')::date,
            nullif(v_it ->> 'fechaCierre', '')::date,
            coalesce(v_it ->> 'origenMigracion', 'nueva')
          )
          on conflict (negocio_id, cleo_id) do nothing;
        end loop;

        -- ── 4. Pedidos + pagos ────────────────────────────────────────────────
        for v_it in
          select value from jsonb_array_elements(coalesce(v_data -> 'cleo_pedidos', '[]'))
        loop
          declare
            v_cli_id uuid;
            v_op_id  uuid;
          begin
            select c.id into v_cli_id
              from public.clientes c
             where c.negocio_id = v_neg_id
               and c.cleo_id    = (v_it ->> 'clienteId');

            select o.id into v_op_id
              from public.oportunidades o
             where o.negocio_id = v_neg_id
               and o.cleo_id    = 'op_cli_' || (v_it ->> 'clienteId');

            insert into public.pedidos (
              negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
              origen_venta, items, productos, cantidad, monto_total,
              notas, etiqueta, estado_pedido, fecha, fecha_entrega,
              anticipo_conservado, motivo_cancelacion
            )
            values (
              v_neg_id, v_it ->> 'id', v_cli_id, null, v_op_id,
              coalesce(v_it ->> 'origenVenta', 'registro_manual'),
              coalesce(v_it -> 'items', '[]'), v_it ->> 'productos',
              coalesce((v_it ->> 'cantidad')::int, 0),
              coalesce((v_it ->> 'total')::numeric, 0),
              v_it ->> 'notas', v_it ->> 'etiqueta',
              coalesce(v_it ->> 'estadoPedido', 'preparando'),
              nullif(v_it ->> 'fecha', '')::date,
              nullif(v_it ->> 'fechaEntrega', '')::date,
              (v_it ->> 'anticipoConservado')::boolean,
              v_it ->> 'motivoCancelacion'
            )
            on conflict (negocio_id, cleo_id) do nothing;

            select pd.id into v_uuid
              from public.pedidos pd
             where pd.negocio_id = v_neg_id and pd.cleo_id = (v_it ->> 'id');

            if v_uuid is not null then
              for v_sub in
                select value from jsonb_array_elements(coalesce(v_it -> 'pagos', '[]'))
              loop
                if (v_sub ->> 'id') is null then continue; end if;
                insert into public.pagos (
                  negocio_id, cleo_id, pedido_id, monto, fecha, concepto
                )
                values (
                  v_neg_id, v_sub ->> 'id', v_uuid,
                  coalesce((v_sub ->> 'monto')::numeric, 0),
                  nullif(v_sub ->> 'fecha', '')::date,
                  v_sub ->> 'concepto'
                )
                on conflict (negocio_id, cleo_id) do nothing;
              end loop;
            end if;
          end;
        end loop;

        -- ── 5. Eventos + productos (cantidadLlevada → cantidad) ───────────────
        for v_it in
          select value from jsonb_array_elements(coalesce(v_data -> 'cleo_eventos_inventario', '[]'))
        loop
          insert into public.eventos_inventario (
            negocio_id, cleo_id, nombre, fecha, fecha_fin,
            estado, fecha_cierre, pedidos_ids, movimientos
          )
          values (
            v_neg_id, v_it ->> 'id',
            coalesce(v_it ->> 'nombre', ''),
            nullif(v_it ->> 'fecha',      '')::date,
            nullif(v_it ->> 'fechaFin',   '')::date,
            coalesce(v_it ->> 'estado', 'abierto'),
            nullif(v_it ->> 'fechaCierre','')::date,
            coalesce(v_it -> 'pedidosIds',  '[]'),
            coalesce(v_it -> 'movimientos', '[]')
          )
          on conflict (negocio_id, cleo_id) do nothing;

          select ei.id into v_ev_id
            from public.eventos_inventario ei
           where ei.negocio_id = v_neg_id and ei.cleo_id = (v_it ->> 'id');

          if v_ev_id is null then continue; end if;

          for v_sub in
            select value from jsonb_array_elements(coalesce(v_it -> 'productos', '[]'))
          loop
            if (v_sub ->> 'catalogoId') is null then continue; end if;
            insert into public.eventos_productos (
              negocio_id, evento_id, catalogo_id,
              nombre, precio, cantidad, cantidad_vendida, reserva
            )
            values (
              v_neg_id, v_ev_id,
              v_sub ->> 'catalogoId',
              coalesce(v_sub ->> 'nombre', ''),
              coalesce((v_sub ->> 'precio')::numeric, 0),
              coalesce((v_sub ->> 'cantidadLlevada')::int, (v_sub ->> 'cantidad')::int, 0),
              coalesce((v_sub ->> 'cantidadVendida')::int, 0),
              nullif(v_sub ->> 'reserva', '')::int
            );
          end loop;
        end loop;

        -- ── 6. Perfil → negocios ──────────────────────────────────────────────
        update public.negocios set
          nombre    = coalesce(nullif(v_data -> 'cleo_perfil' ->> 'nombre',          ''), nombre),
          color     = coalesce(nullif(v_data -> 'cleo_perfil' ->> 'color',           ''), color),
          color_sec = coalesce(nullif(v_data -> 'cleo_perfil' ->> 'colorSecundario', ''), color_sec)
        where id = v_neg_id;

        -- ── 7. Activar dual mode ──────────────────────────────────────────────
        update public.negocios set schema_ver = 'dual' where id = v_neg_id;

        raise notice 'Migrado a dual: %', v_email_artur;
      end if;
    end if;
  end if;


  -- ══════════════════════════════════════════════════════════════════════════
  -- B. ZACI — cuenta vacía: solo cambiar schema_ver
  -- ══════════════════════════════════════════════════════════════════════════
  select u.id into v_user_id from auth.users u where u.email = v_email_zaci;
  if v_user_id is null then
    raise notice 'Usuario % no encontrado, saltando.', v_email_zaci;
  else
    select n.id, n.schema_ver into v_neg_id, v_sv
      from public.negocios n where n.user_id = v_user_id;

    if v_sv = 'dual' then
      raise notice '% ya está en dual mode — nada que hacer.', v_email_zaci;
    else
      update public.negocios set schema_ver = 'dual' where id = v_neg_id;
      raise notice 'Migrado a dual: %', v_email_zaci;
    end if;
  end if;

end;
$main$;


-- ══════════════════════════════════════════════════════════════════════════════
-- C. DEFAULT schema_ver = 'dual' para cuentas nuevas
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.negocios
  alter column schema_ver set default 'dual';


-- ══════════════════════════════════════════════════════════════════════════════
-- D. Verificación
-- ══════════════════════════════════════════════════════════════════════════════
select
  u.email,
  n.schema_ver,
  n.nombre,
  (select count(*) from public.clientes     c where c.negocio_id = n.id) as clientes,
  (select count(*) from public.pedidos      p where p.negocio_id = n.id) as pedidos,
  (select count(*) from public.catalogo_items ci where ci.negocio_id = n.id) as catalogo,
  (select count(*) from public.eventos_inventario ei where ei.negocio_id = n.id) as eventos
from public.negocios n
join auth.users u on u.id = n.user_id
where u.email in ('artur.szklarski2@gmail.com', 'zaci.facturas@gmail.com')
order by u.email;

-- Resultado esperado para artur: schema_ver=dual, clientes=1, pedidos=2, catalogo=3, eventos=1
-- Resultado esperado para zaci:  schema_ver=dual, clientes=0, pedidos=0, catalogo=0, eventos=0
