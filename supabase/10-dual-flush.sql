-- ══════════════════════════════════════════════════════════════════════════════
-- 10-dual-flush.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — solo modo dual
--
-- Añade columnas faltantes al schema y define dos funciones:
--   cleo_dual_flush()  — recibe el blob del cliente y escribe en tablas + user_data
--   cleo_dual_read()   — lee las tablas y serializa el blob para el cliente
--
-- NO activa schema_ver='dual' en ningún negocio.
-- NO modifica producción.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A. COLUMNAS FALTANTES (idempotente) ──────────────────────────────────────

-- clientes: P5
alter table public.clientes
  add column if not exists seguimiento_fecha             date,
  add column if not exists mensaje_seguimiento_postventa text;

-- ventas: P1-P3
alter table public.ventas
  add column if not exists tipo_pago    text check (tipo_pago in ('completo','anticipo')),
  add column if not exists entregado    boolean not null default false,
  add column if not exists fecha_entrega date;

-- cotizaciones: P6-P7 + entregado/fechaEntrega no listadas antes pero presentes en blob
alter table public.cotizaciones
  add column if not exists seguimiento_fecha  date,
  add column if not exists motivo_perdida     text,
  add column if not exists entregado          boolean not null default false,
  add column if not exists fecha_entrega      date;

-- historial_contactos: columnas del blob no incluidas en el schema original
-- fecha_hora: timestamp preciso (blob.fechaHora) — `fecha` timestamptz existente se mantiene
-- resultado:  etiqueta de texto ("Precio enviado", "Consulta registrada", …)
-- items:      array de productos/servicios de la cotización al momento del evento
-- resumen:    texto descriptivo precalculado de los items
alter table public.historial_contactos
  add column if not exists fecha_hora  timestamptz,
  add column if not exists resultado   text,
  add column if not exists items       jsonb,
  add column if not exists resumen     text;


-- ── A.1. CORREGIR TRIGGER updated_at EN user_data ────────────────────────────
-- now() devuelve la hora de inicio de transacción (constante en toda la TX).
-- Dos escrituras en la misma TX quedarían con el mismo updated_at, rompiendo
-- la detección de conflicto de versión. clock_timestamp() avanza con el reloj
-- real incluso dentro de una TX, garantizando timestamps únicos por escritura.
create or replace function public.cleo_test_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.cleo_test_set_updated_at() from public;


-- ── A.2. CORREGIR GUARDIA trg_user_data_schema_ver ───────────────────────────
-- El trigger existente bloquea CUALQUIER escritura en user_data cuando
-- schema_ver ≠ 'blob', incluyendo las que hace cleo_dual_flush (SECURITY
-- DEFINER, dueño = postgres, current_user ≠ 'authenticated').
-- Añadimos la condición current_user = 'authenticated' para que sólo el
-- cliente CLEO quede bloqueado; las funciones de servicio pueden escribir.
create or replace function public.cleo_guard_blob_schema_ver()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_schema_ver text;
begin
  select schema_ver into v_schema_ver
    from public.negocios
   where user_id = new.user_id;

  if current_user = 'authenticated'
     and v_schema_ver is distinct from 'blob'
     and v_schema_ver is not null then
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


-- ══════════════════════════════════════════════════════════════════════════════
-- B. FUNCIÓN AUXILIAR: serializar cleo_id a número JSON si es numérico
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleo_id_to_json(p text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^[0-9]+$' then to_jsonb(p::bigint) else to_jsonb(p) end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- C. cleo_dual_read()
-- Lee las tablas relacionales y reconstruye el blob completo.
-- Lectura consistente: un único snapshot de transacción.
-- Devuelve: {"data": <blob>, "updated_at": <timestamp>}
-- Errores: {"estado":"error","codigo":"..."}
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleo_dual_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid         uuid := auth.uid();
  v_neg_id      uuid;
  v_sv          text;
  v_updated_at  timestamptz;
  v_blob        jsonb;
  v_neg         record;
begin
  -- Auth
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

  -- Negocio + schema_ver
  select n.id, n.schema_ver, n.nombre, n.nombre_contacto, n.tipo_perfil,
         n.telefono, n.email, n.color, n.color_sec,
         n.banco, n.cuenta, n.clabe, n.titular,
         n.moneda, n.productos, n.config, n.datos_ui
    into v_neg
    from public.negocios n
   where n.user_id = v_uid;

  if v_neg.id is null then
    return jsonb_build_object('estado','error','codigo','negocio_no_encontrado');
  end if;
  v_neg_id := v_neg.id;
  v_sv     := v_neg.schema_ver;

  if v_sv <> 'dual' then
    return jsonb_build_object('estado','error','codigo',
      case when v_sv = 'blob' then 'schema_no_dual' else 'schema_ya_relacional' end,
      'schema_ver', v_sv);
  end if;

  -- updated_at de user_data (versión del blob)
  select ud.updated_at into v_updated_at
    from public.user_data ud where ud.user_id = v_uid;

  -- ── Serializar blob ────────────────────────────────────────────────────────
  select jsonb_build_object(
    -- Perfil
    'cleo_tipo_perfil',        v_neg.tipo_perfil,
    'cleo_perfil', jsonb_build_object(
      'nombre',              coalesce(v_neg.nombre,          ''),
      'tuNombre',            v_neg.nombre_contacto,
      'tipoPerfil',          v_neg.tipo_perfil,
      'telefono',            v_neg.telefono,
      'email',               v_neg.email,
      'color',               v_neg.color,
      'colorSecundario',     v_neg.color_sec,
      'banco',               v_neg.banco,
      'bancoaccount',        v_neg.cuenta,
      'bancoclabe',          v_neg.clabe,
      'bancotitular',        v_neg.titular,
      'logo',                coalesce(v_neg.config ->> 'logo',               ''),
      'mensaje',             coalesce(v_neg.config ->> 'mensaje',            ''),
      'condicionesPago',     coalesce(v_neg.config ->> 'condicionesPago',    ''),
      'redesTT',             coalesce(v_neg.config ->> 'redesTT',            ''),
      'redesIG',             coalesce(v_neg.config ->> 'redesIG',            ''),
      'redesFB',             coalesce(v_neg.config ->> 'redesFB',            ''),
      'colorTexto',          coalesce(v_neg.config ->> 'colorTexto',         ''),
      'bancotarjeta',        coalesce(v_neg.config ->> 'bancotarjeta',       ''),
      'bancoinstrucciones',  coalesce(v_neg.config ->> 'bancoinstrucciones', ''),
      'direccion',           coalesce(v_neg.config ->> 'direccion',          '')
    ),
    -- Datos UI
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    -- Productos (array de nombres)
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
    -- Catálogo servicios
    'cleo_servicios',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          public.cleo_id_to_json(ci.cleo_id),
            'nombre',      ci.nombre,
            'precio',      ci.precio,
            'descripcion', ci.descripcion,
            'condiciones', ci.condiciones
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'servicios'),
        '[]'::jsonb
      ),
    -- Catálogo productos
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          public.cleo_id_to_json(ci.cleo_id),
            'nombre',      ci.nombre,
            'precio',      ci.precio,
            'descripcion', ci.descripcion,
            'condiciones', ci.condiciones
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
    -- Clientes (con recordatorios e historial embebidos)
    'cleo_clientes',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                            public.cleo_id_to_json(c.cleo_id),
            'nombre',                        c.nombre,
            'negocio',                       c.empresa,
            'contacto',                      c.telefono,
            'email',                         c.email,
            'instagram',                     c.instagram,
            'messenger',                     c.messenger,
            'canalPrincipal',                c.canal,
            'origen',                        c.origen,
            'etapa',                         c.etapa,
            'fechaEtapa',                    c.fecha_etapa,
            'estadoProspecto',               c.estado_prospecto,
            'motivoPerdida',                 c.motivo_perdida,
            'razonCierre',                   c.razon_cierre,
            'ultimoContacto',                c.ultimo_contacto,
            'notas',                         c.notas,
            'etiqueta',                      c.etiqueta,
            'notaRecontacto',                c.nota_recontacto,
            'fechaPedido',                   c.fecha_pedido,
            'servicioInteres',               c.servicio_interes,
            'itemsInteres',                  c.items_interes,
            'mensajeSeguimiento',            c.mensaje_seguimiento,
            'seguimientoCustom',             c.seguimiento_custom,
            'seguimientoFecha',              c.seguimiento_fecha,
            'mensajeSeguimientoPostVenta',   c.mensaje_seguimiento_postventa,
            'fecha',                         c.created_at::date,
            'recordatorios',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',              r.cleo_id,
                    'oportunidadId',   op_r.cleo_id,
                    'categoria',       r.categoria,
                    'nota',            r.texto,
                    'fecha',           r.fecha,
                    'completado',      r.completado,
                    'estatus',         r.estatus,
                    'esPersonalizada', r.es_personalizada,
                    'origen',          r.origen
                  ) order by r.fecha)
                 from public.recordatorios r
                 left join public.oportunidades op_r
                        on op_r.id = r.oportunidad_id and op_r.negocio_id = r.negocio_id
                where r.cliente_id = c.id and r.negocio_id = c.negocio_id),
                '[]'::jsonb
              ),
            'historialContactos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',        h.cleo_id,
                    'tipo',      h.tipo,
                    'fecha',     h.fecha,
                    'fechaHora', h.fecha_hora,
                    'resultado', h.resultado,
                    'items',     h.items,
                    'monto',     h.monto,
                    'resumen',   h.resumen
                  ) order by h.fecha_hora)
                 from public.historial_contactos h
                where h.cliente_id = c.id and h.negocio_id = c.negocio_id),
                '[]'::jsonb
              )
          ) order by c.created_at)
         from public.clientes c
        where c.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Oportunidades (nuevo array dual)
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           o.etapa,
            'fecha',           o.fecha,
            'fechaEtapa',      o.fecha_etapa,
            'fechaCierre',     o.fecha_cierre,
            'motivoCierre',    o.motivo_cierre,
            'origenMigracion', o.origen_migracion
          ) order by o.fecha)
         from public.oportunidades o
         join public.clientes c_o on c_o.id = o.cliente_id
        where o.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Cotizaciones (con pagos embebidos)
    'cleo_cots',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                     ct.cleo_id,
            'clienteId',              public.cleo_id_to_json(c_ct.cleo_id),
            'items',                  ct.items,
            'subtotal',               ct.subtotal,
            'monto',                  ct.monto,
            'descuento',              ct.descuento,
            'tipoDescuento',          ct.tipo_descuento,
            'anticipo',               ct.anticipo,
            'fechaAnticipo',          ct.fecha_anticipo,
            'vigencia',               ct.vigencia,
            'vigenciaDias',           ct.vigencia_dias,
            'tipoPago',               ct.tipo_pago,
            'svCondiciones',          ct.sv_condiciones,
            'svCondicionesHtml',      ct.sv_condiciones_html,
            'notas',                  ct.notas,
            'etiqueta',               ct.etiqueta,
            'estatus',                ct.estatus,
            'fecha',                  ct.fecha,
            'fechaEnvio',             ct.fecha_envio,
            'fechaCierre',            ct.fecha_cierre,
            'fechaHoraCierre',        ct.fecha_hora_cierre,
            'fechaRechazo',           ct.fecha_rechazo,
            'fechaHoraRechazo',       ct.fecha_hora_rechazo,
            'itemsAceptacion',        ct.items_aceptacion,
            'montoAceptacion',        ct.monto_aceptacion,
            'configPostVenta',        case
              when ct.postv_pago is not null or ct.postv_seguimiento is not null
              then jsonb_build_object('pago', ct.postv_pago, 'seguimiento', ct.postv_seguimiento)
              else null end,
            'seguimientoFecha',       ct.seguimiento_fecha,
            'motivoPerdida',          ct.motivo_perdida,
            'entregado',              ct.entregado,
            'fechaEntrega',           ct.fecha_entrega,
            'vinculadaOportunidadActual', ct.oportunidad_vinculada,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',       pg.cleo_id,
                    'monto',    pg.monto,
                    'fecha',    pg.fecha,
                    'concepto', pg.concepto
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.cotizacion_id = ct.id and pg.negocio_id = ct.negocio_id),
                '[]'::jsonb
              )
          ) order by ct.fecha)
         from public.cotizaciones ct
         left join public.clientes c_ct on c_ct.id = ct.cliente_id
        where ct.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Ventas (con pagos embebidos)
    'cleo_ventas',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          vt.cleo_id,
            'clienteId',   public.cleo_id_to_json(c_vt.cleo_id),
            'concepto',    vt.concepto,
            'items',       vt.items,
            'monto',       vt.monto,
            'tipo',        case when vt.tipo = 'normal' then 'especifico' else 'dia' end,
            'notas',       vt.notas,
            'etiqueta',    vt.etiqueta,
            'fecha',       vt.fecha,
            'tipoPago',    vt.tipo_pago,
            'entregado',   vt.entregado,
            'fechaEntrega',vt.fecha_entrega,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',pg.cleo_id,'concepto',pg.concepto,'monto',pg.monto,'fecha',pg.fecha
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.venta_id = vt.id and pg.negocio_id = vt.negocio_id),
                '[]'::jsonb
              )
          ) order by vt.fecha)
         from public.ventas vt
         left join public.clientes c_vt on c_vt.id = vt.cliente_id
        where vt.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Pedidos (con pagos embebidos)
    'cleo_pedidos',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                  pd.cleo_id,
            'clienteId',           public.cleo_id_to_json(c_pd.cleo_id),
            'cotizacionId',        ct_pd.cleo_id,
            'origenVenta',         pd.origen_venta,
            'items',               pd.items,
            'productos',           pd.productos,
            'cantidad',            pd.cantidad,
            'total',               pd.monto_total,
            'notas',               pd.notas,
            'etiqueta',            pd.etiqueta,
            'estadoPedido',        pd.estado_pedido,
            'fecha',               pd.fecha,
            'fechaEntrega',        pd.fecha_entrega,
            'fechaCancelacion',    pd.fecha_cancelacion,
            'anticipoConservado',  pd.anticipo_conservado,
            'motivoCancelacion',   pd.motivo_cancelacion,
            'motivoCancelacionLado', pd.motivo_cancelacion_lado,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',pg.cleo_id,'monto',pg.monto,'fecha',pg.fecha,'concepto',pg.concepto
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.pedido_id = pd.id and pg.negocio_id = pd.negocio_id),
                '[]'::jsonb
              )
          ) order by pd.fecha)
         from public.pedidos pd
         left join public.clientes   c_pd  on c_pd.id  = pd.cliente_id
         left join public.cotizaciones ct_pd on ct_pd.id = pd.cotizacion_id
        where pd.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Tombstones vacíos (se limpian al leer desde el servidor)
    'cleo_tombstones', '[]'::jsonb
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;


-- ══════════════════════════════════════════════════════════════════════════════
-- D. cleo_dual_flush()
-- Recibe el blob del cliente y escribe en tablas relacionales + user_data.
--
-- Contrato de concurrencia:
--   SELECT ... FOR UPDATE sobre la fila user_data bloquea la versión desde
--   la comprobación hasta el commit. Dos llamadas con el mismo updated_at no
--   pueden tener éxito simultáneamente: la segunda lee la versión actualizada
--   y devuelve conflicto.
--
-- Tombstones:
--   Procesados antes de los UPSERT. Las mismas entidades tombstoneadas se
--   excluyen de los UPSERT siguientes para evitar resurrección.
--
-- Historial de contactos:
--   Solo INSERT. Si el cleo_id ya existe con contenido distinto, se reporta
--   en el campo historial_conflictos del resultado (no se sobrescribe).
--
-- Devuelve:
--   {"estado":"ok","updated_at":"...","historial_conflictos":[...]}
--   {"estado":"conflicto"}
--   {"estado":"error","codigo":"...","mensaje":"..."}
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleo_dual_flush(
  p_data              jsonb,
  p_tipo_perfil       text,
  p_ultimo_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid     uuid := auth.uid();
  v_neg_id  uuid;
  v_sv      text;
  v_ud_updated_at  timestamptz;
  v_ud_exists      boolean := false;
  v_new_updated_at timestamptz;

  -- Tombstone sets (cleo_ids o storage_paths a borrar)
  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';   -- storage_paths

  -- Iteradores
  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_uuid2   uuid;

  -- Conflictos de historial_contactos
  v_hist_conflictos jsonb := '[]'::jsonb;
  v_hist_existente  record;

  -- Contadores
  v_n int;
begin

  -- ── 0. AUTH ───────────────────────────────────────────────────────────────
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

  -- ── 1. NEGOCIO + SCHEMA_VER ───────────────────────────────────────────────
  select n.id, n.schema_ver into v_neg_id, v_sv
    from public.negocios n
   where n.user_id = v_uid;

  if v_neg_id is null then
    return jsonb_build_object('estado','error','codigo','negocio_no_encontrado');
  end if;

  if v_sv <> 'dual' then
    return jsonb_build_object(
      'estado','error',
      'codigo', case when v_sv = 'blob' then 'schema_no_dual' else 'schema_ya_relacional' end,
      'schema_ver', v_sv
    );
  end if;

  -- ── 2. FORMATO: cleo_oportunidades y cleo_tombstones deben estar presentes ─
  if p_data -> 'cleo_oportunidades' is null then
    return jsonb_build_object(
      'estado','error','codigo','formato_antiguo',
      'mensaje','Falta cleo_oportunidades. Actualiza la aplicación antes de guardar en modo dual.'
    );
  end if;
  if p_data -> 'cleo_tombstones' is null then
    return jsonb_build_object(
      'estado','error','codigo','formato_antiguo',
      'mensaje','Falta cleo_tombstones. Actualiza la aplicación antes de guardar en modo dual.'
    );
  end if;

  -- ── 3. BLOQUEO OPTIMISTA ──────────────────────────────────────────────────
  -- SELECT FOR UPDATE: mantiene el bloqueo hasta commit.
  -- Garantía: dos saves con la misma versión no pueden tener éxito ambos.
  select ud.updated_at, true
    into v_ud_updated_at, v_ud_exists
    from public.user_data ud
   where ud.user_id = v_uid
     for update;

  if not found then
    -- Primera escritura esperada
    if p_ultimo_updated_at is not null then
      -- El cliente cree que hay una versión, pero no hay fila
      return jsonb_build_object('estado','conflicto');
    end if;
    v_ud_exists := false;
  else
    if p_ultimo_updated_at is null then
      -- Cliente cree que es primera escritura, pero la fila ya existe
      return jsonb_build_object('estado','conflicto');
    end if;
    if v_ud_updated_at is distinct from p_ultimo_updated_at then
      return jsonb_build_object('estado','conflicto');
    end if;
  end if;

  -- ── 4. RECOPILAR TOMBSTONES ───────────────────────────────────────────────
  select
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cliente'),      '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'oportunidad'),  '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cotizacion'),   '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'venta'),        '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'pedido'),       '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'recordatorio'),'{}'),
    coalesce(array_agg(t ->> 'storagePath') filter (where t ->> 'tipo' = 'adjunto'),      '{}')
  into
    v_del_clientes, v_del_oportunidades, v_del_cotizaciones,
    v_del_ventas, v_del_pedidos, v_del_recordatorios, v_del_adjuntos
  from jsonb_array_elements(coalesce(p_data -> 'cleo_tombstones', '[]')) t;

  -- ── 5. PROCESAR BORRADOS ──────────────────────────────────────────────────
  -- Orden: primero entidades hoja, luego entidades padre.
  -- FK ON DELETE CASCADE/SET NULL del schema hace el resto.

  -- Habilita bypass en triggers de cotizaciones para tombstones autorizados.
  -- local=true: se resetea al final de la TX — no afecta otras operaciones.
  perform set_config('cleo.procesando_tombstones', 'true', true);

  -- Adjuntos (no hay cleo_id; se usa storage_path como identificador)
  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id  = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;

  -- Recordatorios individuales
  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_recordatorios);
  end if;

  -- Oportunidades: cotizaciones.oportunidad_id → SET NULL (cotizaciones persisten)
  --               recordatorios.oportunidad_id → SET NULL (recordatorios persisten)
  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_oportunidades);
  end if;

  -- Cotizaciones: pagos → CASCADE; historial.cotizacion_id → SET NULL; adjuntos → CASCADE
  -- Desvinculamos de oportunidad ANTES de borrar para evitar trg_cotizaciones_delete,
  -- que bloquea el DELETE cuando oportunidad_id IS NOT NULL.
  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
  end if;

  -- Ventas: pagos → CASCADE
  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_ventas);
  end if;

  -- Pedidos: pagos → CASCADE; adjuntos → CASCADE
  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_pedidos);
  end if;

  -- Clientes: oportunidades → CASCADE; historial → CASCADE; recordatorios → CASCADE
  --          cotizaciones.cliente_id → SET NULL; ventas.cliente_id → SET NULL
  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_clientes);
  end if;

  -- ── 6. UPSERT CATÁLOGO ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_servicios', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
    values (
      v_neg_id, v_it ->> 'id', 'servicios',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
      v_it ->> 'descripcion', v_it ->> 'condiciones'
    )
    on conflict (negocio_id, modo, cleo_id) do update set
      nombre      = excluded.nombre,
      precio      = excluded.precio,
      descripcion = excluded.descripcion,
      condiciones = excluded.condiciones;
  end loop;

  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
      v_it ->> 'descripcion', v_it ->> 'condiciones'
    )
    on conflict (negocio_id, modo, cleo_id) do update set
      nombre      = excluded.nombre,
      precio      = excluded.precio,
      descripcion = excluded.descripcion,
      condiciones = excluded.condiciones;
  end loop;

  -- ── 7. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes', '[]'))
  loop
    -- Saltar si está tombstoneado en este mismo flush
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    insert into public.clientes (
      negocio_id, cleo_id,
      nombre, empresa, telefono, email, instagram, messenger, canal,
      origen, etapa, fecha_etapa, estado_prospecto,
      motivo_perdida, razon_cierre, ultimo_contacto,
      notas, etiqueta, nota_recontacto,
      fecha_pedido, servicio_interes, items_interes,
      mensaje_seguimiento, seguimiento_custom,
      seguimiento_fecha, mensaje_seguimiento_postventa,
      created_at
    )
    values (
      v_neg_id, v_it ->> 'id',
      coalesce(v_it ->> 'nombre',''), v_it ->> 'negocio',
      v_it ->> 'contacto', v_it ->> 'email',
      v_it ->> 'instagram', v_it ->> 'messenger',
      v_it ->> 'canalPrincipal',
      v_it ->> 'origen', v_it ->> 'etapa',
      nullif(v_it ->> 'fechaEtapa','')::date,
      v_it ->> 'estadoProspecto',
      v_it ->> 'motivoPerdida',
      case when v_it -> 'razonCierre' is not null and v_it -> 'razonCierre' <> 'null'::jsonb
           then array(select jsonb_array_elements_text(v_it -> 'razonCierre'))
           else null end,
      nullif(v_it ->> 'ultimoContacto','')::date,
      v_it ->> 'notas', v_it ->> 'etiqueta',
      v_it ->> 'notaRecontacto',
      nullif(v_it ->> 'fechaPedido','')::date,
      v_it ->> 'servicioInteres', v_it -> 'itemsInteres',
      v_it ->> 'mensajeSeguimiento',
      coalesce((v_it ->> 'seguimientoCustom')::boolean, false),
      nullif(v_it ->> 'seguimientoFecha','')::date,
      v_it ->> 'mensajeSeguimientoPostVenta',
      coalesce(nullif(v_it ->> 'fecha','')::timestamptz, now())
    )
    on conflict (negocio_id, cleo_id) do update set
      nombre                       = excluded.nombre,
      empresa                      = excluded.empresa,
      telefono                     = excluded.telefono,
      email                        = excluded.email,
      instagram                    = excluded.instagram,
      messenger                    = excluded.messenger,
      canal                        = excluded.canal,
      origen                       = excluded.origen,
      etapa                        = excluded.etapa,
      fecha_etapa                  = excluded.fecha_etapa,
      estado_prospecto             = excluded.estado_prospecto,
      motivo_perdida               = excluded.motivo_perdida,
      razon_cierre                 = excluded.razon_cierre,
      ultimo_contacto              = excluded.ultimo_contacto,
      notas                        = excluded.notas,
      etiqueta                     = excluded.etiqueta,
      nota_recontacto              = excluded.nota_recontacto,
      fecha_pedido                 = excluded.fecha_pedido,
      servicio_interes             = excluded.servicio_interes,
      items_interes                = excluded.items_interes,
      mensaje_seguimiento          = excluded.mensaje_seguimiento,
      seguimiento_custom           = excluded.seguimiento_custom,
      seguimiento_fecha            = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
      -- NOT updated: created_at (preservar fecha original)
  end loop;

  -- ── 8. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;

    -- Resolver cliente por cleo_id (SIEMPRE por (negocio_id, cleo_id), nunca UUID directo)
    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id
       and c.cleo_id    = (v_it ->> 'clienteId');

    if v_uuid is null then
      raise notice 'OPORTUNIDADES: cliente cleo_id=% no encontrado, saltando op %.',
        v_it ->> 'clienteId', v_it ->> 'id';
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
      coalesce(v_it ->> 'modo', 'servicios'),
      coalesce(v_it ->> 'titulo',''),
      coalesce(v_it ->> 'estatus','activa'),
      coalesce(v_it ->> 'etapa','nuevo_contacto'),
      nullif(v_it ->> 'precioInteres','')::numeric,
      v_it ->> 'motivoCierre',
      coalesce(nullif(v_it ->> 'fecha','')::date, current_date),
      nullif(v_it ->> 'fechaEtapa','')::date,
      nullif(v_it ->> 'ultimoContacto','')::date,
      nullif(v_it ->> 'fechaCierre','')::date,
      coalesce(v_it ->> 'origenMigracion','nueva')
    )
    on conflict (negocio_id, cleo_id) do update set
      titulo          = excluded.titulo,
      estatus         = excluded.estatus,
      etapa           = excluded.etapa,
      precio_interes  = excluded.precio_interes,
      motivo_cierre   = excluded.motivo_cierre,
      fecha_etapa     = excluded.fecha_etapa,
      ultimo_contacto = excluded.ultimo_contacto,
      fecha_cierre    = excluded.fecha_cierre;
      -- NOT updated: cliente_id, modo, origen_migracion, fecha (inmutables post-creación)
  end loop;

  -- ── 9. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    -- Resolver oportunidad (siempre por cleo_id dentro del mismo negocio)
    v_uuid2 := null;
    declare
      v_es_indep boolean;
      v_op_cleo  text;
    begin
      v_es_indep := (v_it ->> 'vinculadaOportunidadActual') = 'false'
                    or (v_it -> 'vinculadaOportunidadActual') = 'false'::jsonb;
      v_op_cleo  := case when v_es_indep
                      then 'op_cotindep_' || (v_it ->> 'id')
                      else 'op_cli_'      || (v_it ->> 'clienteId')
                    end;
      select o.id into v_uuid2
        from public.oportunidades o
       where o.negocio_id = v_neg_id and o.cleo_id = v_op_cleo;
    end;

    begin
      insert into public.cotizaciones (
        negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
        items, subtotal, monto, descuento, tipo_descuento,
        anticipo, fecha_anticipo, vigencia, vigencia_dias, tipo_pago,
        sv_condiciones, sv_condiciones_html, notas, etiqueta,
        estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
        fecha_rechazo, fecha_hora_rechazo,
        items_aceptacion, monto_aceptacion,
        postv_pago, postv_seguimiento,
        seguimiento_fecha, motivo_perdida, entregado, fecha_entrega
      )
      values (
        v_neg_id, v_it ->> 'id', v_uuid, v_uuid2, v_uuid2 is not null,
        coalesce(v_it -> 'items','[]'), coalesce((v_it ->> 'subtotal')::numeric,0),
        coalesce((v_it ->> 'monto')::numeric,0),
        coalesce(nullif(v_it ->> 'descuento','')::numeric,0),
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto')
             then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''),
        nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''),   nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date,
        nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date,
        nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        (v_it -> 'configPostVenta') ->> 'pago',
        (v_it -> 'configPostVenta') ->> 'seguimiento',
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do update set
        cliente_id          = excluded.cliente_id,
        items               = excluded.items,
        subtotal            = excluded.subtotal,
        monto               = excluded.monto,
        descuento           = excluded.descuento,
        tipo_descuento      = excluded.tipo_descuento,
        anticipo            = excluded.anticipo,
        fecha_anticipo      = excluded.fecha_anticipo,
        vigencia            = excluded.vigencia,
        vigencia_dias       = excluded.vigencia_dias,
        tipo_pago           = excluded.tipo_pago,
        sv_condiciones      = excluded.sv_condiciones,
        sv_condiciones_html = excluded.sv_condiciones_html,
        notas               = excluded.notas,
        etiqueta            = excluded.etiqueta,
        estatus             = excluded.estatus,
        fecha               = excluded.fecha,
        fecha_envio         = excluded.fecha_envio,
        fecha_cierre        = excluded.fecha_cierre,
        fecha_hora_cierre   = excluded.fecha_hora_cierre,
        fecha_rechazo       = excluded.fecha_rechazo,
        fecha_hora_rechazo  = excluded.fecha_hora_rechazo,
        postv_pago          = excluded.postv_pago,
        postv_seguimiento   = excluded.postv_seguimiento,
        seguimiento_fecha   = excluded.seguimiento_fecha,
        motivo_perdida      = excluded.motivo_perdida,
        entregado           = excluded.entregado,
        fecha_entrega       = excluded.fecha_entrega;
        -- NOT updated: items_aceptacion, monto_aceptacion, versiones_aceptacion (snapshots inmutables)
        -- NOT updated: oportunidad_id (una vez vinculada, la relación no se mueve)

    exception when unique_violation then
      -- uq_cot_oportunidad: oportunidad ya vinculada a otra cotización
      raise notice 'COTIZACION %: oportunidad % ya vinculada, guardada sin oportunidad_id.',
        v_it ->> 'id', v_uuid2;
      insert into public.cotizaciones (
        negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
        items, subtotal, monto, descuento, tipo_descuento,
        anticipo, fecha_anticipo, vigencia, vigencia_dias, tipo_pago,
        sv_condiciones, sv_condiciones_html, notas, etiqueta,
        estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
        fecha_rechazo, fecha_hora_rechazo,
        items_aceptacion, monto_aceptacion,
        postv_pago, postv_seguimiento,
        seguimiento_fecha, motivo_perdida, entregado, fecha_entrega
      )
      values (
        v_neg_id, v_it ->> 'id', v_uuid, null, false,
        coalesce(v_it -> 'items','[]'), coalesce((v_it ->> 'subtotal')::numeric,0),
        coalesce((v_it ->> 'monto')::numeric,0),
        coalesce(nullif(v_it ->> 'descuento','')::numeric,0),
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto')
             then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''),
        nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''), nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date,
        nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date,
        nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        (v_it -> 'configPostVenta') ->> 'pago',
        (v_it -> 'configPostVenta') ->> 'seguimiento',
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

    -- Pagos de la cotización
    select ct.id into v_uuid
      from public.cotizaciones ct
     where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha, concepto)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto'
        )
        on conflict (negocio_id, cleo_id) do update set
          monto    = excluded.monto,
          fecha    = excluded.fecha,
          concepto = excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 10. UPSERT VENTAS + PAGOS ─────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_ventas', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_ventas) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    insert into public.ventas (
      negocio_id, cleo_id, cliente_id,
      concepto, items, monto, tipo, notas, etiqueta, fecha,
      tipo_pago, entregado, fecha_entrega,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id, v_it ->> 'id', v_uuid,
      v_it ->> 'concepto', coalesce(v_it -> 'items','[]'),
      coalesce((v_it ->> 'monto')::numeric,0),
      case when v_it ->> 'tipo' = 'especifico' then 'normal' else 'rapida' end,
      v_it ->> 'notas', v_it ->> 'etiqueta',
      nullif(v_it ->> 'fecha','')::date,
      v_it ->> 'tipoPago',
      coalesce((v_it ->> 'entregado')::boolean, false),
      nullif(v_it ->> 'fechaEntrega','')::date,
      (v_it -> 'configPostVenta') ->> 'pago',
      (v_it -> 'configPostVenta') ->> 'seguimiento'
    )
    on conflict (negocio_id, cleo_id) do update set
      cliente_id        = excluded.cliente_id,
      concepto          = excluded.concepto,
      items             = excluded.items,
      monto             = excluded.monto,
      tipo              = excluded.tipo,
      notas             = excluded.notas,
      etiqueta          = excluded.etiqueta,
      fecha             = excluded.fecha,
      tipo_pago         = excluded.tipo_pago,
      entregado         = excluded.entregado,
      fecha_entrega     = excluded.fecha_entrega,
      postv_pago        = excluded.postv_pago,
      postv_seguimiento = excluded.postv_seguimiento;

    select vt.id into v_uuid
      from public.ventas vt
     where vt.negocio_id = v_neg_id and vt.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, venta_id, monto, fecha, concepto)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto'
        )
        on conflict (negocio_id, cleo_id) do update set
          monto    = excluded.monto,
          fecha    = excluded.fecha,
          concepto = excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 11. UPSERT PEDIDOS + PAGOS ────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_pedidos', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_pedidos) then continue; end if;

    declare
      v_cli_id  uuid;
      v_cot_id  uuid;
      v_op_id   uuid;
    begin
      select c.id into v_cli_id from public.clientes c
       where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');
      select ct.id into v_cot_id from public.cotizaciones ct
       where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'cotizacionId');
      select o.id into v_op_id from public.oportunidades o
       where o.negocio_id = v_neg_id and o.cleo_id = 'op_cli_' || (v_it ->> 'clienteId');

      insert into public.pedidos (
        negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
        origen_venta, items, productos, cantidad, monto_total,
        notas, etiqueta, estado_pedido, fecha, fecha_entrega, fecha_cancelacion,
        anticipo_conservado, motivo_cancelacion, motivo_cancelacion_lado,
        items_confirmacion, monto_confirmacion,
        postv_pago, postv_seguimiento
      )
      values (
        v_neg_id, v_it ->> 'id', v_cli_id, v_cot_id, v_op_id,
        coalesce(v_it ->> 'origenVenta','registro_manual'),
        coalesce(v_it -> 'items','[]'), v_it ->> 'productos',
        coalesce((v_it ->> 'cantidad')::int,0),
        coalesce((v_it ->> 'total')::numeric,0),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estadoPedido','preparando'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEntrega','')::date,
        nullif(v_it ->> 'fechaCancelacion','')::date,
        (v_it ->> 'anticipoConservado')::boolean,
        v_it ->> 'motivoCancelacion',
        case when v_it ->> 'motivoCancelacionLado' in ('cliente','negocio')
             then v_it ->> 'motivoCancelacionLado' else null end,
        v_it -> 'itemsConfirmacion',
        (v_it ->> 'montoConfirmacion')::numeric,
        (v_it -> 'configPostVenta') ->> 'pago',
        (v_it -> 'configPostVenta') ->> 'seguimiento'
      )
      on conflict (negocio_id, cleo_id) do update set
        cliente_id               = excluded.cliente_id,
        cotizacion_id            = excluded.cotizacion_id,
        origen_venta             = excluded.origen_venta,
        items                    = excluded.items,
        productos                = excluded.productos,
        cantidad                 = excluded.cantidad,
        monto_total              = excluded.monto_total,
        notas                    = excluded.notas,
        etiqueta                 = excluded.etiqueta,
        estado_pedido            = excluded.estado_pedido,
        fecha                    = excluded.fecha,
        fecha_entrega            = excluded.fecha_entrega,
        fecha_cancelacion        = excluded.fecha_cancelacion,
        anticipo_conservado      = excluded.anticipo_conservado,
        motivo_cancelacion       = excluded.motivo_cancelacion,
        motivo_cancelacion_lado  = excluded.motivo_cancelacion_lado,
        postv_pago               = excluded.postv_pago,
        postv_seguimiento        = excluded.postv_seguimiento;
        -- NOT updated: items_confirmacion, monto_confirmacion, versiones_confirmacion (snapshots)
    end;

    select pd.id into v_uuid
      from public.pedidos pd
     where pd.negocio_id = v_neg_id and pd.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, pedido_id, monto, fecha, concepto)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto'
        )
        on conflict (negocio_id, cleo_id) do update set
          monto    = excluded.monto,
          fecha    = excluded.fecha,
          concepto = excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 12. UPSERT RECORDATORIOS ──────────────────────────────────────────────
  -- Iterar por cliente → recordatorios para tener el clienteId disponible.
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');

    if v_uuid is null then continue; end if;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'recordatorios','[]'))
    loop
      declare
        v_rec_cleo_id text;
        v_rec_cat     text;
        v_op_r_uuid   uuid;
      begin
        v_rec_cleo_id := v_sub ->> 'id';
        -- Saltar si tombstoneado
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then
          continue;
        end if;

        -- Categoría: respetar la explícita; desconocida → sin_clasificar
        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then
          v_rec_cat := 'sin_clasificar';
        end if;

        -- Oportunidad (solo si el recordatorio la referencia explícitamente)
        v_op_r_uuid := null;
        if (v_sub ->> 'oportunidadId') is not null then
          select o.id into v_op_r_uuid
            from public.oportunidades o
           where o.negocio_id = v_neg_id and o.cleo_id = (v_sub ->> 'oportunidadId');
        end if;

        insert into public.recordatorios (
          negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
          categoria, texto, fecha,
          completado, estatus, es_personalizada, origen
        )
        values (
          v_neg_id, v_rec_cleo_id, v_uuid, v_op_r_uuid, v_op_r_uuid is not null,
          v_rec_cat,
          v_sub ->> 'nota',
          nullif(v_sub ->> 'fecha','')::date,
          coalesce((v_sub ->> 'completado')::boolean, false),
          coalesce(v_sub ->> 'estatus','pendiente'),
          coalesce((v_sub ->> 'esPersonalizada')::boolean, false),
          v_sub ->> 'origen'
        )
        on conflict (negocio_id, cleo_id)
          where cleo_id is not null
        do update set
          oportunidad_id       = excluded.oportunidad_id,
          oportunidad_vinculada = excluded.oportunidad_vinculada,
          categoria            = excluded.categoria,
          texto                = excluded.texto,
          fecha                = excluded.fecha,
          completado           = excluded.completado,
          estatus              = excluded.estatus,
          es_personalizada     = excluded.es_personalizada,
          origen               = excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 13. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
  -- Si cleo_id ya existe: comparar contenido.
  -- Mismo contenido → skip (idempotente).
  -- Contenido distinto → reportar en historial_conflictos, NO sobrescribir.
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');

    if v_uuid is null then continue; end if;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'historialContactos','[]'))
    loop
      declare
        v_h_cleo_id text;
        v_h_tipo    text;
      begin
        v_h_cleo_id := v_sub ->> 'id';
        v_h_tipo    := v_sub ->> 'tipo';

        if v_h_cleo_id is null then
          -- Registros sin id no se pueden deduplicar; insertar siempre
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora,
            resultado, items, monto, resumen
          )
          values (
            v_neg_id, v_uuid, null, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date,
            nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items',
            (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
          continue;
        end if;

        -- Ver si ya existe
        select h.tipo, h.resultado, h.monto into v_hist_existente
          from public.historial_contactos h
         where h.negocio_id = v_neg_id
           and h.cleo_id    = v_h_cleo_id
         limit 1;

        if not found then
          -- Nuevo evento: insertar
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora,
            resultado, items, monto, resumen
          )
          values (
            v_neg_id, v_uuid, v_h_cleo_id, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date,
            nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items',
            (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
        else
          -- Ya existe: ¿mismo contenido?
          if v_hist_existente.tipo       is distinct from v_h_tipo
          or v_hist_existente.resultado  is distinct from (v_sub ->> 'resultado')
          or v_hist_existente.monto      is distinct from (v_sub ->> 'monto')::numeric
          then
            -- Contenido distinto: reportar conflicto, NO sobrescribir
            v_hist_conflictos := v_hist_conflictos || jsonb_build_array(
              jsonb_build_object(
                'cleo_id',     v_h_cleo_id,
                'tipo_nuevo',  v_h_tipo,
                'tipo_guardado', v_hist_existente.tipo,
                'mensaje', 'historial_contactos inmutable: contenido distinto para el mismo id'
              )
            );
          end if;
          -- Si mismo contenido: skip (idempotente)
        end if;
      end;
    end loop;
  end loop;

  -- ── 14. UPSERT ARCHIVO_ADJUNTOS ───────────────────────────────────────────
  -- Excluye storage_paths tombstoneados.
  -- WHERE NOT EXISTS (sin cleo_id: usa (negocio_id, cotizacion_id/pedido_id, storage_path)).
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    declare v_adj jsonb; begin
      v_adj := v_it -> 'archivoAdjunto';
      if v_adj is null or v_adj = 'null'::jsonb then continue; end if;
      if coalesce(v_adj ->> 'storagePath', v_adj ->> 'path','') = '' then continue; end if;
      if (coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')) = any(v_del_adjuntos) then continue; end if;

      select ct.id into v_uuid from public.cotizaciones ct
       where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'id');
      if v_uuid is null then continue; end if;

      insert into public.archivo_adjuntos (
        negocio_id, cotizacion_id, storage_path, nombre_original, mime_type, size_bytes, version
      )
      select v_neg_id, v_uuid,
        coalesce(v_adj ->> 'storagePath', v_adj ->> 'path'),
        v_adj ->> 'nombreOriginal', v_adj ->> 'mimeType',
        coalesce((v_adj ->> 'sizeBytes')::int,(v_adj ->> 'size')::int),
        coalesce((v_adj ->> 'version')::int, 1)
      where not exists (
        select 1 from public.archivo_adjuntos aa
         where aa.negocio_id    = v_neg_id
           and aa.cotizacion_id = v_uuid
           and aa.storage_path  = coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')
      );
    end;
  end loop;

  -- ── 14b. ACTUALIZAR PERFIL EN NEGOCIOS ───────────────────────────────────
  -- cleo_dual_read() lee color y otros campos del perfil directamente desde
  -- las columnas de negocios. Sin este UPDATE, los cambios al perfil guardados
  -- en el blob no se reflejarían en la siguiente lectura por cleo_dual_read().
  -- Regla: coalesce(nuevo, existente) — solo sobreescribe cuando el blob trae
  -- un valor no vacío; no borra valores previamente guardados.
  update public.negocios set
    nombre          = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'nombre', ''),           nombre),
    nombre_contacto = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'tuNombre', ''),         nombre_contacto),
    telefono        = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'telefono', ''),         telefono),
    email           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'email', ''),            email),
    color           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'color', ''),            color),
    color_sec       = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'colorSecundario', ''),  color_sec),
    banco           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'banco', ''),            banco),
    cuenta          = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancoaccount', ''),     cuenta),
    clabe           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancoclabe', ''),       clabe),
    titular         = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancotitular', ''),     titular),
    config          = coalesce(config, '{}'::jsonb) ||
                      jsonb_strip_nulls(jsonb_build_object(
                        'colorTexto',         nullif(p_data -> 'cleo_perfil' ->> 'colorTexto', ''),
                        'logo',               nullif(p_data -> 'cleo_perfil' ->> 'logo', ''),
                        'mensaje',            nullif(p_data -> 'cleo_perfil' ->> 'mensaje', ''),
                        'condicionesPago',    nullif(p_data -> 'cleo_perfil' ->> 'condicionesPago', ''),
                        'redesTT',            nullif(p_data -> 'cleo_perfil' ->> 'redesTT', ''),
                        'redesIG',            nullif(p_data -> 'cleo_perfil' ->> 'redesIG', ''),
                        'redesFB',            nullif(p_data -> 'cleo_perfil' ->> 'redesFB', ''),
                        'bancotarjeta',       nullif(p_data -> 'cleo_perfil' ->> 'bancotarjeta', ''),
                        'bancoinstrucciones', nullif(p_data -> 'cleo_perfil' ->> 'bancoinstrucciones', ''),
                        'direccion',          nullif(p_data -> 'cleo_perfil' ->> 'direccion', '')
                      ))
  where id = v_neg_id;

  -- ── 15. ACTUALIZAR user_data ──────────────────────────────────────────────
  -- Después de escribir las tablas, actualizar user_data con el blob recibido
  -- más la versión limpia de tombstones (= []).
  -- El updated_at es asignado por el servidor (trigger set_updated_at_user_data).
  declare v_clean_data jsonb; begin
    v_clean_data := p_data || jsonb_build_object('cleo_tombstones', '[]'::jsonb);
    if v_ud_exists then
      update public.user_data
         set data        = v_clean_data,
             tipo_perfil = p_tipo_perfil
       where user_id     = v_uid
      returning updated_at into v_new_updated_at;
    else
      insert into public.user_data (user_id, data, tipo_perfil)
      values (v_uid, v_clean_data, p_tipo_perfil)
      on conflict (user_id) do update
        set data        = excluded.data,
            tipo_perfil = excluded.tipo_perfil
      returning updated_at into v_new_updated_at;
    end if;
  end;

  -- ── 16. RETORNAR ─────────────────────────────────────────────────────────
  return jsonb_build_object(
    'estado',              'ok',
    'updated_at',          v_new_updated_at,
    'historial_conflictos', v_hist_conflictos
  );

exception when others then
  -- Re-raise: hace ROLLBACK automático de toda la transacción.
  raise;

end;
$func$;


-- ══════════════════════════════════════════════════════════════════════════════
-- E. PERMISOS
-- ══════════════════════════════════════════════════════════════════════════════

-- Revocar de public antes de conceder al rol correcto
revoke execute on function public.cleo_dual_flush(jsonb, text, timestamptz) from public;
revoke execute on function public.cleo_dual_read() from public;
revoke execute on function public.cleo_id_to_json(text) from public;

grant execute on function public.cleo_dual_flush(jsonb, text, timestamptz) to authenticated;
grant execute on function public.cleo_dual_read() to authenticated;
-- cleo_id_to_json es interna; no se expone a ningún rol de cliente
