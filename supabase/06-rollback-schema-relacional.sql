-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- Reversión completa del esquema relacional.
-- Ejecutar SOLO si se necesita deshacer 03-schema-relacional.sql.
-- NO afecta user_data ni legal_acceptances (01-pruebas-guardado.sql).
--
-- ADVERTENCIA: elimina TODAS las tablas relacionales, funciones y el rol
-- cleo_service.  Los datos migrados en estas tablas se perderán.
-- Hacer respaldo antes si es necesario.
--
-- VERIFICACIÓN DEL DESTINO
-- ─────────────────────────────────────────────────────────────────────────────
-- Primero ejecuta la consulta diagnóstico de abajo para confirmar que
-- app.settings.url está disponible en este entorno.  Si devuelve NULL,
-- estás conectado directamente a la base (psql, pgAdmin) y el script
-- se detendrá.  Ejecútalo desde el SQL editor del Dashboard de Supabase.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Diagnóstico previo — ejecutar antes del rollback ─────────────────────────
-- Debe devolver la URL completa del proyecto.
-- Si devuelve NULL: no puedes ejecutar el rollback desde esta conexión.
select
  current_setting('app.settings.url', true) as url_configurada,
  case
    when current_setting('app.settings.url', true) is null
    then 'BLOQUEADO — app.settings.url no disponible en esta conexión'
    when current_setting('app.settings.url', true) = 'https://pconfadsbtwjbjeblxgl.supabase.co'
    then 'OK — proyecto CLEO Pruebas'
    else 'ERROR — proyecto incorrecto: ' || current_setting('app.settings.url', true)
  end as estado;
-- Si estado ≠ 'OK — proyecto CLEO Pruebas': no continúes.


-- ── Rollback (solo si el diagnóstico anterior devolvió OK) ───────────────────
do $$
declare
  v_url         text;
  v_project_ref text;
begin

  -- ── Guard 1: app.settings.url disponible ──────────────────────────────────
  v_url := current_setting('app.settings.url', true);

  if v_url is null then
    raise exception
      'ABORTADO — app.settings.url no está disponible en esta conexión. '
      'app.settings.url es configurado por PostgREST; no está presente en '
      'conexiones directas (psql, pgAdmin, connection pooler). '
      'Ejecuta desde el SQL editor del Dashboard de Supabase.';
  end if;

  -- ── Guard 2: URL exacta, sin sufijos ni variantes aceptadas ───────────────
  -- El regex ancla inicio (^) y fin ($) para rechazar cualquier sufijo.
  -- Solo acepta exactamente 'https://pconfadsbtwjbjeblxgl.supabase.co'
  -- con barra final opcional.
  v_project_ref := (regexp_match(v_url, '^https://([a-z0-9]+)\.supabase\.co/?$'))[1];

  if v_project_ref is distinct from 'pconfadsbtwjbjeblxgl' then
    raise exception
      'ABORTADO — URL no coincide con CLEO Pruebas. '
      'Ref extraído: [%] | URL completa recibida: [%]. '
      'Esperado exactamente: https://pconfadsbtwjbjeblxgl.supabase.co',
      coalesce(v_project_ref, 'no extraíble — URL tiene formato inesperado'),
      v_url;
  end if;

  -- ── Guard 3: verificar que hay algo que revertir ──────────────────────────
  -- RETURN detiene el bloque completo; todos los DROP están dentro.
  if to_regclass('public.negocios') is null then
    raise notice
      'El esquema relacional no existe o ya fue revertido. No hay nada que hacer.';
    return;
  end if;

  raise notice 'Proyecto verificado [%]. Iniciando reversión...', v_project_ref;

  -- ── Políticas de Storage ──────────────────────────────────────────────────
  drop policy if exists "storage: subir archivo propio"    on storage.objects;
  drop policy if exists "storage: leer archivo propio"     on storage.objects;
  drop policy if exists "storage: eliminar archivo propio" on storage.objects;

  -- ── Tablas en orden inverso de dependencia, sin CASCADE ──────────────────
  -- Dependientes primero: no hay referencias activas al momento de cada DROP.
  drop table if exists public.archivo_adjuntos;
  drop table if exists public.historial_contactos;
  drop table if exists public.recordatorios;
  drop table if exists public.pagos;
  drop table if exists public.ventas;
  drop table if exists public.pedidos;
  drop table if exists public.cotizaciones;
  drop table if exists public.oportunidades;
  drop table if exists public.catalogo_items;
  drop table if exists public.clientes;
  drop table if exists public.negocios;   -- última; ya sin referencias activas

  -- ── Funciones ─────────────────────────────────────────────────────────────
  -- Los triggers se eliminaron con sus tablas.
  -- Orden: funciones de reapertura antes de sus dependencias (auth_negocio_id).
  drop function if exists public.cleo_reabrir_cotizacion(text);
  drop function if exists public.cleo_reabrir_pedido(text);
  drop function if exists public.cleo_guard_cotizacion_snapshots();
  drop function if exists public.cleo_guard_pedido_snapshots();
  drop function if exists public.cleo_guard_negocios_reserved();
  drop function if exists public.cleo_guard_oportunidad_identidad();
  drop function if exists public.cleo_guard_oportunidad_etapa_modo();
  drop function if exists public.cleo_guard_cotizacion_origen();
  drop function if exists public.cleo_guard_pedido_origen();
  drop function if exists public.cleo_guard_seguimiento_origen();
  drop function if exists public.auth_negocio_id();
  drop function if exists public.cleo_set_updated_at();

  -- ── Rol de servicio ───────────────────────────────────────────────────────
  -- Antes de DROP ROLE, revocar los permisos residuales que no desaparecen
  -- con las tablas: USAGE en schema y la membresía de postgres en cleo_service
  -- (concedida en 03-schema-relacional.sql para la transferencia de propiedad).
  revoke all on schema public from cleo_service;
  revoke cleo_service from postgres;

  -- DROP ROLE es a nivel de cluster; en Supabase cada proyecto es su propio
  -- cluster, así que no afecta otros proyectos.
  -- IF EXISTS evita error si el rol ya fue eliminado manualmente.
  drop role if exists cleo_service;

  raise notice 'Reversión completada.';

end;
$$;


-- ── Verificación post-reversión ───────────────────────────────────────────────
-- Tablas relacionales: deben devolver 0 filas.
-- user_data y legal_acceptances: deben seguir presentes.
-- cleo_service: no debe aparecer en pg_roles.
select relname as tabla,
       case when relname in ('user_data','legal_acceptances')
            then 'OK (debe estar)'
            else 'PRESENTE — revisar'
       end as estado
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'negocios','clientes','oportunidades','cotizaciones','pedidos','ventas',
    'pagos','historial_contactos','recordatorios',
    'archivo_adjuntos','catalogo_items',
    'user_data','legal_acceptances'
  )
order by estado, tabla;

select rolname, 'PRESENTE — revisar' as estado
from pg_roles where rolname = 'cleo_service';
-- Si devuelve 0 filas: cleo_service fue eliminado correctamente.
