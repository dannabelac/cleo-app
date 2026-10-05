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

-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- BORRADOR — revisar y aprobar antes de ejecutar.
-- Ejecutar DESPUÉS de 03-schema-relacional.sql.
-- Para revertir: eliminar columnas de catalogo_items y DROP TABLE inventario_movimientos.
--
-- MAPA DE CLAVES localStorage → ESQUEMA
-- ──────────────────────────────────────────────────────────────────────────────
-- cleo_productos_cat[].inventarioActivo  → catalogo_items.inventario_activo
-- cleo_productos_cat[].stock             → catalogo_items.stock
-- cleo_productos_cat[].stockMinimo       → catalogo_items.stock_minimo
-- cleo_productos_cat[].costoConfig       → catalogo_items.costo_config (jsonb)
-- cleo_productos_cat[].movimientos[]     → inventario_movimientos (tabla propia)
--
-- DECISIONES DE DISEÑO
-- ──────────────────────────────────────────────────────────────────────────────
-- · inventario_activo / stock / stock_minimo van en catalogo_items porque la
--   relación es 1:1 con el producto. No hay beneficio en una tabla separada
--   para un negocio unipersonal.
--
-- · costo_config es jsonb en catalogo_items: la config se lee y escribe siempre
--   como unidad; ningún reporte filtra por ingrediente individual. Mismo patrón
--   que items jsonb en cotizaciones/pedidos.
--
-- · inventario_movimientos es tabla propia porque: (a) es 1:many por producto,
--   (b) se filtra por fecha en reportes, (c) crece ilimitado en el tiempo y
--   saturaria el blob JSON. Append-only: solo SELECT e INSERT.
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.catalogo_items') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'catalogo_items'
      and column_name  = 'inventario_activo'
  ) then
    raise exception
      'inventario_activo ya existe en catalogo_items. '
      'Este script ya fue ejecutado o el schema fue modificado manualmente.';
  end if;
end;
$guard$;

begin;

-- ── unique(id, negocio_id) en catalogo_items ─────────────────────────────────
-- Requerido para que inventario_movimientos use FK compuesta (catalogo_item_id,
-- negocio_id) → (id, negocio_id) y así garantizar a nivel de constraint que
-- el movimiento y el producto pertenecen al mismo negocio.
-- Sigue el patrón de clientes, oportunidades, cotizaciones y pedidos.
alter table public.catalogo_items
  add constraint catalogo_items_id_negocio_key unique (id, negocio_id);


-- ── Columnas de inventario y costos ──────────────────────────────────────────
alter table public.catalogo_items
  -- Inventario
  add column inventario_activo  boolean  not null default false,
  add column stock              int,       -- null mientras inventario_activo = false
  add column stock_minimo       int,       -- null = sin alerta de stock mínimo
  -- Costos (jsonb porque siempre se lee/escribe como unidad)
  add column costo_config       jsonb;     -- null = sin configuración de costos

-- Constraint: stock solo puede ser no null cuando inventario está activo.
-- Permite stock = 0 (agotado) pero no stock sin inventario activo.
alter table public.catalogo_items
  add constraint catalogo_items_stock_check
    check (stock is null or inventario_activo = true);


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTARIO_MOVIMIENTOS
-- Registro append-only de cambios de stock por producto.
--
-- Tipos de movimiento:
--   ajuste_cantidad → cambio manual desde "Cambiar cantidad"
--                     (nota: 'Stock inicial' | 'Entrada manual' | 'Ajuste manual')
--   entrega         → salida por pedido entregado o venta rápida con cliente
--                     (nota: 'Pedido entregado · N a Cliente' |
--                             'Venta rápida · N [en Lugar | a Cliente]')
--   venta_directa   → salida registrada desde "Registrar salidas" en inventario
--                     (nota: 'Salida manual · N [en Lugar]')
-- ══════════════════════════════════════════════════════════════════════════════
create table public.inventario_movimientos (
  id               uuid        primary key default gen_random_uuid(),
  negocio_id       uuid        not null references public.negocios(id) on delete cascade,

  -- FK compuesta: garantiza que el producto pertenece al mismo negocio.
  -- CASCADE: si se borra el producto, se borran sus movimientos.
  catalogo_item_id uuid        not null,
  foreign key (catalogo_item_id, negocio_id)
    references public.catalogo_items (id, negocio_id) on delete cascade
    deferrable initially deferred,

  -- cleo_id: id original generado en el cliente ('mov_' + timestamp + '_' + prodId).
  -- Índice único parcial (solo donde no es null) para deduplicar sin bloquear
  -- filas importadas sin id previo. Mismo patrón que recordatorios.
  cleo_id          text,

  fecha            date        not null,
  tipo             text        not null
                   check (tipo in ('ajuste_cantidad','entrega','venta_directa')),
  nota             text,
  cant_antes       int,        -- null en el primer movimiento (stock inicial)
  cant_despues     int,

  -- Sin updated_at: los movimientos son inmutables (append-only).
  -- Un movimiento equivocado se corrige con uno nuevo compensatorio, nunca editando.
  created_at       timestamptz not null default now()
);

create index idx_inv_mov_item    on public.inventario_movimientos (catalogo_item_id);
create index idx_inv_mov_negocio on public.inventario_movimientos (negocio_id, fecha);

-- Deduplicación: mismo criterio que recordatorios.
create unique index uq_inv_mov_negocio_cleo_id
  on public.inventario_movimientos (negocio_id, cleo_id) where cleo_id is not null;

-- Append-only: authenticated puede leer e insertar, nunca modificar ni borrar.
-- Mismo nivel de protección que historial_contactos.
alter table public.inventario_movimientos enable row level security;
revoke all on table public.inventario_movimientos from anon, authenticated;
grant select, insert on table public.inventario_movimientos to authenticated;

create policy "movimientos del negocio"
  on public.inventario_movimientos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
-- Columnas nuevas en catalogo_items
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'catalogo_items'
  and column_name  in ('inventario_activo','stock','stock_minimo','costo_config')
order by column_name;

-- Tabla inventario_movimientos
select
  relname                                                    as tabla,
  relrowsecurity                                             as rls,
  (select count(*) from pg_trigger
   where tgrelid = pg_class.oid and not tgisinternal)        as triggers,
  (select count(*) from pg_indexes
   where tablename = pg_class.relname
     and schemaname = 'public')                              as indices
from pg_class
where relname = 'inventario_movimientos'
  and relnamespace = 'public'::regnamespace;

-- Constraint de coherencia stock/inventario_activo
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.catalogo_items'::regclass
  and conname like 'catalogo_items_%';

-- ══════════════════════════════════════════════════════════════════════════════
-- 23-schema-patches.sql
-- Columnas nuevas aprobadas el 2026-09-30 antes de la copia inicial.
-- Ejecutar ANTES de 23-copia-inicial.sql.
-- Solo aplica en CLEO Pruebas. No tocar producción.
-- ══════════════════════════════════════════════════════════════════════════════

-- Decisiones aprobadas:
--   clientes.notas_prospecto   : preservar notasProspecto sin mezclar con notas.
--   clientes.origen_otro       : preservar origenOtro separado de origen.
--   pedidos.fecha_hora_entrega : timestamptz; conservar precisión junto a fecha_entrega.
--   pedidos.fecha_hora_cancelacion : timestamptz; conservar precisión junto a fecha_cancelacion.
--   cotizaciones.cantidad      : suma de unidades (sum items[].cantidad), no conteo de líneas.

do $guard$
begin
  if to_regclass('public.clientes') is null then
    raise exception 'La tabla clientes no existe. Corre 03-schema-relacional.sql primero.';
  end if;
end;
$guard$;

begin;

-- ── clientes ──────────────────────────────────────────────────────────────────
alter table public.clientes
  add column if not exists notas_prospecto text,
  add column if not exists origen_otro     text;

comment on column public.clientes.notas_prospecto is
  'Notas internas sobre la etapa de prospecto. Origen: blob.notasProspecto. '
  'Distinto de notas (notas generales del cliente).';

comment on column public.clientes.origen_otro is
  'Texto libre cuando origen = ''Otro''. Origen: blob.origenOtro. '
  'No sustituye a origen; se conserva por separado.';

-- ── pedidos ───────────────────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists fecha_hora_entrega      timestamptz,
  add column if not exists fecha_hora_cancelacion  timestamptz;

comment on column public.pedidos.fecha_hora_entrega is
  'Precisión de hora de entrega. Origen: blob.fechaHoraEntrega. '
  'Coexiste con fecha_entrega (date); no la reemplaza.';

comment on column public.pedidos.fecha_hora_cancelacion is
  'Precisión de hora de cancelación. Origen: blob.fechaHoraCancelacion. '
  'Coexiste con fecha_cancelacion (date); no la reemplaza.';

-- ── cotizaciones ──────────────────────────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists cantidad int;

comment on column public.cotizaciones.cantidad is
  'Suma de unidades vendidas: sum(items[].cantidad). '
  'Distinto de items.length (conteo de líneas). Origen: blob.cantidad.';

-- ── recordatorios.categoria — agregar 'sin_clasificar' al CHECK ──────────────
-- Necesario para los 21 recordatorios legacy (seguimientoFecha) cuya categoría
-- no puede determinarse sin evidencia explícita del usuario.
-- El constraint original: check (categoria in ('pipeline','postventa','reactivacion','manual'))
alter table public.recordatorios
  drop constraint if exists recordatorios_categoria_check;

alter table public.recordatorios
  add constraint recordatorios_categoria_check
    check (categoria in ('pipeline','postventa','reactivacion','manual','sin_clasificar'));

commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'clientes'        and column_name in ('notas_prospecto','origen_otro'))
    or (table_name = 'pedidos'      and column_name in ('fecha_hora_entrega','fecha_hora_cancelacion'))
    or (table_name = 'cotizaciones' and column_name = 'cantidad')
  )
order by table_name, column_name;

-- Confirmar que el constraint de categoría incluye sin_clasificar
select conname, pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid = 'public.recordatorios'::regclass
  and conname = 'recordatorios_categoria_check';

-- ══════════════════════════════════════════════════════════════════════════════
-- Parte 2: Reemplazar cleo_dual_flush con el fix aplicado
-- Cambios: + if clienteId in v_del_clientes → continue  (en loop pedidos y cots)
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

  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';

  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_uuid2   uuid;
  -- ── CAMBIO 21: id del catalogo_item para enlazar movimientos ─────────────
  v_ci_id   uuid;

  v_hist_conflictos jsonb := '[]'::jsonb;
  v_hist_existente  record;
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

  -- ── 2. FORMATO ────────────────────────────────────────────────────────────
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
  select ud.updated_at, true
    into v_ud_updated_at, v_ud_exists
    from public.user_data ud
   where ud.user_id = v_uid
     for update;

  if not found then
    if p_ultimo_updated_at is not null then
      return jsonb_build_object('estado','conflicto');
    end if;
    v_ud_exists := false;
  else
    if p_ultimo_updated_at is null then
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
  perform set_config('cleo.procesando_tombstones', 'true', true);

  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id   = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;

  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_recordatorios);
  end if;

  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_oportunidades);
  end if;

  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
  end if;

  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_ventas);
  end if;

  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_pedidos);
  end if;

  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_clientes);
  end if;

  -- ── 6. UPSERT CATÁLOGO SERVICIOS ─────────────────────────────────────────
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

  -- ── CAMBIO 21: UPSERT CATÁLOGO PRODUCTOS con inventario ──────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
       inventario_activo, stock, stock_minimo, costo_config)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
      v_it ->> 'descripcion', v_it ->> 'condiciones',
      -- inventario: solo activo cuando inventarioActivo=true; stock null si no activo
      coalesce((v_it ->> 'inventarioActivo')::boolean, false),
      case when (v_it ->> 'inventarioActivo')::boolean
           then nullif(v_it ->> 'stock', '')::int
           else null end,
      nullif(v_it ->> 'stockMinimo', '')::int,
      v_it -> 'costoConfig'   -- null si no configurado
    )
    on conflict (negocio_id, modo, cleo_id) do update set
      nombre            = excluded.nombre,
      precio            = excluded.precio,
      descripcion       = excluded.descripcion,
      condiciones       = excluded.condiciones,
      inventario_activo = excluded.inventario_activo,
      stock             = excluded.stock,
      stock_minimo      = excluded.stock_minimo,
      costo_config      = excluded.costo_config;
  end loop;

  -- ── 6b NUEVO: INSERT inventario_movimientos (append-only) ─────────────────
  -- Un movimiento ya insertado no se modifica — ON CONFLICT DO NOTHING.
  -- Movimientos sin id se ignoran (no se pueden deduplicar).
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    -- Resolver el UUID del catalogo_item en la tabla
    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id
       and ci.modo       = 'productos'
       and ci.cleo_id    = (v_it ->> 'id');

    if v_ci_id is null then continue; end if;

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
  -- ── FIN CAMBIO 21 ──────────────────────────────────────────────────────────

  -- ── 7. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes', '[]'))
  loop
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
      nombre                        = excluded.nombre,
      empresa                       = excluded.empresa,
      telefono                      = excluded.telefono,
      email                         = excluded.email,
      instagram                     = excluded.instagram,
      messenger                     = excluded.messenger,
      canal                         = excluded.canal,
      origen                        = excluded.origen,
      etapa                         = excluded.etapa,
      fecha_etapa                   = excluded.fecha_etapa,
      estado_prospecto              = excluded.estado_prospecto,
      motivo_perdida                = excluded.motivo_perdida,
      razon_cierre                  = excluded.razon_cierre,
      ultimo_contacto               = excluded.ultimo_contacto,
      notas                         = excluded.notas,
      etiqueta                      = excluded.etiqueta,
      nota_recontacto               = excluded.nota_recontacto,
      fecha_pedido                  = excluded.fecha_pedido,
      servicio_interes              = excluded.servicio_interes,
      items_interes                 = excluded.items_interes,
      mensaje_seguimiento           = excluded.mensaje_seguimiento,
      seguimiento_custom            = excluded.seguimiento_custom,
      seguimiento_fecha             = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
  end loop;

  -- ── 8. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;

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
  end loop;

  -- ── 9. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
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

    exception when unique_violation then
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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

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
      case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_it -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end
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
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end
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
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then
          continue;
        end if;

        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then
          v_rec_cat := 'sin_clasificar';
        end if;

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
          oportunidad_id        = excluded.oportunidad_id,
          oportunidad_vinculada = excluded.oportunidad_vinculada,
          categoria             = excluded.categoria,
          texto                 = excluded.texto,
          fecha                 = excluded.fecha,
          completado            = excluded.completado,
          estatus               = excluded.estatus,
          es_personalizada      = excluded.es_personalizada,
          origen                = excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 13. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
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

        select h.tipo, h.resultado, h.monto into v_hist_existente
          from public.historial_contactos h
         where h.negocio_id = v_neg_id
           and h.cleo_id    = v_h_cleo_id
         limit 1;

        if not found then
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
          if v_hist_existente.tipo      is distinct from v_h_tipo
          or v_hist_existente.resultado is distinct from (v_sub ->> 'resultado')
          or v_hist_existente.monto     is distinct from (v_sub ->> 'monto')::numeric
          then
            v_hist_conflictos := v_hist_conflictos || jsonb_build_array(
              jsonb_build_object(
                'cleo_id',       v_h_cleo_id,
                'tipo_nuevo',    v_h_tipo,
                'tipo_guardado', v_hist_existente.tipo,
                'mensaje', 'historial_contactos inmutable: contenido distinto para el mismo id'
              )
            );
          end if;
        end if;
      end;
    end loop;
  end loop;

  -- ── 14. UPSERT ARCHIVO_ADJUNTOS ───────────────────────────────────────────
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
  raise;

end;
$func$;
revoke execute on function public.cleo_dual_flush(jsonb, text, timestamptz) from public;
grant  execute on function public.cleo_dual_flush(jsonb, text, timestamptz) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 28-eventos-inventario-dual.sql
-- CLEO Pruebas — soporte de cleo_eventos_inventario en modo dual
--
-- PROBLEMA:
--   cleo_dual_flush() ya guarda el blob completo (incluyendo
--   cleo_eventos_inventario) en user_data.data.
--   Sin embargo, cleo_dual_read() reconstruye la respuesta exclusivamente
--   desde las tablas relacionales y nunca devuelve cleo_eventos_inventario,
--   así que el cliente lee un blob sin esa clave → la escribe como null en
--   localStorage → los eventos desaparecen en cada refresh.
--
-- SOLUCIÓN (mínima, sin nueva tabla):
--   Tres cambios quirúrgicos a cleo_dual_read():
--   1. Declarar v_ud_data jsonb
--   2. Leer ud.data junto con ud.updated_at de user_data
--   3. Incluir cleo_eventos_inventario en la respuesta tomándolo del blob
--
-- PRERREQUISITO: 21-inventario-flush-read.sql ejecutado.
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
  v_ud_data     jsonb;  -- CAMBIO 28: leer blob para recuperar claves sin tabla relacional
begin
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

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

  -- CAMBIO 28: leer también ud.data para recuperar claves sin tabla relacional
  -- (antes: select ud.updated_at into v_updated_at ...)
  select ud.updated_at, ud.data
    into v_updated_at, v_ud_data
    from public.user_data ud where ud.user_id = v_uid;

  select jsonb_build_object(
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
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
    -- Catálogo servicios (sin inventario: modo=servicios no tiene stock)
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
    -- ── CAMBIO 21: cleo_productos_cat con inventario y movimientos ────────────
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',               public.cleo_id_to_json(ci.cleo_id),
            'nombre',           ci.nombre,
            'precio',           ci.precio,
            'descripcion',      ci.descripcion,
            'condiciones',      ci.condiciones,
            'inventarioActivo', ci.inventario_activo,
            'stock',            ci.stock,
            'stockMinimo',      ci.stock_minimo,
            'costoConfig',      ci.costo_config,
            'movimientos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',          mv.cleo_id,
                    'fecha',       mv.fecha,
                    'tipo',        mv.tipo,
                    'nota',        mv.nota,
                    'cantAntes',   mv.cant_antes,
                    'cantDespues', mv.cant_despues
                  ) order by mv.created_at)
                 from public.inventario_movimientos mv
                where mv.catalogo_item_id = ci.id
                  and mv.negocio_id       = ci.negocio_id),
                '[]'::jsonb
              )
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
    -- ── FIN CAMBIO 21 ─────────────────────────────────────────────────────────
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
                    'fecha',     h.fecha::date,
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
              then jsonb_build_object('pago', ct.postv_pago,
                     'seguimiento', case when ct.postv_seguimiento='ok' then 'resuelto' else ct.postv_seguimiento end)
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
            'configPostVenta', case
              when vt.postv_pago is not null or vt.postv_seguimiento is not null
              then jsonb_build_object('pago', vt.postv_pago,
                     'seguimiento', case when vt.postv_seguimiento='ok' then 'resuelto' else vt.postv_seguimiento end)
              else null end,
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
            'configPostVenta', case
              when pd.postv_pago is not null or pd.postv_seguimiento is not null
              then jsonb_build_object('pago', pd.postv_pago,
                     'seguimiento', case when pd.postv_seguimiento='ok' then 'resuelto' else pd.postv_seguimiento end)
              else null end,
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
    'cleo_tombstones', '[]'::jsonb,
    -- CAMBIO 28: incluir eventos de inventario desde el blob persistido.
    -- No tiene tabla relacional propia; cleo_dual_flush ya lo guarda en
    -- user_data.data, así que solo hace falta leerlo de ahí.
    'cleo_eventos_inventario', coalesce(v_ud_data -> 'cleo_eventos_inventario', '[]'::jsonb)
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;
revoke execute on function public.cleo_dual_read() from public;
grant  execute on function public.cleo_dual_read() to authenticated;


-- ── Verificación rápida ───────────────────────────────────────────────────────
select
  proname as funcion,
  pg_get_functiondef(oid) like '%cleo_eventos_inventario%' as tiene_eventos_inventario
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'cleo_dual_read';

-- ══════════════════════════════════════════════════════════════════════════════
-- 29-multiop-dual-flush.sql
-- CLEO Pruebas — soporte multi-oportunidad en modo dual (Fase 1)
--
-- ⚠️  NO EJECUTAR sin aprobación explícita del equipo CLEO.
--     Solo entorno CLEO Pruebas (pconfadsbtwjbjeblxgl). NO producción.
--
-- PRERREQUISITO: 28-eventos-inventario-dual.sql ejecutado.
--
-- CAMBIOS:
--   1. cleo_dual_read():
--      - Oportunidades incluyen: cotizacionId, ultimoContacto, fechaCreacion,
--        recordatorios (vacío en Fase 1 — aún viven en c.recordatorios).
--      - Backward-compatible: campos nuevos son NULL/[] cuando no aplican.
--
--   2. cleo_dual_flush():
--      - Resolver cotización→oportunidad usa cotizacionId del objeto oportunidad
--        para detectar IDs del tipo 'op_<timestamp>' (nuevas oportunidades multi-op).
--      - Fallback a la lógica heredada (op_cli_<clienteId> / op_cotindep_<cotId>)
--        para oportunidades antiguas sin cotizacionId.
--      - Backward-compatible: datos existentes en CLEO Pruebas no se afectan.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. cleo_dual_read() — agrega campos multi-op a oportunidades ─────────────
--
-- Construye desde 28-eventos-inventario-dual.sql (versión base).
-- Cambios marcados con "CAMBIO 29".

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
  v_ud_data     jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

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

  select ud.updated_at, ud.data
    into v_updated_at, v_ud_data
    from public.user_data ud where ud.user_id = v_uid;

  select jsonb_build_object(
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
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
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
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',               public.cleo_id_to_json(ci.cleo_id),
            'nombre',           ci.nombre,
            'precio',           ci.precio,
            'descripcion',      ci.descripcion,
            'condiciones',      ci.condiciones,
            'inventarioActivo', ci.inventario_activo,
            'stock',            ci.stock,
            'stockMinimo',      ci.stock_minimo,
            'costoConfig',      ci.costo_config,
            'movimientos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',          mv.cleo_id,
                    'fecha',       mv.fecha,
                    'tipo',        mv.tipo,
                    'nota',        mv.nota,
                    'cantAntes',   mv.cant_antes,
                    'cantDespues', mv.cant_despues
                  ) order by mv.created_at)
                 from public.inventario_movimientos mv
                where mv.catalogo_item_id = ci.id
                  and mv.negocio_id       = ci.negocio_id),
                '[]'::jsonb
              )
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
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
                    'fecha',     h.fecha::date,
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
    -- CAMBIO 29: oportunidades con campos multi-op
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           o.etapa,
            -- CAMBIO 29: cotizacionId — cleo_id de la cotización activa vinculada
            'cotizacionId',    (
              select ct_op.cleo_id
                from public.cotizaciones ct_op
               where ct_op.oportunidad_id = o.id
                 and ct_op.negocio_id     = o.negocio_id
                 and ct_op.estatus        in ('Pendiente','Aceptada')
               order by ct_op.created_at desc
               limit 1
            ),
            -- CAMBIO 29: fechaCreacion — fecha de creación de la oportunidad
            'fechaCreacion',   o.fecha,
            'fecha',           o.fecha,
            'fechaEtapa',      o.fecha_etapa,
            -- CAMBIO 29: ultimoContacto
            'ultimoContacto',  o.ultimo_contacto,
            'fechaCierre',     o.fecha_cierre,
            'motivoCierre',    o.motivo_cierre,
            'origenMigracion', o.origen_migracion,
            -- CAMBIO 29: recordatorios vacío en Fase 1 (viven en c.recordatorios)
            'recordatorios',   '[]'::jsonb
          ) order by o.fecha)
         from public.oportunidades o
         join public.clientes c_o on c_o.id = o.cliente_id
        where o.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
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
              then jsonb_build_object('pago', ct.postv_pago,
                     'seguimiento', case when ct.postv_seguimiento='ok' then 'resuelto' else ct.postv_seguimiento end)
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
            'configPostVenta', case
              when vt.postv_pago is not null or vt.postv_seguimiento is not null
              then jsonb_build_object('pago', vt.postv_pago,
                     'seguimiento', case when vt.postv_seguimiento='ok' then 'resuelto' else vt.postv_seguimiento end)
              else null end,
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
            'configPostVenta', case
              when pd.postv_pago is not null or pd.postv_seguimiento is not null
              then jsonb_build_object('pago', pd.postv_pago,
                     'seguimiento', case when pd.postv_seguimiento='ok' then 'resuelto' else pd.postv_seguimiento end)
              else null end,
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
    'cleo_tombstones', '[]'::jsonb,
    'cleo_eventos_inventario', coalesce(v_ud_data -> 'cleo_eventos_inventario', '[]'::jsonb),
    -- CAMBIO 29: propagar cleo_multiop_enabled desde el blob guardado
    'cleo_multiop_enabled', v_ud_data -> 'cleo_multiop_enabled'
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;
revoke execute on function public.cleo_dual_read() from public;
grant  execute on function public.cleo_dual_read() to authenticated;


-- ── 2. cleo_dual_flush() — con resolver multi-op para cotizaciones ──────────
--
-- Reescritura completa basada en 25-fix-flush-pedidos-borrados.sql.
-- CAMBIO 29 marcado en tres lugares:
--   a) DECLARE: agrega v_cot_to_op jsonb
--   b) Antes del paso 9: construye mapa cotizacionId→opId desde cleo_oportunidades
--   c) Resolver (paso 9): lookup multi-op primero, fallback heredado si no existe

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

  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';

  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_uuid2   uuid;
  v_ci_id   uuid;

  v_hist_conflictos jsonb := '[]'::jsonb;
  v_hist_existente  record;
  v_n int;

  -- CAMBIO 29a: mapa cotizacionId (cleo_id) → oportunidad cleo_id
  v_cot_to_op jsonb := '{}'::jsonb;
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

  -- ── 2. FORMATO ────────────────────────────────────────────────────────────
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
  select ud.updated_at, true
    into v_ud_updated_at, v_ud_exists
    from public.user_data ud
   where ud.user_id = v_uid
     for update;

  if not found then
    if p_ultimo_updated_at is not null then
      return jsonb_build_object('estado','conflicto');
    end if;
    v_ud_exists := false;
  else
    if p_ultimo_updated_at is null then
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
  perform set_config('cleo.procesando_tombstones', 'true', true);

  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id   = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;

  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_recordatorios);
  end if;

  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_oportunidades);
  end if;

  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
  end if;

  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_ventas);
  end if;

  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_pedidos);
  end if;

  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_clientes);
  end if;

  -- ── 6. UPSERT CATÁLOGO SERVICIOS ─────────────────────────────────────────
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

  -- ── CAMBIO 21: UPSERT CATÁLOGO PRODUCTOS con inventario ──────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
       inventario_activo, stock, stock_minimo, costo_config)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
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
      condiciones       = excluded.condiciones,
      inventario_activo = excluded.inventario_activo,
      stock             = excluded.stock,
      stock_minimo      = excluded.stock_minimo,
      costo_config      = excluded.costo_config;
  end loop;

  -- ── CAMBIO 21b: INSERT inventario_movimientos (append-only) ──────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id
       and ci.modo       = 'productos'
       and ci.cleo_id    = (v_it ->> 'id');

    if v_ci_id is null then continue; end if;

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

  -- ── 7. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes', '[]'))
  loop
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
      nombre                        = excluded.nombre,
      empresa                       = excluded.empresa,
      telefono                      = excluded.telefono,
      email                         = excluded.email,
      instagram                     = excluded.instagram,
      messenger                     = excluded.messenger,
      canal                         = excluded.canal,
      origen                        = excluded.origen,
      etapa                         = excluded.etapa,
      fecha_etapa                   = excluded.fecha_etapa,
      estado_prospecto              = excluded.estado_prospecto,
      motivo_perdida                = excluded.motivo_perdida,
      razon_cierre                  = excluded.razon_cierre,
      ultimo_contacto               = excluded.ultimo_contacto,
      notas                         = excluded.notas,
      etiqueta                      = excluded.etiqueta,
      nota_recontacto               = excluded.nota_recontacto,
      fecha_pedido                  = excluded.fecha_pedido,
      servicio_interes              = excluded.servicio_interes,
      items_interes                 = excluded.items_interes,
      mensaje_seguimiento           = excluded.mensaje_seguimiento,
      seguimiento_custom            = excluded.seguimiento_custom,
      seguimiento_fecha             = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
  end loop;

  -- ── 8. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;

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
  end loop;

  -- CAMBIO 29b: construir mapa cotizacionId → oportunidad cleo_id
  -- antes del loop de cotizaciones para resolver IDs op_<timestamp>
  v_cot_to_op := '{}'::jsonb;
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'cotizacionId') is not null then
      v_cot_to_op := v_cot_to_op || jsonb_build_object(
        v_it ->> 'cotizacionId', v_it ->> 'id'
      );
    end if;
  end loop;

  -- ── 9. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    v_uuid2 := null;
    declare
      v_es_indep boolean;
      v_op_cleo  text;
    begin
      -- CAMBIO 29c: lookup multi-op primero; fallback heredado para oportunidades migradas
      v_op_cleo := v_cot_to_op ->> (v_it ->> 'id');
      if v_op_cleo is null then
        v_es_indep := (v_it ->> 'vinculadaOportunidadActual') = 'false'
                      or (v_it -> 'vinculadaOportunidadActual') = 'false'::jsonb;
        v_op_cleo  := case when v_es_indep
                        then 'op_cotindep_' || (v_it ->> 'id')
                        else 'op_cli_'      || (v_it ->> 'clienteId')
                      end;
      end if;
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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
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

    exception when unique_violation then
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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

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
      case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_it -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end
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
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end
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
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then
          continue;
        end if;

        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then
          v_rec_cat := 'sin_clasificar';
        end if;

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
          oportunidad_id        = excluded.oportunidad_id,
          oportunidad_vinculada = excluded.oportunidad_vinculada,
          categoria             = excluded.categoria,
          texto                 = excluded.texto,
          fecha                 = excluded.fecha,
          completado            = excluded.completado,
          estatus               = excluded.estatus,
          es_personalizada      = excluded.es_personalizada,
          origen                = excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 13. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
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

        select h.tipo, h.resultado, h.monto into v_hist_existente
          from public.historial_contactos h
         where h.negocio_id = v_neg_id
           and h.cleo_id    = v_h_cleo_id
         limit 1;

        if not found then
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
          if v_hist_existente.tipo      is distinct from v_h_tipo
          or v_hist_existente.resultado is distinct from (v_sub ->> 'resultado')
          or v_hist_existente.monto     is distinct from (v_sub ->> 'monto')::numeric
          then
            v_hist_conflictos := v_hist_conflictos || jsonb_build_array(
              jsonb_build_object(
                'cleo_id',       v_h_cleo_id,
                'tipo_nuevo',    v_h_tipo,
                'tipo_guardado', v_hist_existente.tipo,
                'mensaje', 'historial_contactos inmutable: contenido distinto para el mismo id'
              )
            );
          end if;
        end if;
      end;
    end loop;
  end loop;

  -- ── 14. UPSERT ARCHIVO_ADJUNTOS ───────────────────────────────────────────
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
  raise;

end;
$func$;
revoke execute on function public.cleo_dual_flush(jsonb, text, timestamptz) from public;
grant  execute on function public.cleo_dual_flush(jsonb, text, timestamptz) to authenticated;


-- ── Verificación ──────────────────────────────────────────────────────────────
select
  proname as funcion,
  pg_get_functiondef(oid) like '%cotizacionId%'        as tiene_cotizacion_id,
  pg_get_functiondef(oid) like '%ultimoContacto%'      as tiene_ultimo_contacto,
  pg_get_functiondef(oid) like '%fechaCreacion%'       as tiene_fecha_creacion,
  pg_get_functiondef(oid) like '%cleo_multiop_enabled%' as tiene_multiop_flag,
  pg_get_functiondef(oid) like '%v_cot_to_op%'         as tiene_resolver_multiop
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cleo_dual_read','cleo_dual_flush')
order by proname;

-- Resultado esperado:
--   cleo_dual_flush | true  | true  | (no requerido) | false | true
--   cleo_dual_read  | true  | true  | true           | true  | false

-- ══════════════════════════════════════════════════════════════════════════════
-- 32-fix-etapa-dual-mapping.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — SOLO CLEO Pruebas, nunca producción
--
-- Problema: cleo_dual_read devuelve etapas en snake_case (cotizacion_enviada)
-- pero CLEO.jsx usa title-case (Cotizacion enviada) internamente en todo el
-- pipeline. cleo_dual_flush también recibe title-case pero escribe sin normalizar,
-- lo que haría fallar el trigger cleo_guard_oportunidad_etapa_modo.
--
-- Fix: helper functions para mapear en ambas direcciones + recrear ambas
-- funciones usando los helpers.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Helpers de mapeo ─────────────────────────────────────────────────────────

-- DB snake_case → UI title-case (para cleo_dual_read)
create or replace function public.cleo_etapa_to_ui(etapa text)
returns text
language sql immutable
set search_path = ''
as $$
  select case etapa
    when 'nuevo_contacto'     then 'Nuevo contacto'
    when 'cotizacion_enviada' then 'Cotizacion enviada'
    when 'negociacion'        then 'Negociacion'
    when 'ganado'             then 'Ganado'
    when 'perdido'            then 'Perdido'
    else etapa
  end;
$$;

-- UI title-case → DB snake_case (para cleo_dual_flush)
create or replace function public.cleo_etapa_to_db(etapa text)
returns text
language sql immutable
set search_path = ''
as $$
  select case etapa
    when 'Nuevo contacto'     then 'nuevo_contacto'
    when 'Cotizacion enviada' then 'cotizacion_enviada'
    when 'Negociacion'        then 'negociacion'
    when 'Ganado'             then 'ganado'
    when 'Perdido'            then 'perdido'
    -- pass-through: ya está en snake_case (datos migrados o productos)
    when 'nuevo_contacto'     then 'nuevo_contacto'
    when 'cotizacion_enviada' then 'cotizacion_enviada'
    when 'negociacion'        then 'negociacion'
    when 'ganado'             then 'ganado'
    when 'perdido'            then 'perdido'
    -- productos (no requieren mapeo, son snake_case en UI y DB)
    when 'nueva'              then 'nueva'
    when 'en_seguimiento'     then 'en_seguimiento'
    when 'sin_respuesta'      then 'sin_respuesta'
    when 'convertido'         then 'convertido'
    else coalesce(etapa, 'nuevo_contacto')
  end;
$$;

revoke execute on function public.cleo_etapa_to_ui(text) from public;
revoke execute on function public.cleo_etapa_to_db(text) from public;
grant  execute on function public.cleo_etapa_to_ui(text) to authenticated;
grant  execute on function public.cleo_etapa_to_db(text) to authenticated;


-- ── 1. cleo_dual_read — con mapeo snake_case → title-case en etapa ───────────

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
  v_ud_data     jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

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

  select ud.updated_at, ud.data
    into v_updated_at, v_ud_data
    from public.user_data ud where ud.user_id = v_uid;

  select jsonb_build_object(
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
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
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
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',               public.cleo_id_to_json(ci.cleo_id),
            'nombre',           ci.nombre,
            'precio',           ci.precio,
            'descripcion',      ci.descripcion,
            'condiciones',      ci.condiciones,
            'inventarioActivo', ci.inventario_activo,
            'stock',            ci.stock,
            'stockMinimo',      ci.stock_minimo,
            'costoConfig',      ci.costo_config,
            'movimientos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',          mv.cleo_id,
                    'fecha',       mv.fecha,
                    'tipo',        mv.tipo,
                    'nota',        mv.nota,
                    'cantAntes',   mv.cant_antes,
                    'cantDespues', mv.cant_despues
                  ) order by mv.created_at)
                 from public.inventario_movimientos mv
                where mv.catalogo_item_id = ci.id
                  and mv.negocio_id       = ci.negocio_id),
                '[]'::jsonb
              )
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
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
                    'fecha',     h.fecha::date,
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
    -- CAMBIO 29: oportunidades con campos multi-op
    -- CAMBIO 32: etapa mapeada snake_case → title-case (cleo_etapa_to_ui)
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           public.cleo_etapa_to_ui(o.etapa),
            -- CAMBIO 29: cotizacionId — cleo_id de la cotización activa vinculada
            'cotizacionId',    (
              select ct_op.cleo_id
                from public.cotizaciones ct_op
               where ct_op.oportunidad_id = o.id
                 and ct_op.negocio_id     = o.negocio_id
                 and ct_op.estatus        in ('Pendiente','Aceptada')
               order by ct_op.created_at desc
               limit 1
            ),
            -- CAMBIO 29: fechaCreacion — fecha de creación de la oportunidad
            'fechaCreacion',   o.fecha,
            'fecha',           o.fecha,
            'fechaEtapa',      o.fecha_etapa,
            -- CAMBIO 29: ultimoContacto
            'ultimoContacto',  o.ultimo_contacto,
            'fechaCierre',     o.fecha_cierre,
            'motivoCierre',    o.motivo_cierre,
            'origenMigracion', o.origen_migracion,
            -- CAMBIO 29: recordatorios vacío en Fase 1 (viven en c.recordatorios)
            'recordatorios',   '[]'::jsonb
          ) order by o.fecha)
         from public.oportunidades o
         join public.clientes c_o on c_o.id = o.cliente_id
        where o.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
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
              then jsonb_build_object('pago', ct.postv_pago,
                     'seguimiento', case when ct.postv_seguimiento='ok' then 'resuelto' else ct.postv_seguimiento end)
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
            'configPostVenta', case
              when vt.postv_pago is not null or vt.postv_seguimiento is not null
              then jsonb_build_object('pago', vt.postv_pago,
                     'seguimiento', case when vt.postv_seguimiento='ok' then 'resuelto' else vt.postv_seguimiento end)
              else null end,
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
            'configPostVenta', case
              when pd.postv_pago is not null or pd.postv_seguimiento is not null
              then jsonb_build_object('pago', pd.postv_pago,
                     'seguimiento', case when pd.postv_seguimiento='ok' then 'resuelto' else pd.postv_seguimiento end)
              else null end,
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
    'cleo_tombstones', '[]'::jsonb,
    'cleo_eventos_inventario', coalesce(v_ud_data -> 'cleo_eventos_inventario', '[]'::jsonb),
    -- CAMBIO 29: propagar cleo_multiop_enabled desde el blob guardado
    'cleo_multiop_enabled', v_ud_data -> 'cleo_multiop_enabled'
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;
revoke execute on function public.cleo_dual_read() from public;
grant  execute on function public.cleo_dual_read() to authenticated;


-- ── 2. cleo_dual_flush — con mapeo title-case → snake_case en etapa ──────────
-- CAMBIO 32: usa cleo_etapa_to_db() en el upsert de oportunidades

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

  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';

  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_uuid2   uuid;
  v_ci_id   uuid;

  v_hist_conflictos jsonb := '[]'::jsonb;
  v_hist_existente  record;
  v_n int;

  -- CAMBIO 29a: mapa cotizacionId (cleo_id) → oportunidad cleo_id
  v_cot_to_op jsonb := '{}'::jsonb;
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

  -- ── 2. FORMATO ────────────────────────────────────────────────────────────
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
  select ud.updated_at, true
    into v_ud_updated_at, v_ud_exists
    from public.user_data ud
   where ud.user_id = v_uid
     for update;

  if not found then
    if p_ultimo_updated_at is not null then
      return jsonb_build_object('estado','conflicto');
    end if;
    v_ud_exists := false;
  else
    if p_ultimo_updated_at is null then
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
  perform set_config('cleo.procesando_tombstones', 'true', true);

  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id   = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;

  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_recordatorios);
  end if;

  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_oportunidades);
  end if;

  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
  end if;

  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_ventas);
  end if;

  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_pedidos);
  end if;

  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_clientes);
  end if;

  -- ── 6. UPSERT CATÁLOGO SERVICIOS ─────────────────────────────────────────
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

  -- ── CAMBIO 21: UPSERT CATÁLOGO PRODUCTOS con inventario ──────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
       inventario_activo, stock, stock_minimo, costo_config)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
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
      condiciones       = excluded.condiciones,
      inventario_activo = excluded.inventario_activo,
      stock             = excluded.stock,
      stock_minimo      = excluded.stock_minimo,
      costo_config      = excluded.costo_config;
  end loop;

  -- ── CAMBIO 21b: INSERT inventario_movimientos (append-only) ──────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id
       and ci.modo       = 'productos'
       and ci.cleo_id    = (v_it ->> 'id');

    if v_ci_id is null then continue; end if;

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

  -- ── 7. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes', '[]'))
  loop
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
      nombre                        = excluded.nombre,
      empresa                       = excluded.empresa,
      telefono                      = excluded.telefono,
      email                         = excluded.email,
      instagram                     = excluded.instagram,
      messenger                     = excluded.messenger,
      canal                         = excluded.canal,
      origen                        = excluded.origen,
      etapa                         = excluded.etapa,
      fecha_etapa                   = excluded.fecha_etapa,
      estado_prospecto              = excluded.estado_prospecto,
      motivo_perdida                = excluded.motivo_perdida,
      razon_cierre                  = excluded.razon_cierre,
      ultimo_contacto               = excluded.ultimo_contacto,
      notas                         = excluded.notas,
      etiqueta                      = excluded.etiqueta,
      nota_recontacto               = excluded.nota_recontacto,
      fecha_pedido                  = excluded.fecha_pedido,
      servicio_interes              = excluded.servicio_interes,
      items_interes                 = excluded.items_interes,
      mensaje_seguimiento           = excluded.mensaje_seguimiento,
      seguimiento_custom            = excluded.seguimiento_custom,
      seguimiento_fecha             = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
  end loop;

  -- ── 8. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  -- CAMBIO 32: cleo_etapa_to_db normaliza title-case UI → snake_case DB
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;

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
      public.cleo_etapa_to_db(v_it ->> 'etapa'),
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
  end loop;

  -- CAMBIO 29b: construir mapa cotizacionId → oportunidad cleo_id
  v_cot_to_op := '{}'::jsonb;
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'cotizacionId') is not null then
      v_cot_to_op := v_cot_to_op || jsonb_build_object(
        v_it ->> 'cotizacionId', v_it ->> 'id'
      );
    end if;
  end loop;

  -- ── 9. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    v_uuid2 := null;
    declare
      v_es_indep boolean;
      v_op_cleo  text;
    begin
      -- CAMBIO 29c: lookup multi-op primero; fallback heredado para oportunidades migradas
      v_op_cleo := v_cot_to_op ->> (v_it ->> 'id');
      if v_op_cleo is null then
        v_es_indep := (v_it ->> 'vinculadaOportunidadActual') = 'false'
                      or (v_it -> 'vinculadaOportunidadActual') = 'false'::jsonb;
        v_op_cleo  := case when v_es_indep
                        then 'op_cotindep_' || (v_it ->> 'id')
                        else 'op_cli_'      || (v_it ->> 'clienteId')
                      end;
      end if;
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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
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

    exception when unique_violation then
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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

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
      case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_it -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end
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
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

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
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end
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
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then
          continue;
        end if;

        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then
          v_rec_cat := 'sin_clasificar';
        end if;

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
          oportunidad_id        = excluded.oportunidad_id,
          oportunidad_vinculada = excluded.oportunidad_vinculada,
          categoria             = excluded.categoria,
          texto                 = excluded.texto,
          fecha                 = excluded.fecha,
          completado            = excluded.completado,
          estatus               = excluded.estatus,
          es_personalizada      = excluded.es_personalizada,
          origen                = excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 13. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
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

        select h.tipo, h.resultado, h.monto into v_hist_existente
          from public.historial_contactos h
         where h.negocio_id = v_neg_id
           and h.cleo_id    = v_h_cleo_id
         limit 1;

        if not found then
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
          if v_hist_existente.tipo      is distinct from v_h_tipo
          or v_hist_existente.resultado is distinct from (v_sub ->> 'resultado')
          or v_hist_existente.monto     is distinct from (v_sub ->> 'monto')::numeric
          then
            v_hist_conflictos := v_hist_conflictos || jsonb_build_array(
              jsonb_build_object(
                'cleo_id',       v_h_cleo_id,
                'tipo_nuevo',    v_h_tipo,
                'tipo_guardado', v_hist_existente.tipo,
                'mensaje', 'historial_contactos inmutable: contenido distinto para el mismo id'
              )
            );
          end if;
        end if;
      end;
    end loop;
  end loop;

  -- ── 14. UPSERT ARCHIVO_ADJUNTOS ───────────────────────────────────────────
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
  raise;

end;
$func$;
revoke execute on function public.cleo_dual_flush(jsonb, text, timestamptz) from public;
grant  execute on function public.cleo_dual_flush(jsonb, text, timestamptz) to authenticated;


-- ── Verificación ──────────────────────────────────────────────────────────────
select
  proname as funcion,
  pg_get_functiondef(oid) like '%cleo_etapa_to_ui%' as tiene_mapeo_read,
  pg_get_functiondef(oid) like '%cleo_etapa_to_db%' as tiene_mapeo_flush
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cleo_dual_read','cleo_dual_flush','cleo_etapa_to_ui','cleo_etapa_to_db')
order by proname;

-- Resultado esperado:
--   cleo_dual_flush  | false | true
--   cleo_dual_read   | true  | false
--   cleo_etapa_to_db | false | false  (función helper)
--   cleo_etapa_to_ui | false | false  (función helper)
