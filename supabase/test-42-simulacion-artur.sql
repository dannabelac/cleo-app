-- ══════════════════════════════════════════════════════════════════════════════
-- test-42-simulacion-artur.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — solo simulación, termina en ROLLBACK
--
-- Corre la lógica de migración del parche 42 con el JSON real de artur en una
-- transacción que se revierta. Sirve para detectar bugs antes de producción.
--
-- Qué verifica:
--   - catalogo_items + inventario_movimientos se insertan correctamente
--   - clientes se insertan
--   - oportunidades resuelven clienteId correctamente
--   - pedidos resuelven clienteId null (venta_rapida) sin error
--   - eventos_inventario + productos usan cantidadLlevada correctamente
--   - El SELECT final muestra conteos y valores clave
-- ══════════════════════════════════════════════════════════════════════════════

begin;

do $test$
declare
  -- JSON real de artur (recortado a lo necesario para la prueba)
  v_data jsonb := $json${
    "cleo_perfil": {
      "nombre": "ARTI GOURMET",
      "color": "#4B5EFC",
      "colorSecundario": "#E4E2F8",
      "colorTexto": "#1A1635",
      "tipoPerfil": "productos",
      "tuNombre": "Arturo",
      "condicionesPago": "50% anticipo, 50% al entregar."
    },
    "cleo_tipo_perfil": "productos",
    "cleo_tombstones": [],
    "cleo_oportunidades": [
      {
        "id": "op_cli_1791665526382",
        "modo": "productos",
        "etapa": "convertido",
        "fecha": "2026-10-10",
        "titulo": "",
        "estatus": "ganada",
        "clienteId": "1791665526382",
        "fechaEtapa": "2026-10-10",
        "motivoCierre": null,
        "precioInteres": "",
        "ultimoContacto": "2026-10-10",
        "origenMigracion": "migrada_producto"
      }
    ],
    "cleo_clientes": [
      {
        "id": "1791665526382",
        "email": "",
        "etapa": "Ganado",
        "fecha": "2026-10-10",
        "notas": "",
        "nombre": "Mike Diaz de León",
        "origen": "",
        "negocio": "",
        "contacto": "",
        "instagram": "",
        "messenger": "",
        "fechaEtapa": "2026-10-10",
        "fechaPedido": "2026-10-10T20:52:06.427Z",
        "canalPrincipal": "WhatsApp",
        "notaRecontacto": "",
        "ultimoContacto": "2026-10-10",
        "estadoProspecto": "Convertido"
      }
    ],
    "cleo_productos_cat": [
      {
        "id": "1791665592574",
        "stock": 8,
        "nombre": "Crema Artesanal de Chile Xcatic 200gr",
        "precio": 135,
        "condiciones": "",
        "descripcion": "Frasco de 200gr",
        "movimientos": [
          {"id": "mov_1791665676989","nota": "Stock inicial","tipo": "ajuste_cantidad","fecha": "2026-10-10","cantAntes": null,"cantDespues": 8}
        ],
        "stockMinimo": null,
        "inventarioActivo": true
      },
      {
        "id": "1791665646209",
        "stock": 7,
        "nombre": "Salsa Artesanal de Chipotle 200gr",
        "precio": 95,
        "condiciones": "",
        "descripcion": "Frasco de 200gr",
        "movimientos": [
          {"id": "mov_1791665685259","nota": "Stock inicial","tipo": "ajuste_cantidad","fecha": "2026-10-10","cantAntes": null,"cantDespues": 8},
          {"id": "mov_1791677738230_1791665646209","nota": "Venta rápida","tipo": "entrega","fecha": "2026-10-10","cantAntes": 8,"cantDespues": 7}
        ],
        "stockMinimo": null,
        "inventarioActivo": true
      }
    ],
    "cleo_pedidos": [
      {
        "id": "ped_1791677738212",
        "fecha": "2026-10-10",
        "items": [{"id": 1791677718743,"total": 95,"nombre": "Salsa Artesanal de Chipotle 200gr","cantidad": 1,"catalogoId": 1791665646209,"precioUnitario": 95}],
        "notas": "Efectivo",
        "pagos": [{"id": "pg_1791677738212_mwdv5","fecha": "2026-10-10","monto": 95,"concepto": "Pago completo"}],
        "total": 95,
        "cantidad": 1,
        "etiqueta": "Tianguis Francisco de Montejo",
        "clienteId": null,
        "productos": "Salsa Artesanal de Chipotle 200gr",
        "origenVenta": "venta_rapida",
        "estadoPedido": "entregado",
        "fechaEntrega": "2026-10-10"
      },
      {
        "id": "ped_1791665526382",
        "fecha": "2026-10-10",
        "items": [{"id": "it_1791665470415","total": 125,"nombre": "Crema Artesanal de chile xcatic","cantidad": 1,"catalogoId": null,"precioUnitario": 125}],
        "notas": "",
        "pagos": [{"id": "pg_1791665526383_1r8rc","fecha": "2026-10-10","monto": 125,"concepto": "Pago completo"}],
        "total": 125,
        "cantidad": 1,
        "clienteId": "1791665526382",
        "productos": "Crema Artesanal de chile xcatic",
        "origenVenta": "registro_manual",
        "estadoPedido": "entregado",
        "fechaEntrega": "2026-10-10"
      }
    ],
    "cleo_eventos_inventario": [
      {
        "id": "evt_1791677709860",
        "fecha": "2026-10-10",
        "estado": "abierto",
        "nombre": "Tianguis Francisco de Montejo",
        "fechaFin": "2026-10-10",
        "productos": [
          {"nombre": "Crema Artesanal de Chile Xcatic 200gr","catalogoId": "1791665592574","cantidadLlevada": 8,"cantidadVendida": 0,"tieneInventario": true,"cantidadRegresada": null},
          {"nombre": "Salsa Artesanal de Chipotle 200gr","catalogoId": "1791665646209","cantidadLlevada": 8,"cantidadVendida": 1,"tieneInventario": true,"cantidadRegresada": null}
        ],
        "pedidosIds": ["ped_1791677738212"],
        "fechaCierre": null,
        "movimientos": [
          {"id": "emov_1791677738234","nota": "Salsa Artesanal de Chipotle 200gr","tipo": "venta","fecha": "2026-10-10","pedidoId": "ped_1791677738212"}
        ]
      }
    ]
  }$json$;

  -- negocio de prueba (usamos victoria@cleo.test que existe en CLEO Pruebas)
  v_test_email constant text := 'victoria@cleo.test';
  v_user_id uuid;
  v_neg_id  uuid;
  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_ci_id   uuid;
  v_ev_id   uuid;
begin
  select u.id into v_user_id from auth.users u where u.email = v_test_email;
  if v_user_id is null then
    raise exception 'Usuario de prueba % no encontrado en CLEO Pruebas', v_test_email;
  end if;

  select n.id into v_neg_id from public.negocios n where n.user_id = v_user_id;

  -- Limpiar datos previos del usuario de prueba para la simulación
  delete from public.eventos_inventario  where negocio_id = v_neg_id;
  delete from public.catalogo_items      where negocio_id = v_neg_id;
  delete from public.pedidos             where negocio_id = v_neg_id;
  delete from public.oportunidades       where negocio_id = v_neg_id;
  delete from public.clientes            where negocio_id = v_neg_id;

  -- ── 1. Catálogo productos + movimientos ─────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_data -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
       inventario_activo, stock, stock_minimo, costo_config)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
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
      nombre = excluded.nombre, precio = excluded.precio,
      stock  = excluded.stock;

    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id and ci.modo = 'productos'
       and ci.cleo_id = (v_it ->> 'id');

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
        nullif(v_sub ->> 'fecha', '')::date, v_sub ->> 'tipo',
        v_sub ->> 'nota',
        nullif(v_sub ->> 'cantAntes', '')::int,
        nullif(v_sub ->> 'cantDespues', '')::int
      )
      on conflict (negocio_id, cleo_id) where cleo_id is not null do nothing;
    end loop;
  end loop;

  -- ── 2. Clientes ─────────────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_data -> 'cleo_clientes', '[]'))
  loop
    insert into public.clientes (
      negocio_id, cleo_id, nombre, empresa, telefono, canal,
      origen, etapa, fecha_etapa, estado_prospecto,
      ultimo_contacto, notas, fecha_pedido, seguimiento_custom, created_at
    )
    values (
      v_neg_id, v_it ->> 'id',
      coalesce(v_it ->> 'nombre', ''), v_it ->> 'negocio',
      v_it ->> 'contacto', v_it ->> 'canalPrincipal',
      v_it ->> 'origen',
      public.cleo_etapa_to_db(v_it ->> 'etapa'),
      nullif(v_it ->> 'fechaEtapa', '')::date,
      v_it ->> 'estadoProspecto',
      nullif(v_it ->> 'ultimoContacto', '')::date,
      v_it ->> 'notas',
      nullif(v_it ->> 'fechaPedido', '')::date,
      coalesce((v_it ->> 'seguimientoCustom')::boolean, false),
      coalesce(nullif(v_it ->> 'fecha', '')::timestamptz, now())
    )
    on conflict (negocio_id, cleo_id) do nothing;
  end loop;

  -- ── 3. Oportunidades ────────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_data -> 'cleo_oportunidades', '[]'))
  loop
    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    if v_uuid is null then
      raise notice 'BUG: oportunidad % — clienteId=% no encontrado',
        v_it ->> 'id', v_it ->> 'clienteId';
      continue;
    end if;

    insert into public.oportunidades (
      negocio_id, cleo_id, cliente_id, modo,
      titulo, estatus, etapa, fecha, fecha_etapa, origen_migracion
    )
    values (
      v_neg_id, v_it ->> 'id', v_uuid,
      coalesce(v_it ->> 'modo', 'productos'),
      coalesce(v_it ->> 'titulo', ''),
      coalesce(v_it ->> 'estatus', 'activa'),
      public.cleo_etapa_to_db(v_it ->> 'etapa'),
      coalesce(nullif(v_it ->> 'fecha', '')::date, current_date),
      nullif(v_it ->> 'fechaEtapa', '')::date,
      coalesce(v_it ->> 'origenMigracion', 'nueva')
    )
    on conflict (negocio_id, cleo_id) do nothing;
  end loop;

  -- ── 4. Pedidos + pagos ──────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_data -> 'cleo_pedidos', '[]'))
  loop
    declare
      v_cli_id uuid;
      v_op_id  uuid;
    begin
      select c.id into v_cli_id from public.clientes c
       where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

      select o.id into v_op_id from public.oportunidades o
       where o.negocio_id = v_neg_id
         and o.cleo_id = 'op_cli_' || (v_it ->> 'clienteId');

      -- clienteId null (venta_rapida) no debe causar error
      insert into public.pedidos (
        negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
        origen_venta, items, productos, cantidad, monto_total,
        notas, etiqueta, estado_pedido, fecha, fecha_entrega
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
        nullif(v_it ->> 'fechaEntrega', '')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;

      select pd.id into v_uuid
        from public.pedidos pd
       where pd.negocio_id = v_neg_id and pd.cleo_id = (v_it ->> 'id');

      if v_uuid is not null then
        for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos', '[]'))
        loop
          if (v_sub ->> 'id') is null then continue; end if;
          insert into public.pagos (negocio_id, cleo_id, pedido_id, monto, fecha, concepto)
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

  -- ── 5. Eventos + productos ──────────────────────────────────────────────────
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
      nullif(v_it ->> 'fecha', '')::date,
      nullif(v_it ->> 'fechaFin', '')::date,
      coalesce(v_it ->> 'estado', 'abierto'),
      nullif(v_it ->> 'fechaCierre', '')::date,
      coalesce(v_it -> 'pedidosIds', '[]'),
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
        nombre, precio, cantidad, cantidad_vendida
      )
      values (
        v_neg_id, v_ev_id,
        v_sub ->> 'catalogoId',
        coalesce(v_sub ->> 'nombre', ''),
        coalesce((v_sub ->> 'precio')::numeric, 0),
        coalesce((v_sub ->> 'cantidadLlevada')::int, (v_sub ->> 'cantidad')::int, 0),
        coalesce((v_sub ->> 'cantidadVendida')::int, 0)
      );
    end loop;
  end loop;

  raise notice 'Simulación completada para %', v_test_email;
end;
$test$;

-- ── Verificación — revisar que todos los valores son correctos ────────────────

select 'catalogo_items' as tabla, ci.cleo_id, ci.nombre, ci.precio, ci.stock,
       (select count(*) from public.inventario_movimientos mv
         where mv.catalogo_item_id = ci.id) as movimientos
  from public.catalogo_items ci
  join public.negocios n on n.id = ci.negocio_id
  join auth.users u on u.id = n.user_id
 where u.email = 'victoria@cleo.test' and ci.modo = 'productos';

select 'clientes' as tabla, c.cleo_id, c.nombre, c.etapa, c.estado_prospecto,
       c.canal, c.fecha_pedido::text
  from public.clientes c
  join public.negocios n on n.id = c.negocio_id
  join auth.users u on u.id = n.user_id
 where u.email = 'victoria@cleo.test';

select 'oportunidades' as tabla, o.cleo_id, o.modo, o.estatus, o.etapa
  from public.oportunidades o
  join public.negocios n on n.id = o.negocio_id
  join auth.users u on u.id = n.user_id
 where u.email = 'victoria@cleo.test';

select 'pedidos' as tabla, p.cleo_id, p.origen_venta, p.monto_total,
       p.cliente_id is null as sin_cliente,
       (select count(*) from public.pagos pg where pg.pedido_id = p.id) as pagos
  from public.pedidos p
  join public.negocios n on n.id = p.negocio_id
  join auth.users u on u.id = n.user_id
 where u.email = 'victoria@cleo.test';

select 'eventos' as tabla,
       ei.nombre, ei.fecha, ei.estado,
       ep.nombre as producto, ep.cantidad as cantidad_llevada, ep.cantidad_vendida
  from public.eventos_inventario ei
  join public.eventos_productos ep on ep.evento_id = ei.id
  join public.negocios n on n.id = ei.negocio_id
  join auth.users u on u.id = n.user_id
 where u.email = 'victoria@cleo.test';

-- Al revisar: en la tabla eventos, cantidad_llevada debe ser 8 para ambos productos
-- (NO 0) — eso valida el fix de cantidadLlevada.

rollback;
