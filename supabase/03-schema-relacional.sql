-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- BORRADOR — revisar y aprobar antes de ejecutar.
-- Ejecutar DESPUÉS de 01-pruebas-guardado.sql.
-- Políticas de Storage en 04-storage-policies.sql (ejecutar después).
-- Para revertir: 06-rollback-schema-relacional.sql.
--
-- MAPA DE CLAVES localStorage → ESQUEMA RELACIONAL
-- ──────────────────────────────────────────────────
-- cleo_perfil          → negocios (nombre, telefono, email, banco, clabe,
--                         cuenta, titular, color, color_sec, tipo_perfil,
--                         nombre_contacto, moneda, productos text[],
--                         config jsonb, datos_ui jsonb)
-- cleo_tipo_perfil     → negocios.tipo_perfil
-- cleo_clientes        → clientes + historial_contactos + recordatorios
-- cleo_clientes (estadoProspecto / etapa) → oportunidades (modo='productos' / 'servicios')
-- cleo_cots            → cotizaciones (items, pagos[] → pagos)
-- cleo_pedidos         → pedidos (items, pagos[] → pagos)
-- cleo_ventas          → ventas (items, pagos[] → pagos)
-- cleo_servicios       → catalogo_items (modo='servicios')
-- cleo_productos_cat   → catalogo_items (modo='productos')
-- cleo_productos       → negocios.productos text[]  (string[] autocomplete)
-- cleo_alertas_cerradas→ negocios.datos_ui jsonb
-- cleo_etapas_vistas   → negocios.datos_ui jsonb
-- cleo_streak_accion_* → negocios.datos_ui jsonb
-- cleo_data_version    → no migrada (marcador de versión de app, no dato de negocio)
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.user_data') is null then
    raise exception 'Corre 01-pruebas-guardado.sql primero.';
  end if;
  if to_regclass('public.negocios') is not null then
    raise exception
      'El esquema relacional ya existe. '
      'Verifica que estés en CLEO Pruebas (pconfadsbtwjbjeblxgl) y no en producción.';
  end if;
end;
$guard$;

begin;

-- ── Rol de servicio para operaciones de reapertura controlada ─────────────────
-- cleo_service es el propietario explícito de las funciones SECURITY DEFINER
-- de reapertura.  Los triggers comprueban current_user = 'cleo_service'.
-- Este patrón evita depender de is_superuser, que en Supabase alojado no
-- está disponible para el rol postgres (no tiene el atributo SUPERUSER).
-- cleo_service no puede iniciar sesión y solo tiene los permisos mínimos
-- necesarios para ejecutar las operaciones de reapertura.
create role cleo_service nologin;
-- postgres necesita membresía en cleo_service para ejecutar
-- ALTER FUNCTION ... OWNER TO cleo_service. En Supabase, postgres no es
-- superusuario real y sin este GRANT la transferencia falla con
-- "must be member of role". No amplía permisos de authenticated: PostgREST
-- conecta como authenticator→authenticated, nunca como postgres.
grant cleo_service to postgres;
-- ALTER FUNCTION ... OWNER TO <rol> requiere que el nuevo rol propietario
-- tenga CREATE en el esquema donde vive la función (PG docs). En runtime,
-- las funciones SECURITY DEFINER de cleo_service solo hacen SELECT/UPDATE;
-- CREATE no amplía el acceso efectivo más allá de lo planificado.
grant create on schema public to cleo_service;


-- ── Trigger reutilizable: updated_at ──────────────────────────────────────────
create function public.cleo_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.cleo_set_updated_at() from public;


-- ══════════════════════════════════════════════════════════════════════════════
-- NEGOCIOS
-- ══════════════════════════════════════════════════════════════════════════════
create table public.negocios (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null unique references auth.users(id) on delete cascade,

  -- Campos usados en queries o que determinan el comportamiento del sync
  nombre          text        not null default '',
  nombre_contacto text,               -- perfil.tuNombre
  tipo_perfil     text        not null default 'servicios'
                              check (tipo_perfil in ('productos','servicios')),
  telefono        text,
  email           text,
  color           text,
  color_sec       text,               -- perfil.colorSecundario
  banco           text,
  cuenta          text,               -- perfil.bancoaccount
  clabe           text,               -- perfil.bancoclabe
  titular         text,               -- perfil.bancotitular
  moneda          text        not null default 'MXN',

  -- Nombres de productos/servicios como strings para autocompletado rápido.
  -- Mapea cleo_productos (string[]).
  productos       text[]      not null default '{}',

  -- Campos de visualización y marca que no se usan en queries:
  -- color_texto, logo, mensaje, condiciones_pago, redes_tt/ig/fb,
  -- bancotarjeta, bancoinstrucciones, direccion, condiciones.
  config          jsonb       not null default '{}',

  -- Estado de la UI que no pertenece a entidades de negocio:
  -- alertas_cerradas[], etapas_vistas[],
  -- streak_prod {tipo,dias,fecha}, streak_serv {tipo,dias,fecha}.
  datos_ui        jsonb       not null default '{}',

  -- Versión del modelo de datos activo para este negocio.
  -- PROTEGIDO: authenticated solo puede crear con 'blob'.
  -- Solo service_role puede avanzarlo a 'dual' o 'relacional'.
  schema_ver      text        not null default 'blob'
                              check (schema_ver in ('blob','dual','relacional')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Trigger: protege campos reservados (INSERT y UPDATE) ──────────────────────
create function public.cleo_guard_negocios_reserved()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    -- En INSERT, authenticated solo puede crear negocios con schema_ver = 'blob'.
    if current_user = 'authenticated' and new.schema_ver <> 'blob' then
      raise exception
        'schema_ver: debe ser ''blob'' al crear un negocio desde la app. '
        'Valor recibido: ''%''', new.schema_ver;
    end if;
    return new;
  end if;

  -- UPDATE: user_id es inmutable.
  if old.user_id is distinct from new.user_id then
    raise exception 'user_id: campo inmutable en negocios';
  end if;
  -- UPDATE: schema_ver solo lo puede avanzar el proceso de migración (service_role).
  if old.schema_ver is distinct from new.schema_ver
     and current_user = 'authenticated' then
    raise exception
      'schema_ver: campo reservado para el proceso de migración. '
      'Valor actual: ''%''. Solo puede modificarse desde el proceso de migración autorizado.',
      old.schema_ver;
  end if;
  return new;
end;
$$;
revoke all on function public.cleo_guard_negocios_reserved() from public;

create trigger trg_negocios_reserved
  before insert or update on public.negocios
  for each row execute function public.cleo_guard_negocios_reserved();

create trigger trg_negocios_updated_at
  before update on public.negocios
  for each row execute function public.cleo_set_updated_at();

alter table public.negocios enable row level security;
revoke all on table public.negocios from anon, authenticated;
grant select, insert, update on table public.negocios to authenticated;

create policy "negocio propio"
  on public.negocios for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ── Helper RLS: devuelve negocio_id del usuario autenticado ──────────────────
-- Se crea después de negocios porque hace SELECT sobre esa tabla.
-- Todas las demás políticas RLS lo usan para aislar por negocio.
create function public.auth_negocio_id()
returns uuid language sql stable security definer
set search_path = '' as $$
  select id from public.negocios where user_id = (select auth.uid())
$$;
revoke all on function public.auth_negocio_id() from public;
grant execute on function public.auth_negocio_id() to authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- CLIENTES
-- Fuente: cleo_clientes[]
-- Historial y recordatorios van a sus propias tablas.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.clientes (
  id                  uuid        primary key default gen_random_uuid(),
  negocio_id          uuid        not null references public.negocios(id) on delete cascade,
  cleo_id             text        not null,          -- id numérico original (Date.now())

  -- Datos de contacto
  nombre              text        not null default '',
  empresa             text,                          -- campo 'negocio' en formVacio
  telefono            text,                          -- campo 'contacto' en formVacio
  email               text,
  instagram           text,
  messenger           text,
  canal               text,                          -- canalPrincipal: 'WhatsApp','Instagram',...

  -- Clasificación CRM
  origen              text,                          -- ORIGENES: 'Instagram','Referido',...
  etapa               text,                          -- ETAPAS pipeline
  fecha_etapa         date,                          -- cuándo cambió de etapa
  estado_prospecto    text,                          -- 'Nueva','Convertido','Sin respuesta','Perdido','En seguimiento'
  motivo_perdida      text,
  razon_cierre        text[],                        -- ['Confianza','Seguimiento',...]
  ultimo_contacto     date,

  -- Notas y seguimiento
  notas               text,
  etiqueta            text,
  nota_recontacto     text,
  fecha_pedido        date,                          -- fecha esperada del pedido
  servicio_interes    text,
  items_interes       jsonb,                         -- [{id,catalogoId,nombre,cantidad,precioUnitario,total}]
  mensaje_seguimiento text,
  seguimiento_custom  boolean     not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  -- Restricción extra para que las FKs compuestas desde cotizaciones, pedidos,
  -- ventas, historial y recordatorios puedan referenciar (id, negocio_id),
  -- garantizando a nivel de constraint que la relación pertenece al mismo negocio.
  unique (id, negocio_id)
);

create index idx_clientes_negocio on public.clientes (negocio_id);
create index idx_clientes_etapa   on public.clientes (negocio_id, etapa);

create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function public.cleo_set_updated_at();

alter table public.clientes enable row level security;
revoke all on table public.clientes from anon, authenticated;
grant select, insert, update, delete on table public.clientes to authenticated;

create policy "clientes del negocio"
  on public.clientes for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- OPORTUNIDADES
-- Entidad comercial independiente por cliente. Un cliente puede tener varias
-- oportunidades activas simultáneas; cada una tiene su propio estado,
-- seguimiento y datos de interés.
--
-- FASES DE MIGRACIÓN (schema_ver en negocios)
-- ─────────────────────────────────────────────────────────────────────────────
-- blob:       tabla vacía; clientes.etapa / estadoProspecto son la fuente de
--             verdad. Los campos oportunidad_id en cotizaciones, pedidos y
--             recordatorios son NULL.
-- dual:       oportunidades es la fuente de verdad para entidades nuevas.
--             Los campos legacy del cliente se actualizan como eco (cloudSync).
--             No deben coexistir versiones contradictorias del mismo estado.
-- relacional: oportunidades es la única fuente de verdad. Los campos legacy
--             del cliente (etapa, estadoProspecto, productoInteres, etc.)
--             se ignoran en toda lógica nueva; se conservan solo para lectura
--             de datos anteriores a la migración.
--
-- DEDUPLICACIÓN EN HOY
-- ─────────────────────────────────────────────────────────────────────────────
-- La identidad de una tarjeta en Hoy es el seguimiento (recordatorio), no la
-- oportunidad. Un seguimiento pendiente = una tarjeta. Si una oportunidad
-- tiene dos seguimientos vencidos hoy, genera dos tarjetas; son acciones
-- distintas y el único duplicado a evitar es el mismo recordatorio.id dos
-- veces. Las sugerencias calculadas (sin seguimiento persistido detrás) se
-- suprimen cuando la oportunidad ya tiene al menos un seguimiento pendiente
-- para hoy o vencido, para no coexistir en paralelo con el real.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.oportunidades (
  id              uuid        primary key default gen_random_uuid(),
  negocio_id      uuid        not null references public.negocios(id) on delete cascade,
  cleo_id         text        not null,

  -- FK compuesta: cliente debe pertenecer al mismo negocio.
  -- CASCADE: si se borra el cliente, se borran sus oportunidades.
  cliente_id      uuid        not null,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id) on delete cascade
    deferrable initially deferred,

  -- Modo: determina qué valores de etapa son válidos (ver trigger).
  modo            text        not null check (modo in ('productos','servicios')),

  -- Título comercial (productoInteres / concepto del servicio / nombre libre)
  titulo          text        not null default '',

  -- Estado de ciclo de vida.
  -- estatus: dimensión abierto/cerrado.
  -- etapa:   detalle del pipeline, validado por trg_oportunidades_etapa_modo.
  --   Servicios activa  → nuevo_contacto | cotizacion_enviada | negociacion
  --   Servicios ganada  → ganado
  --   Servicios perdida/cancelada → perdido
  --   Productos activa  → nueva | en_seguimiento | sin_respuesta
  --   Productos ganada  → convertido
  --   Productos perdida/cancelada → perdido
  -- DEFAULT 'nueva' solo es válido para modo='productos'. Servicios debe
  -- especificar etapa explícitamente en cada INSERT.
  estatus         text        not null default 'activa'
                  check (estatus in ('activa','ganada','perdida','cancelada')),
  etapa           text        not null default 'nueva',

  -- Interés comercial
  -- Sustituye productoInteres / servicioInteres / precioInteres / cantidadInteres
  -- cuando schema_ver='dual' o 'relacional'.
  precio_interes             numeric,
  cantidad_interes           text,
  tipo_seguimiento_postventa text
                             check (tipo_seguimiento_postventa in ('15','30','60','90')),

  -- Cierre
  motivo_cierre   text,       -- motivoPerdida / motivo de cancelación
  nota_recontacto text,       -- notaRecontacto (oportunidades perdidas)

  -- Fechas de las que dependen las reglas de Hoy por oportunidad
  fecha           date        not null default current_date,
  fecha_etapa     date,       -- cuándo cambió etapa por última vez
  ultimo_contacto date,       -- base de diasSinContacto por oportunidad
  fecha_cierre    date,       -- cuándo se ganó / perdió / canceló

  -- Trazabilidad de migración
  -- nueva:             creada en el nuevo modelo, declarada por el usuario.
  -- migrada_vinculada: derivada de cotización con vinculadaOportunidadActual:true/undefined.
  --                    La agrupación puede ser inferida (ambigua); usar con cautela.
  -- migrada_cotindep:  derivada de cotización con vinculadaOportunidadActual:false (1:1).
  -- migrada_producto:  derivada de cliente.estadoProspecto (modo Productos, 1:1).
  origen_migracion text       check (origen_migracion in (
                                'nueva','migrada_vinculada','migrada_cotindep','migrada_producto')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  unique (id, negocio_id)     -- permite FKs compuestas desde cotizaciones, pedidos, recordatorios
);

create index idx_op_negocio on public.oportunidades (negocio_id);
create index idx_op_cliente on public.oportunidades (negocio_id, cliente_id);
create index idx_op_estatus on public.oportunidades (negocio_id, estatus);

-- ── Trigger: cliente_id, negocio_id y modo son inmutables ────────────────────
-- Una oportunidad no puede reasignarse a otro cliente ni a otro negocio.
-- modo también es inmutable: las etapas válidas y las entidades vinculadas
-- se crearon bajo ese modo y no pueden reinterpretarse retroactivamente.
create function public.cleo_guard_oportunidad_identidad()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.cliente_id is distinct from new.cliente_id then
    raise exception
      'oportunidad: cliente_id es inmutable después de la creación (cleo_id: %)', old.cleo_id;
  end if;
  if old.negocio_id is distinct from new.negocio_id then
    raise exception 'oportunidad: negocio_id es inmutable';
  end if;
  if old.modo is distinct from new.modo then
    raise exception
      'oportunidad: modo es inmutable después de la creación (cleo_id: %). '
      'Las etapas válidas y las entidades vinculadas dependen del modo original.', old.cleo_id;
  end if;
  return new;
end;
$$;
revoke all on function public.cleo_guard_oportunidad_identidad() from public;

create trigger trg_oportunidades_identidad
  before update on public.oportunidades
  for each row execute function public.cleo_guard_oportunidad_identidad();

-- ── Trigger: valida combinaciones modo × estatus × etapa ─────────────────────
-- Impide estados incoherentes (estatus='ganada' con etapa='nuevo_contacto') y
-- mezcla de etapas entre modos (etapa='nueva' en oportunidad de Servicios).
-- 'cancelada' es compatible con cualquier etapa del modo (la cancelación puede
-- ocurrir en cualquier punto del pipeline).
create function public.cleo_guard_oportunidad_etapa_modo()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Etapas exclusivas por modo: rechaza etapas del modo contrario.
  if new.modo = 'servicios' and new.etapa = any(
       array['nueva','en_seguimiento','sin_respuesta','convertido']) then
    raise exception
      'oportunidad: etapa ''%'' no es válida para modo ''servicios''', new.etapa;
  end if;
  if new.modo = 'productos' and new.etapa = any(
       array['nuevo_contacto','cotizacion_enviada','negociacion','ganado']) then
    raise exception
      'oportunidad: etapa ''%'' no es válida para modo ''productos''', new.etapa;
  end if;

  -- Servicios: combinaciones estatus ↔ etapa
  if new.modo = 'servicios' then
    if new.estatus = 'activa' and new.etapa not in (
         'nuevo_contacto','cotizacion_enviada','negociacion') then
      raise exception
        'oportunidad servicios: estatus ''activa'' requiere etapa en '
        '(nuevo_contacto, cotizacion_enviada, negociacion). Recibido: ''%''', new.etapa;
    end if;
    if new.estatus = 'ganada' and new.etapa <> 'ganado' then
      raise exception
        'oportunidad servicios: estatus ''ganada'' requiere etapa ''ganado''. '
        'Recibido: ''%''', new.etapa;
    end if;
    if new.estatus = 'perdida' and new.etapa <> 'perdido' then
      raise exception
        'oportunidad servicios: estatus ''perdida'' requiere etapa ''perdido''. '
        'Recibido: ''%''', new.etapa;
    end if;
  end if;

  -- Productos: combinaciones estatus ↔ etapa
  if new.modo = 'productos' then
    if new.estatus = 'activa' and new.etapa not in (
         'nueva','en_seguimiento','sin_respuesta') then
      raise exception
        'oportunidad productos: estatus ''activa'' requiere etapa en '
        '(nueva, en_seguimiento, sin_respuesta). Recibido: ''%''', new.etapa;
    end if;
    if new.estatus = 'ganada' and new.etapa <> 'convertido' then
      raise exception
        'oportunidad productos: estatus ''ganada'' requiere etapa ''convertido''. '
        'Recibido: ''%''', new.etapa;
    end if;
    if new.estatus = 'perdida' and new.etapa <> 'perdido' then
      raise exception
        'oportunidad productos: estatus ''perdida'' requiere etapa ''perdido''. '
        'Recibido: ''%''', new.etapa;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.cleo_guard_oportunidad_etapa_modo() from public;

create trigger trg_oportunidades_etapa_modo
  before insert or update on public.oportunidades
  for each row execute function public.cleo_guard_oportunidad_etapa_modo();

create trigger trg_oportunidades_updated_at
  before update on public.oportunidades
  for each row execute function public.cleo_set_updated_at();

alter table public.oportunidades enable row level security;
revoke all on table public.oportunidades from anon, authenticated;
grant select, insert, update, delete on table public.oportunidades to authenticated;

create policy "oportunidades del negocio"
  on public.oportunidades for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());

-- Los triggers de origen (cotizaciones/pedidos/recordatorios) consultan
-- oportunidades para verificar coherencia de cliente. Cuando se disparan
-- dentro de una función SECURITY DEFINER de cleo_service, current_user=
-- 'cleo_service' y RLS aplica; sin esta política la consulta no devuelve filas.
create policy "cleo_service: oportunidades"
  on public.oportunidades for all to cleo_service
  using (true) with check (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- COTIZACIONES
-- Fuente: cleo_cots[] — los pagos[] embebidos van a la tabla pagos.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.cotizaciones (
  id                  uuid        primary key default gen_random_uuid(),
  negocio_id          uuid        not null references public.negocios(id) on delete cascade,
  cleo_id             text        not null,

  -- FK compuesta: el cliente debe pertenecer al mismo negocio.
  -- SET NULL (cliente_id) al borrar el cliente: solo anula la referencia,
  -- el negocio_id de la cotización no cambia.
  cliente_id          uuid,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id)
    on delete set null (cliente_id)
    deferrable initially deferred,

  -- FK compuesta a la oportunidad (nullable).
  -- SET NULL (oportunidad_id) si la oportunidad se elimina: preserva la
  -- cotización como registro histórico sin oportunidad activa.
  -- Coherencia cliente ↔ oportunidad verificada por trg_cotizaciones_origen.
  oportunidad_id      uuid,
  foreign key (oportunidad_id, negocio_id)
    references public.oportunidades (id, negocio_id)
    on delete set null (oportunidad_id)
    deferrable initially deferred,
  -- true una vez que oportunidad_id fue asignado; persiste aunque la oportunidad
  -- se elimine (el CASCADE pone NULL pero no resetea este flag). El trigger de
  -- origen lo usa para bloquear A→NULL→B: tras un cascade null, oportunidad_id
  -- no puede reasignarse a otra oportunidad.
  oportunidad_vinculada boolean not null default false,

  -- Contenido del documento
  -- items[]: [{id,catalogoId,nombre,cantidad,precioUnitario,total,descripcion?,condiciones?}]
  -- Se mantiene como JSONB porque: (a) ningún reporte filtra/agrega por ítem
  -- individual; (b) cada ítem puede tener HTML embebido (descripcion/condiciones);
  -- (c) el formato legacy (concepto/cantidad/precioUnit) convive con items[].
  items               jsonb       not null default '[]',
  subtotal            numeric     not null default 0,   -- antes de descuento
  monto               numeric     not null default 0,   -- total final
  descuento           numeric     not null default 0,
  tipo_descuento      text        check (tipo_descuento in ('porcentaje','monto')),
  anticipo            numeric     not null default 0,   -- anticipo esperado (cotVacio.anticipo)
  fecha_anticipo      date,
  vigencia            text,
  vigencia_dias       int,
  tipo_pago           text,
  sv_condiciones      text,                             -- condiciones de servicio (Servicios)
  sv_condiciones_html text,
  notas               text,
  etiqueta            text,

  -- Ciclo de vida
  estatus             text        not null default 'Pendiente'
                                  check (estatus in ('Borrador','Pendiente','Enviada',
                                                     'Aceptada','Rechazada','Cancelada')),
  fecha               date,
  fecha_envio         date,
  fecha_cierre        date,
  fecha_hora_cierre   timestamptz,
  fecha_rechazo       date,
  fecha_hora_rechazo  timestamptz,

  -- Snapshots inmutables: se escriben al aceptar; el trigger los protege.
  -- Regla: NULL→valor OK (primera aceptación); valor→mismo_valor OK (no-op);
  -- valor→cualquier_cambio BLOQUEADO, incluido valor→NULL.
  -- Para reabrir usar cleo_reabrir_cotizacion(), que archiva el snapshot
  -- en versiones_aceptacion y define la transición de vuelta a 'Enviada'.
  items_aceptacion      jsonb,
  monto_aceptacion      numeric,
  versiones_aceptacion  jsonb    not null default '[]',

  -- Configuración postventa (se activa al aceptar)
  postv_pago          text        check (postv_pago in ('pendiente','resuelto')),
  postv_seguimiento   text        check (postv_seguimiento in ('pendiente','ok')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  unique (id, negocio_id)   -- permite FKs compuestas desde pagos, historial, adjuntos
);

-- ── Trigger: snapshots y historial de cotización son inmutables ──────────────
-- items_aceptacion, monto_aceptacion y versiones_aceptacion son inmutables
-- para todo rol que no sea cleo_service.
-- La única operación autorizada es cleo_reabrir_cotizacion() (SECURITY DEFINER
-- propiedad de cleo_service).  Cuando esa función ejecuta el UPDATE,
-- current_user = 'cleo_service' en el contexto del trigger.
-- authenticated no puede hacer SET ROLE cleo_service (cleo_service tiene NOLOGIN
-- y authenticated no tiene ese rol concedido).
create function public.cleo_guard_cotizacion_snapshots()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Operación proviene de cleo_reabrir_cotizacion() (SECURITY DEFINER como cleo_service).
  if current_user = 'cleo_service' then
    return new;
  end if;

  if old.items_aceptacion is not null
     and old.items_aceptacion is distinct from new.items_aceptacion then
    raise exception
      'items_aceptacion: inmutable para el rol % (cleo_id: %). '
      'Usa cleo_reabrir_cotizacion().', current_user, old.cleo_id;
  end if;
  if old.monto_aceptacion is not null
     and old.monto_aceptacion is distinct from new.monto_aceptacion then
    raise exception
      'monto_aceptacion: inmutable para el rol % (cleo_id: %).', current_user, old.cleo_id;
  end if;

  -- El historial es append-only.  Solo cleo_reabrir_cotizacion() puede escribirlo.
  if old.versiones_aceptacion is distinct from new.versiones_aceptacion then
    raise exception
      'versiones_aceptacion: de solo lectura para el rol %. '
      'El historial se actualiza únicamente desde cleo_reabrir_cotizacion().',
      current_user;
  end if;

  return new;
end;
$$;
revoke all on function public.cleo_guard_cotizacion_snapshots() from public;

create trigger trg_cotizaciones_snapshots
  before update on public.cotizaciones
  for each row execute function public.cleo_guard_cotizacion_snapshots();

create trigger trg_cotizaciones_updated_at
  before update on public.cotizaciones
  for each row execute function public.cleo_set_updated_at();

create index idx_cot_negocio      on public.cotizaciones (negocio_id);
create index idx_cot_cliente      on public.cotizaciones (cliente_id);
create index idx_cot_oportunidad  on public.cotizaciones (oportunidad_id) where oportunidad_id is not null;
create index idx_cot_estatus      on public.cotizaciones (negocio_id, estatus);
create index idx_cot_fecha_envio  on public.cotizaciones (negocio_id, fecha_envio);

-- ── Trigger: cotizacion.oportunidad_id → mismo cliente; inmutable tras asignar ─
-- Garantiza que la oportunidad vinculada pertenece al mismo cliente que la
-- cotización. Protege también contra reasignación posterior.
create function public.cleo_guard_cotizacion_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  -- oportunidad_vinculada nunca puede revertirse a false una vez marcado true.
  -- Debe comprobarse antes del early-return de oportunidad_id sin cambio, porque
  -- un UPDATE que solo cambie el flag pasaría de lo contrario sin revisión.
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    raise exception
      'cotizacion: oportunidad_vinculada no puede revertirse a false (cleo_id: %)', old.cleo_id;
  end if;

  -- Si hay vínculo activo (oportunidad_id no nulo ni cambiado) pero cambian
  -- cliente_id o negocio_id: re-verificar coherencia antes del early return.
  -- El early return de abajo omite esta revisión cuando oportunidad_id no varía.
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

  -- UPDATE sin cambio en oportunidad_id ni en campos de coherencia: nada más que verificar.
  if TG_OP = 'UPDATE' and old.oportunidad_id is not distinct from new.oportunidad_id then
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Único cambio permitido en UPDATE: cascade null producido cuando la oportunidad
    -- fue eliminada (ON DELETE SET NULL). Se reconoce porque la oportunidad ya no
    -- existe en la tabla. Cualquier otro cambio — incluyendo NULL→B tras cascade —
    -- es rechazado; oportunidad_vinculada persiste true para bloquear reasignaciones.
    if old.oportunidad_id is not null
       and new.oportunidad_id is null
       and not exists (
         select 1 from public.oportunidades
          where id = old.oportunidad_id and negocio_id = old.negocio_id
       ) then
      return new;
    end if;
    -- Primera asignación: null → no nulo, nunca vinculada antes.
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

  -- INSERT con oportunidad_id no nulo: marcar como vinculada.
  if TG_OP = 'INSERT' and new.oportunidad_id is not null then
    new.oportunidad_vinculada := true;
  end if;

  if new.oportunidad_id is null then return new; end if;

  -- Coherencia: la oportunidad debe pertenecer al mismo cliente y negocio.
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

create trigger trg_cotizaciones_origen
  before insert or update on public.cotizaciones
  for each row execute function public.cleo_guard_cotizacion_origen();

alter table public.cotizaciones enable row level security;
revoke all on table public.cotizaciones from anon, authenticated;
grant select, insert, update, delete on table public.cotizaciones to authenticated;

create policy "cotizaciones del negocio"
  on public.cotizaciones for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());

-- Las funciones SECURITY DEFINER de reapertura corren con current_user=cleo_service.
-- RLS aplica a cleo_service igual que a cualquier rol no-superuser; sin esta
-- política, cleo_service no vería ninguna fila a pesar de tener GRANT SELECT/UPDATE.
-- La verificación de negocio la hace auth_negocio_id() dentro de las propias funciones.
create policy "cleo_service: cotizaciones"
  on public.cotizaciones for all to cleo_service
  using (true) with check (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- PEDIDOS
-- Fuente: cleo_pedidos[] — los pagos[] embebidos van a la tabla pagos.
-- Cubre tres orígenes:
--   origen_venta = 'registro_manual' | 'oportunidad' → pedido normal
--   origen_venta = 'venta_rapida'                    → venta rápida (cliente_id nullable)
-- ══════════════════════════════════════════════════════════════════════════════
create table public.pedidos (
  id                      uuid        primary key default gen_random_uuid(),
  negocio_id              uuid        not null references public.negocios(id) on delete cascade,
  cleo_id                 text        not null,

  -- FK compuesta al cliente (nullable: ventas rápidas no tienen cliente)
  cliente_id              uuid,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id)
    on delete set null (cliente_id)
    deferrable initially deferred,

  -- FK compuesta a la cotización que originó este pedido (si aplica)
  cotizacion_id           uuid,
  foreign key (cotizacion_id, negocio_id)
    references public.cotizaciones (id, negocio_id)
    on delete set null (cotizacion_id)
    deferrable initially deferred,

  -- FK compuesta a la oportunidad (nullable).
  -- Productos: se popula cuando el pedido proviene de la conversión de
  -- una oportunidad activa. Preservado si la oportunidad se elimina.
  oportunidad_id          uuid,
  foreign key (oportunidad_id, negocio_id)
    references public.oportunidades (id, negocio_id)
    on delete set null (oportunidad_id)
    deferrable initially deferred,
  oportunidad_vinculada   boolean not null default false,

  origen_venta            text,   -- 'registro_manual' | 'oportunidad' | 'venta_rapida'

  -- Contenido (mismo razonamiento JSONB que cotizaciones)
  items                   jsonb       not null default '[]',
  productos               text,       -- string resumen: 'Collar dorado + 2 más'
  cantidad                int         not null default 0,
  monto_total             numeric     not null default 0,
  notas                   text,
  etiqueta                text,

  -- Ciclo de vida
  estado_pedido           text        not null default 'preparando'
                                      check (estado_pedido in ('preparando','entregado','cancelado')),
  fecha                   date,
  fecha_entrega           date,
  fecha_cancelacion       date,
  anticipo_conservado     boolean,    -- relevante cuando cancelado
  motivo_cancelacion      text,
  motivo_cancelacion_lado text        check (motivo_cancelacion_lado in ('cliente','negocio')),

  -- Snapshots inmutables: se escriben al confirmar el pedido.
  -- Misma regla que cotizaciones: NULL→valor OK; valor→cualquier_cambio BLOQUEADO.
  -- Para reabrir usar cleo_reabrir_pedido(), que archiva en versiones_confirmacion.
  items_confirmacion      jsonb,
  monto_confirmacion      numeric,
  versiones_confirmacion  jsonb    not null default '[]',

  -- Configuración postventa
  postv_pago              text        check (postv_pago in ('pendiente','resuelto')),
  postv_seguimiento       text        check (postv_seguimiento in ('pendiente','ok')),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  unique (id, negocio_id)   -- permite FKs compuestas desde pagos y adjuntos
);

-- ── Trigger: snapshots y historial de pedido son inmutables ─────────────────
-- Misma mecánica que cleo_guard_cotizacion_snapshots().
create function public.cleo_guard_pedido_snapshots()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'cleo_service' then
    return new;
  end if;

  if old.items_confirmacion is not null
     and old.items_confirmacion is distinct from new.items_confirmacion then
    raise exception
      'items_confirmacion: inmutable para el rol % (cleo_id: %). '
      'Usa cleo_reabrir_pedido().', current_user, old.cleo_id;
  end if;
  if old.monto_confirmacion is not null
     and old.monto_confirmacion is distinct from new.monto_confirmacion then
    raise exception
      'monto_confirmacion: inmutable para el rol % (cleo_id: %).', current_user, old.cleo_id;
  end if;

  if old.versiones_confirmacion is distinct from new.versiones_confirmacion then
    raise exception
      'versiones_confirmacion: de solo lectura para el rol %. '
      'El historial se actualiza únicamente desde cleo_reabrir_pedido().',
      current_user;
  end if;

  return new;
end;
$$;
revoke all on function public.cleo_guard_pedido_snapshots() from public;

create trigger trg_pedidos_snapshots
  before update on public.pedidos
  for each row execute function public.cleo_guard_pedido_snapshots();

create trigger trg_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.cleo_set_updated_at();

create index idx_ped_negocio      on public.pedidos (negocio_id);
create index idx_ped_cliente      on public.pedidos (cliente_id);
create index idx_ped_oportunidad  on public.pedidos (oportunidad_id) where oportunidad_id is not null;
create index idx_ped_estatus      on public.pedidos (negocio_id, estado_pedido);
create index idx_ped_fecha        on public.pedidos (negocio_id, fecha);
create index idx_ped_origen       on public.pedidos (negocio_id, origen_venta);

-- ── Trigger: pedido.oportunidad_id → mismo cliente; inmutable tras asignar ───
create function public.cleo_guard_pedido_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    raise exception
      'pedido: oportunidad_vinculada no puede revertirse a false (cleo_id: %)', old.cleo_id;
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
revoke all on function public.cleo_guard_pedido_origen() from public;

create trigger trg_pedidos_origen
  before insert or update on public.pedidos
  for each row execute function public.cleo_guard_pedido_origen();

alter table public.pedidos enable row level security;
revoke all on table public.pedidos from anon, authenticated;
grant select, insert, update, delete on table public.pedidos to authenticated;

create policy "pedidos del negocio"
  on public.pedidos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());

create policy "cleo_service: pedidos"
  on public.pedidos for all to cleo_service
  using (true) with check (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- VENTAS — solo modo Servicios (cleo_ventas)
-- ══════════════════════════════════════════════════════════════════════════════
create table public.ventas (
  id                  uuid        primary key default gen_random_uuid(),
  negocio_id          uuid        not null references public.negocios(id) on delete cascade,
  cleo_id             text        not null,

  -- FK compuesta al cliente
  cliente_id          uuid,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id)
    on delete set null (cliente_id)
    deferrable initially deferred,

  concepto            text,
  items               jsonb       not null default '[]',
  monto               numeric     not null default 0,
  tipo                text        not null default 'normal'
                                  check (tipo in ('normal','rapida')),
  notas               text,
  etiqueta            text,
  fecha               date,
  fecha_hora          timestamptz,
  postv_pago          text        check (postv_pago in ('pendiente','resuelto')),
  postv_seguimiento   text        check (postv_seguimiento in ('pendiente','ok')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  unique (id, negocio_id)   -- permite FKs compuestas desde pagos
);

create index idx_ven_negocio on public.ventas (negocio_id);
create index idx_ven_cliente on public.ventas (cliente_id);
create index idx_ven_fecha   on public.ventas (negocio_id, fecha);

create trigger trg_ventas_updated_at
  before update on public.ventas
  for each row execute function public.cleo_set_updated_at();

alter table public.ventas enable row level security;
revoke all on table public.ventas from anon, authenticated;
grant select, insert, update, delete on table public.ventas to authenticated;

create policy "ventas del negocio"
  on public.ventas for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- PAGOS — polimórfico; exactamente un documento por pago.
-- Fuente: pagos[] embebidos en cleo_cots, cleo_pedidos, cleo_ventas.
-- 'fecha' = fecha del cobro real; es la que usan Resumen y ReporteComercialPDF.
-- Las FKs compuestas garantizan que el documento pagado es del mismo negocio.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.pagos (
  id              uuid        primary key default gen_random_uuid(),
  negocio_id      uuid        not null references public.negocios(id) on delete cascade,
  cleo_id         text        not null,   -- 'pg_' + timestamp + random

  cotizacion_id   uuid,
  pedido_id       uuid,
  venta_id        uuid,

  foreign key (cotizacion_id, negocio_id)
    references public.cotizaciones (id, negocio_id) on delete cascade
    deferrable initially deferred,
  foreign key (pedido_id, negocio_id)
    references public.pedidos (id, negocio_id) on delete cascade
    deferrable initially deferred,
  foreign key (venta_id, negocio_id)
    references public.ventas (id, negocio_id) on delete cascade
    deferrable initially deferred,

  monto           numeric     not null,
  fecha           date        not null,
  fecha_hora_pago timestamptz,
  concepto        text,

  created_at      timestamptz not null default now(),

  unique (negocio_id, cleo_id),
  constraint pagos_un_documento check (
    (cotizacion_id is not null)::int +
    (pedido_id     is not null)::int +
    (venta_id      is not null)::int = 1
  )
);

-- Clave para todas las queries de reportes filtradas por período.
create index idx_pag_negocio_fecha on public.pagos (negocio_id, fecha);
create index idx_pag_cotizacion    on public.pagos (cotizacion_id);
create index idx_pag_pedido        on public.pagos (pedido_id);
create index idx_pag_venta         on public.pagos (venta_id);

alter table public.pagos enable row level security;
revoke all on table public.pagos from anon, authenticated;
grant select, insert, update, delete on table public.pagos to authenticated;

create policy "pagos del negocio"
  on public.pagos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- HISTORIAL_CONTACTOS — log inmutable de eventos pasados por cliente.
-- Fuente: clientes[].historialContactos[] en cleo_clientes.
-- Solo INSERT y SELECT: el historial nunca se modifica ni se borra.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.historial_contactos (
  id            uuid        primary key default gen_random_uuid(),
  negocio_id    uuid        not null references public.negocios(id) on delete cascade,
  cleo_id       text,

  cliente_id    uuid        not null,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id) on delete cascade
    deferrable initially deferred,

  tipo          text        not null
                            check (tipo in ('precio_enviado','consulta_registrada',
                                           'consulta_actualizada','contacto')),
  descripcion   text,
  monto         numeric,    -- solo para tipo = 'precio_enviado'

  cotizacion_id uuid,
  foreign key (cotizacion_id, negocio_id)
    references public.cotizaciones (id, negocio_id)
    on delete set null (cotizacion_id)
    deferrable initially deferred,

  fecha         timestamptz not null default now()
  -- Sin updated_at: inmutable.
);

create index idx_hc_cliente  on public.historial_contactos (cliente_id);
create index idx_hc_negocio  on public.historial_contactos (negocio_id);

alter table public.historial_contactos enable row level security;
revoke all on table public.historial_contactos from anon, authenticated;
grant select, insert on table public.historial_contactos to authenticated;

create policy "historial del negocio"
  on public.historial_contactos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- RECORDATORIOS — avisos futuros por cliente, opcionalmente por oportunidad.
-- Fuente: clientes[].recordatorios[] en cleo_clientes.
--
-- RELACIÓN CON OPORTUNIDADES
-- ─────────────────────────────────────────────────────────────────────────────
-- oportunidad_id NULL  → recordatorio general del cliente (postventa global,
--                         manual sin contexto de negociación, reactivación
--                         genérica). Se conserva aunque la oportunidad se borre.
-- oportunidad_id set   → seguimiento ligado a una negociación específica.
--                         Inmutable una vez asignado (trg_recordatorios_origen).
--                         El cliente_id del recordatorio debe coincidir con el
--                         cliente_id de la oportunidad.
--
-- DEDUPLICACIÓN DURANTE LA TRANSICIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Durante schema_ver='dual', el proceso de sync puede escribir el mismo
-- recordatorio dos veces. La deduplicación usa (negocio_id, cleo_id) mediante
-- un índice único PARCIAL (solo donde cleo_id IS NOT NULL), de modo que los
-- registros sin cleo_id —migrados sin ID o creados directamente en la tabla—
-- no colisionan entre sí. Ver uq_rec_negocio_cleo_id más abajo.
-- ══════════════════════════════════════════════════════════════════════════════
create table public.recordatorios (
  id                uuid        primary key default gen_random_uuid(),
  negocio_id        uuid        not null references public.negocios(id) on delete cascade,
  cleo_id           text,

  cliente_id        uuid        not null,
  foreign key (cliente_id, negocio_id)
    references public.clientes (id, negocio_id) on delete cascade
    deferrable initially deferred,

  -- FK a la oportunidad (nullable). SET NULL preserva el recordatorio como
  -- general del cliente si la oportunidad se elimina.
  oportunidad_id    uuid,
  foreign key (oportunidad_id, negocio_id)
    references public.oportunidades (id, negocio_id)
    on delete set null (oportunidad_id)
    deferrable initially deferred,
  oportunidad_vinculada boolean not null default false,

  categoria         text        not null
                    check (categoria in ('pipeline','postventa','reactivacion','manual')),
  texto             text,
  fecha             date,

  -- completado: campo legacy (boolean). estatus es la fuente de verdad nueva.
  -- Incluye 'cancelado' para el caso en que la cotización asociada se acepta
  -- y el seguimiento comercial pierde sentido (ver cancelarSeguimientoComercial).
  completado        boolean     not null default false,
  estatus           text        not null default 'pendiente'
                    check (estatus in ('pendiente','atendido','cancelado')),
  fecha_atendido    date,

  es_personalizada  boolean     not null default false,
  origen            text,       -- 'cleo' | null

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (id, negocio_id)        -- permite FKs compuestas futuras si fueran necesarias
);

create index idx_rec_cliente     on public.recordatorios (cliente_id);
create index idx_rec_negocio     on public.recordatorios (negocio_id, fecha);
create index idx_rec_oportunidad on public.recordatorios (oportunidad_id) where oportunidad_id is not null;
-- Índice único parcial: deduplicación solo cuando cleo_id está presente.
-- Múltiples registros con cleo_id=NULL en el mismo negocio son válidos.
create unique index uq_rec_negocio_cleo_id
  on public.recordatorios (negocio_id, cleo_id) where cleo_id is not null;

create trigger trg_recordatorios_updated_at
  before update on public.recordatorios
  for each row execute function public.cleo_set_updated_at();

-- ── Trigger: recordatorio.oportunidad_id → mismo cliente; inmutable; sin heurísticas
-- Garantiza coherencia cliente ↔ oportunidad y protege contra reasignación.
-- Las relaciones históricas ambiguas (migrado_ambiguo=true en origen_migracion)
-- se almacenan con oportunidad_id=NULL; no se infieren asociaciones por cercanía
-- ni por ningún criterio automático no declarado por el usuario.
create function public.cleo_guard_seguimiento_origen()
returns trigger language plpgsql set search_path = '' as $$
declare v_op_cli uuid;
begin
  if TG_OP = 'UPDATE' and old.oportunidad_vinculada and not new.oportunidad_vinculada then
    raise exception
      'recordatorio: oportunidad_vinculada no puede revertirse a false (id: %)', old.id;
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

  -- Coherencia: la oportunidad debe pertenecer al mismo cliente y negocio.
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
revoke all on function public.cleo_guard_seguimiento_origen() from public;

create trigger trg_recordatorios_origen
  before insert or update on public.recordatorios
  for each row execute function public.cleo_guard_seguimiento_origen();

alter table public.recordatorios enable row level security;
revoke all on table public.recordatorios from anon, authenticated;
grant select, insert, update, delete on table public.recordatorios to authenticated;

create policy "recordatorios del negocio"
  on public.recordatorios for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());

create policy "cleo_service: recordatorios"
  on public.recordatorios for all to cleo_service
  using (true) with check (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- ARCHIVO_ADJUNTOS — metadata de archivos en Storage.
-- Fuente: cotizacion.archivoAdjunto y pedido.archivoAdjunto en el blob.
-- El archivo físico vive en bucket 'cleo-cotizacion-archivos'.
-- Path: {user_id}/{cotizaciones|pedidos}/{doc_cleo_id}/{uuid}.{ext}
-- ══════════════════════════════════════════════════════════════════════════════
create table public.archivo_adjuntos (
  id              uuid        primary key default gen_random_uuid(),
  negocio_id      uuid        not null references public.negocios(id) on delete cascade,

  cotizacion_id   uuid,
  pedido_id       uuid,
  foreign key (cotizacion_id, negocio_id)
    references public.cotizaciones (id, negocio_id) on delete cascade
    deferrable initially deferred,
  foreign key (pedido_id, negocio_id)
    references public.pedidos (id, negocio_id) on delete cascade
    deferrable initially deferred,

  storage_path    text        not null,
  nombre_original text,
  mime_type       text,
  size_bytes      int,
  version         int         not null default 1,
  uploaded_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint adjunto_un_documento check (
    (cotizacion_id is not null)::int +
    (pedido_id     is not null)::int = 1
  )
);

create index idx_adj_cotizacion on public.archivo_adjuntos (cotizacion_id);
create index idx_adj_pedido     on public.archivo_adjuntos (pedido_id);
create index idx_adj_negocio    on public.archivo_adjuntos (negocio_id);

alter table public.archivo_adjuntos enable row level security;
revoke all on table public.archivo_adjuntos from anon, authenticated;
grant select, insert, delete on table public.archivo_adjuntos to authenticated;

create policy "adjuntos del negocio"
  on public.archivo_adjuntos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- CATALOGO_ITEMS — catálogo de productos o servicios por negocio.
-- Fuente unificada de DOS keys del blob:
--   cleo_servicios     → modo = 'servicios'
--   cleo_productos_cat → modo = 'productos'
-- La columna 'modo' evita colisiones de cleo_id entre los dos catálogos
-- (ambos usan Date.now() + random, por lo que podrían coincidir dentro
-- del mismo negocio si no se distinguen).
-- Forma de cada ítem: {id, nombre, precio, descripcion, condiciones}
-- ══════════════════════════════════════════════════════════════════════════════
create table public.catalogo_items (
  id          uuid        primary key default gen_random_uuid(),
  negocio_id  uuid        not null references public.negocios(id) on delete cascade,
  cleo_id     text        not null,
  modo        text        not null check (modo in ('productos','servicios')),
  nombre      text        not null default '',
  precio      numeric     not null default 0,
  descripcion text,
  condiciones text,       -- principalmente en modo Servicios

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- La unicidad incluye 'modo' para evitar colisiones entre los dos catálogos.
  unique (negocio_id, modo, cleo_id)
);

create index idx_cat_negocio on public.catalogo_items (negocio_id, modo);

create trigger trg_catalogo_updated_at
  before update on public.catalogo_items
  for each row execute function public.cleo_set_updated_at();

alter table public.catalogo_items enable row level security;
revoke all on table public.catalogo_items from anon, authenticated;
grant select, insert, update, delete on table public.catalogo_items to authenticated;

create policy "catalogo del negocio"
  on public.catalogo_items for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


-- ── Función: reabrir cotización aceptada ─────────────────────────────────────
-- Transición válida: Aceptada → Enviada.
-- SECURITY DEFINER + OWNER cleo_service: cuando authenticated llama esta función,
-- current_user pasa a ser 'cleo_service', lo que el trigger reconoce como
-- operación autorizada.  La verificación de propiedad usa auth_negocio_id(),
-- que lee request.jwt.claims de la sesión llamadora (no se ve afectada por
-- SECURITY DEFINER).  Los permisos de cleo_service se limitan a SELECT/UPDATE
-- en cotizaciones y pedidos, y EXECUTE en auth_negocio_id().
-- FOR UPDATE: bloquea el row hasta el final de la transacción.  Si dos sesiones
-- intentan reabrir la misma cotización concurrentemente, la segunda esperará el
-- commit de la primera y entonces no encontrará estatus='Aceptada' → falla limpia.
create function public.cleo_reabrir_cotizacion(p_cleo_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
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
      'cleo_reabrir_cotizacion: no encontrada, no pertenece a este negocio, '
      'o no está en estado Aceptada. (cleo_id: %)', p_cleo_id;
  end if;

  -- Operación atómica: archivar snapshot anterior y cambiar estatus en un solo UPDATE.
  update public.cotizaciones
     set estatus              = 'Enviada',
         items_aceptacion     = null,
         monto_aceptacion     = null,
         versiones_aceptacion = versiones_aceptacion || jsonb_build_array(
           jsonb_build_object(
             'items', v_row.items_aceptacion,
             'monto', v_row.monto_aceptacion,
             'en',    now()
           )
         )
   where id = v_row.id;
end;
$$;
alter  function public.cleo_reabrir_cotizacion(text) owner to cleo_service;
revoke all    on function public.cleo_reabrir_cotizacion(text) from public;
grant  execute on function public.cleo_reabrir_cotizacion(text) to authenticated;


-- ── Función: reabrir pedido confirmado ───────────────────────────────────────
-- Misma mecánica que cleo_reabrir_cotizacion().
-- Transición válida: entregado → preparando.
create function public.cleo_reabrir_pedido(p_cleo_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
begin
  select id, items_confirmacion, monto_confirmacion
    into v_row
    from public.pedidos
   where cleo_id      = p_cleo_id
     and negocio_id   = public.auth_negocio_id()
     and estado_pedido = 'entregado'
     for update;

  if not found then
    raise exception
      'cleo_reabrir_pedido: no encontrado, no pertenece a este negocio, '
      'o no está en estado entregado. (cleo_id: %)', p_cleo_id;
  end if;

  update public.pedidos
     set estado_pedido          = 'preparando',
         items_confirmacion     = null,
         monto_confirmacion     = null,
         versiones_confirmacion = versiones_confirmacion || jsonb_build_array(
           jsonb_build_object(
             'items', v_row.items_confirmacion,
             'monto', v_row.monto_confirmacion,
             'en',    now()
           )
         )
   where id = v_row.id;
end;
$$;
alter  function public.cleo_reabrir_pedido(text) owner to cleo_service;
revoke all    on function public.cleo_reabrir_pedido(text) from public;
grant  execute on function public.cleo_reabrir_pedido(text) to authenticated;


-- ── Permisos mínimos para cleo_service ───────────────────────────────────────
-- USAGE en schema: requerido para acceder a cualquier objeto.
-- CREATE en schema: requerido por ALTER FUNCTION ... OWNER TO cleo_service
--   (ya concedido al inicio del script, ver arriba).
-- SELECT/UPDATE en tablas: solo las que las funciones de reapertura usan
--   directamente + las que sus triggers consultan.
--   • cotizaciones y pedidos: SELECT FOR UPDATE + UPDATE en funciones de reapertura.
--   • oportunidades: SELECT en triggers de origen (coherencia de cliente).
--   • recordatorios: SELECT/UPDATE para operaciones futuras de reapertura.
-- Las políticas RLS para cleo_service en cada tabla (USING true) garantizan
-- acceso sin filtro; la verificación de propiedad la hace auth_negocio_id()
-- dentro de las funciones SECURITY DEFINER.
grant usage  on schema public to cleo_service;
grant select, update on table public.cotizaciones  to cleo_service;
grant select, update on table public.pedidos       to cleo_service;
grant select         on table public.oportunidades to cleo_service;
grant select, update on table public.recordatorios to cleo_service;
-- auth_negocio_id() es SECURITY DEFINER: cleo_service solo necesita EXECUTE.
grant execute on function public.auth_negocio_id() to cleo_service;


grant usage on schema public to authenticated;

commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
select
  relname                                                   as tabla,
  relrowsecurity                                            as rls,
  (select count(*) from pg_trigger
   where tgrelid = pg_class.oid and not tgisinternal)       as triggers,
  (select count(*) from pg_indexes
   where tablename = pg_class.relname
     and schemaname = 'public')                             as indices
from pg_class
where relname in (
  'negocios','clientes','oportunidades','cotizaciones','pedidos','ventas',
  'pagos','historial_contactos','recordatorios',
  'archivo_adjuntos','catalogo_items'
) and relnamespace = 'public'::regnamespace
order by relname;
