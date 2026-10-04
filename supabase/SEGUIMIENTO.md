# Seguimiento — migración schema relacional CLEO

**Estado general:** `dual10@cleo.test` en modo dual activo. Tests crear ✓ editar ✓ borrar ✓ (fix aplicado 2026-09-30). **Siguiente paso: probar crear/editar/borrar cotización, luego planear migración de datos reales.** No tocar producción.
**Última actualización:** 2026-09-30
**Rama activa:** `fix/proteger-guardado-cleo`

---

## Archivos del conjunto

| Archivo | Propósito | Estado |
|---|---|---|
| `01-pruebas-guardado.sql` | Tablas iniciales (`user_data`, `legal_acceptances`) | Ejecutado en producción (previo a esta migración) |
| `02-auditar-permisos.sql` | Solo lectura — audita permisos actuales | Sin cambios pendientes |
| `03-schema-relacional.sql` | DDL principal — tablas, triggers, funciones | **Ejecutado en CLEO Pruebas** |
| `04-storage-policies.sql` | Políticas de Storage bucket `cleo-cotizacion-archivos` | **Ejecutado en CLEO Pruebas — devolvió las 3 políticas de Storage** |
| `05-tests-aislamiento.sql` | Pruebas de aislamiento, privilegios y snapshots | **Ejecutado en CLEO Pruebas — tests 1–23 pasaron** |
| `06-rollback-schema-relacional.sql` | Reversión completa del schema relacional | Listo — usar solo si se necesita revertir |
| `tests/concurrencia-13.cjs` | Test real de concurrencia FOR UPDATE con dos conexiones Node.js sobre Session Pooler | **Pasó en CLEO Pruebas (2026-09-17)** — requiere CA cert `supabase/certs/supabase-ca.crt` |
| `supabase/certs/supabase-ca.crt` | Certificado CA de Supabase Root 2021 para TLS del Session Pooler | Copiado desde Dashboard CLEO Pruebas |
| `tests/analizar-migracion.cjs` | Analizador de migración de solo lectura — transforma blob en memoria y reporta problemas | **Creado, no revisado ni aprobado para datos reales** |
| `19-inventario-costos.sql` | DDL: columnas inventario/costo en `catalogo_items` + tabla `inventario_movimientos` | **Ejecutado en CLEO Pruebas (2026-09-30)** |
| `20-tests-adicionales-dual.sql` | Tests T16–T20: tipo_perfil productos, tombstone, conflicto, cleo_reabrir_pedido | **Ejecutado en CLEO Pruebas (2026-09-30) — todos pasaron** |
| `21-inventario-flush-read.sql` | `CREATE OR REPLACE` de `cleo_dual_flush` + `cleo_dual_read` con inventario/movimientos | **Ejecutado en CLEO Pruebas (2026-09-30) — tiene_inventario=true en ambas funciones** |
| `22-tests-inventario-dual.sql` | Tests T21a–T21d: flush+read inventario, dedup movimientos, stock=null, mov sin id | **Ejecutado en CLEO Pruebas (2026-09-30) — todos pasaron** |
| `23-schema-patches.sql` | Columnas nuevas aprobadas (notas_prospecto, origen_otro, fecha_hora_entrega/cancelacion, cotizaciones.cantidad, categoria sin_clasificar) | **Ejecutado en CLEO Pruebas (2026-09-30)** |
| `24-copia-inicial.sql` | Copia inicial blob→relacional para `dual10@cleo.test`; idempotente | **Ejecutado y verificado en CLEO Pruebas (2026-09-30)** |
| `25-fix-flush-pedidos-borrados.sql` | Fix: limpia duplicados op_XXX→op_cli_XXX + reemplaza cleo_dual_flush con check de cliente borrado en loops pedidos/cots | **Ejecutado y verificado en CLEO Pruebas (2026-09-30)** |

---

## Lo que está implementado

### `03-schema-relacional.sql`

- Rol `cleo_service` (NOLOGIN) — propietario de las funciones de reapertura
- Tablas: `negocios`, `clientes`, `oportunidades`, `catalogo_items`, `cotizaciones`, `pedidos`, `ventas`, `pagos`, `historial_contactos`, `recordatorios`, `archivo_adjuntos`
- FK compuestas `(cliente_id, negocio_id)` con `DEFERRABLE INITIALLY DEFERRED` — aislamiento entre negocios a nivel de constraint
- `cleo_guard_negocios_reserved()` — protege `schema_ver` y `user_id` de modificación directa por `authenticated`
- `cleo_guard_cotizacion_snapshots()` / `cleo_guard_pedido_snapshots()`:
  - Bloquea toda modificación directa de `items_aceptacion`, `monto_aceptacion`, `versiones_aceptacion` (incluyendo valor→NULL)
  - Excepción: si `current_user = 'cleo_service'` (solo alcanzable desde SECURITY DEFINER)
- `cleo_reabrir_cotizacion(text)` / `cleo_reabrir_pedido(text)`:
  - `SECURITY DEFINER`, owner `cleo_service`
  - Verifica propietario vía `auth_negocio_id()` (lee JWT claims, no se ve afectado por SECURITY DEFINER)
  - `FOR UPDATE` en el SELECT — protección concurrente
  - Archiva snapshot atómicamente en `versiones_aceptacion` / `versiones_confirmacion`
  - Transiciones permitidas: `Aceptada → Enviada` (cotizaciones), `Entregado → Preparando` (pedidos)
- Permisos mínimos para `cleo_service`: `USAGE` en schema, `SELECT/UPDATE` en cotizaciones, pedidos y recordatorios; `SELECT` en oportunidades; `EXECUTE` en `auth_negocio_id()`
- `schema_ver` state machine: `'blob' → 'dual' → 'relacional'`; `authenticated` solo puede insertar `'blob'`

**Nueva entidad `oportunidades` (varias por cliente):**
- Un cliente puede tener múltiples oportunidades activas independientes, cada una con su propio `etapa`, `estatus`, `precio_interes`, `ultimo_contacto`, etc.
- `cleo_guard_oportunidad_identidad()`: `cliente_id`, `negocio_id` y `modo` son inmutables tras INSERT
- `cleo_guard_oportunidad_etapa_modo()`: combinaciones válidas modo×estatus×etapa:
  - Servicios activa → etapa ∈ `{nuevo_contacto, cotizacion_enviada, negociacion}`
  - Servicios ganada → etapa = `ganado`; perdida → `perdido`
  - Productos activa → etapa ∈ `{nueva, en_seguimiento, sin_respuesta}`
  - Productos ganada → etapa = `convertido`; perdida → `perdido`
  - `cancelada` → cualquier etapa del modo correcto
- `oportunidad_id` en cotizaciones/pedidos/recordatorios: nullable FK a oportunidades
  - Coherencia cross-client verificada por triggers `cleo_guard_cotizacion_origen`, `cleo_guard_pedido_origen`, `cleo_guard_seguimiento_origen`
  - `oportunidad_id` es inmutable una vez asignado (no se puede reasignar a otra oportunidad)
  - No se infieren asociaciones por proximidad ni heurísticas automáticas
- `recordatorios` extendida (no reemplazada) con `oportunidad_id`, `estatus` ('pendiente'|'atendido'|'cancelado'), `fecha_atendido`
- Índice único parcial `uq_rec_negocio_cleo_id WHERE cleo_id IS NOT NULL` en recordatorios — permite upsert sin duplicados durante la fase `dual`; múltiples registros sin `cleo_id` coexisten sin conflicto
- Identidad en Hoy = `recordatorio.id`: una oportunidad con dos recordatorios vencidos genera dos cards independientes
- `schema_ver` en negocios gobierna la fuente de verdad por fase; cloudSync.js (no triggers DB) es responsable del echo durante `dual`

### `05-tests-aislamiento.sql` — resultado de ejecución en CLEO Pruebas

**Ejecutado:** 2026-09-17. Resultado: `Success. No rows returned` — todos los tests pasaron.
**Test 13-CONCURRENTE:** Pasó el 2026-09-17 con `tests/concurrencia-13.cjs` (Node.js, dos conexiones PostgreSQL independientes sobre Session Pooler). Bloqueo de B por A confirmado con `pg_blocking_pids`; estatus `Enviada` tras commit de A; `versiones_aceptacion` con exactamente 1 entrada; limpieza completada (cascade verificado). CA: `supabase/certs/supabase-ca.crt`.

- **Tests 1–4:** violaciones de FK compuesta entre negocios con `SET CONSTRAINTS ALL IMMEDIATE`
- **Tests 5–6:** inmutabilidad de snapshots + ciclo `cleo_reabrir_*()` + verificación de estructura (`jsonb_typeof`, `jsonb_array_length`, `->0->>'monto'`)
- **Tests 7–9:** privilegios con JWT claims + `SET LOCAL ROLE authenticated`, controles positivos, 'TEST FALLÓ' fuera del bloque que captura errores esperados
- **Test 10:** `CASCADE DELETE`
- **Tests 11:** `versiones_aceptacion` de solo lectura para el propietario (11a: vaciar bloqueado; 11b: sobrescritura bloqueada)
- **Test 12a:** `UPDATE` directo de `items_aceptacion` bloqueado para `authenticated`
- **Test 12b:** `authenticated` no es miembro de `cleo_service` — verificado con consulta directa a `pg_auth_members`
  - Nota: `SET ROLE` desde `session_user=postgres` no es la verificación adecuada (postgres sí tiene `cleo_service` para la transferencia de propiedad de funciones). La consulta de membresía es inequívoca.
- **Test 13 (SERIAL):** invariante post-commit — dos llamadas consecutivas producen exactamente 1 entrada en `versiones_aceptacion`
  - Encabezado distingue explícitamente qué prueba y qué NO prueba
  - Sección documentada al final del archivo: `PRUEBA REAL CON DOS CONEXIONES (TEST 13-CONCURRENTE)` — procedimiento paso a paso con dos sesiones psql coordinadas + nota sobre alternativa dblink
- **Test 14:** Combinaciones válidas e inválidas modo×estatus×etapa en oportunidades (14a–14e)
- **Test 15:** `cliente_id` y `modo` inmutables en oportunidades tras INSERT (15a–15b)
- **Test 16:** Coherencia cliente↔oportunidad en recordatorios + inmutabilidad `oportunidad_id` (16a–16c)
- **Test 17:** Coherencia cliente↔oportunidad en cotizaciones y pedidos + inmutabilidad (17a–17d)
- **Test 18:** 2 oportunidades × 2 seguimientos cada una + 1 general — aislamiento completo; atender seg_a1 no afecta op_B ni el general
- **Test 19:** ON DELETE SET NULL propagado en cotizacion, pedido y recordatorio sin excepción; `oportunidad_vinculada` persiste `true` en los tres tras el cascade
- **Test 20:** Índice parcial `uq_rec_negocio_cleo_id` — múltiples `NULL` permitidos (20a); duplicado no nulo rechazado (20b)
- **Test 21:** Bypass A→NULL→B bloqueado como `authenticated` con JWT: 21a = NULL manual rechazado (op_A existe); cascade real permitido (op_A borrada); 21b = reasignación a op_B rechazada (`oportunidad_vinculada=true`)
- **Test 22 (22a–22f):** `oportunidad_vinculada` no puede revertirse a false en cotizaciones (22a/22b), pedidos (22c/22d) ni recordatorios (22e/22f); cubre UPDATE solo del flag y UPDATE combinado con reasignación
- **Test 23 (23a–23c):** coherencia cliente↔oportunidad re-verificada cuando `oportunidad_id` no cambia pero sí cambia `cliente_id`; cubre cotizaciones, pedidos y recordatorios como `authenticated`

### `06-rollback-schema-relacional.sql`

- Consulta diagnóstico previa al DO block: comprueba si `app.settings.url` está disponible y si coincide exactamente con CLEO Pruebas
- Guard 1: aborta si `app.settings.url` es NULL (conexión directa sin PostgREST)
- Guard 2: regex anclado `'^https://([a-z0-9]+)\.supabase\.co/?$'` + comparación exacta del ref extraído contra `'pconfadsbtwjbjeblxgl'`
- Todos los DROP dentro del DO block (RETURN detiene el bloque completo)
- `drop table if exists public.oportunidades` en posición correcta (después de cotizaciones/pedidos/recordatorios, antes de clientes)
- DROP FUNCTION para las 5 nuevas funciones guard: `cleo_guard_oportunidad_identidad`, `cleo_guard_oportunidad_etapa_modo`, `cleo_guard_cotizacion_origen`, `cleo_guard_pedido_origen`, `cleo_guard_seguimiento_origen`
- `DROP ROLE IF EXISTS cleo_service`
- Verificación post-reversión: tablas relacionales (incluye `oportunidades`) y pg_roles

---

## Correcciones aplicadas a lo largo de las 4 rondas de revisión

| Problema | Corrección |
|---|---|
| `versiones_aceptacion jsonb[]` vs `jsonb` | Tipo corregido a `jsonb not null default '[]'` |
| Bypass snapshot vía valor→NULL→valor | Trigger bloquea también valor→NULL; solo `cleo_reabrir_*()` puede hacerlo |
| Autorización basada en `is_superuser` | Reemplazado por rol `cleo_service` con NOLOGIN + `current_user = 'cleo_service'` |
| Autorización basada en `app.cleo_reabrir` (session var) | Eliminado; SECURITY DEFINER + owner `cleo_service` es suficiente |
| `RETURN` en DO block no detenía el script | Todos los DROP movidos dentro del DO block |
| URL rollback aceptaba sufijos | Regex anclado + comparación exacta del ref extraído |
| `app.settings.url` asumida como disponible | Diagnostic query + guard 1 explícito si es NULL |
| Falsos positivos en tests 7/8/9 | 'TEST FALLÓ' movido fuera del bloque que captura errores esperados |
| Test 12b: SET ROLE postgres (irrelevante) | Cambiado a SET ROLE cleo_service (frontera real) |
| Test 13: etiqueta ambigua | Renombrado a SERIAL con secciones QUÉ PRUEBA / QUÉ NO PRUEBA + prueba real documentada |
| Múltiples oportunidades por cliente — requisito nuevo | Tabla `oportunidades` añadida; triggers guard de etapa/modo/estatus, identidad e integridad cross-client |
| `seguimientos` como tabla separada | Descartado: `recordatorios` extendida con `oportunidad_id`, `estatus`, `fecha_atendido` |
| Heurística 90 días en migración | Eliminada; asociaciones ambiguas → `oportunidad_id = null`, nunca asignadas por proximidad |
| Sugerencias calculadas duplicando seguimientos | Documentado en comentario del trigger: suprimir sugerencia calculada si ya existe recordatorio pendiente para la oportunidad |
| RLS bloqueaba cleo_service en funciones de reapertura | Políticas `for all to cleo_service using (true)` añadidas en `cotizaciones`, `pedidos`, `oportunidades` y `recordatorios`; `GRANT cleo_service TO postgres` para transferencia de propiedad; `GRANT CREATE ON SCHEMA public TO cleo_service` requerido por PG para `ALTER FUNCTION ... OWNER TO cleo_service` |
| `UNIQUE NULLS NOT DISTINCT` en recordatorios | Reemplazado por índice único parcial `WHERE cleo_id IS NOT NULL`; múltiples NULL por negocio son válidos |
| Bypass A→NULL→B en triggers de inmutabilidad | `oportunidad_vinculada boolean not null default false` añadido a cotizaciones, pedidos y recordatorios. El trigger detecta cascade real verificando si la oportunidad aún existe; si existe y new.oportunidad_id=NULL → rechazado. Si oportunidad_vinculada=true → reasignación bloqueada incluso cuando oportunidad_id=NULL |
| Permisos residuales antes de DROP ROLE en rollback | Añadidos `REVOKE ALL ON SCHEMA PUBLIC FROM cleo_service` y `REVOKE cleo_service FROM postgres` antes del DROP ROLE |
| Test 12b: SET ROLE desde session_user=postgres + sin membresías transitivas | Reemplazado por CTE recursiva sobre `pg_auth_members`; verifica membresía directa e indirecta. Documenta que verifica configuración de roles, no acceso por API |
| Test 18: op_B solo tenía 1 seguimiento | Ampliado a 2 seguimientos por oportunidad; conteos y aserciones actualizados |
| Test 19: faltaban pedidos | Añadido `v_ped_id`; verifica que pedido.oportunidad_id queda NULL tras cascade y que oportunidad_vinculada persiste en los tres documentos |
| Test 21: bypass A→NULL→B no verificado como authenticated | Añadido test 21 (21a: NULL manual bloqueado; cascade permitido; 21b: reasignación a op_B bloqueada) ejecutado como authenticated con JWT válido |
| oportunidad_vinculada reversible (hueco en triggers) | Guarda añadida al inicio de los tres triggers de origen, antes del early return. Bloquea SET oportunidad_vinculada=false cuando old.oportunidad_vinculada=true; cubre también el UPDATE combinado con oportunidad_id. Test 22 cubre los tres tipos de documento (22a–22f) |
| Early return omitía coherencia cuando cliente_id/negocio_id cambia con oportunidad_id fijo | Bloque de re-verificación explícito añadido antes del early return en los tres triggers: si oportunidad_id no cambia pero es no nulo y cambia cliente_id o negocio_id, re-ejecuta la consulta de coherencia. Test 23 (23a–23c) cubre los tres tipos de documento |
| Datos de prueba inválidos (primera ejecución en CLEO Pruebas) | `clientes.cleo_id NOT NULL` sin default faltaba en tests 1, 2, 4, 9, 10 → añadido con valor `_tN_cli[_x]`. `historial_contactos`: columna `nota` no existe (corregida a `descripcion`) y valor `'nota'` no válido para `tipo` (corregido a `'contacto'`) en tests 4, 9, 10 |

---

## Próximo paso inmediato

**Revisar `tests/analizar-migracion.cjs` antes de usarlo con datos reales.** El analizador fue creado y verificado con datos ficticios (`--test`), pero no ha sido revisado ni aprobado. Antes de apuntarlo a un blob real de CLEO Pruebas:
- Confirmar que los campos conocidos por entidad coinciden con el blob real (pueden existir campos no contemplados).
- Confirmar que la lógica de ambigüedad de oportunidades (`vinculadaOportunidadActual`) es correcta para los datos reales.
- Confirmar que los sets de valores aceptados (estatus, tipos, categorías) están completos.
- La migración de datos sigue sin ejecutar ni autorizar.

---

## Pendientes de esta etapa (pruebas del esquema)

1. **`cleo_reabrir_pedido` + rechazo cross-negocio:** Cubiertos en `20-tests-adicionales-dual.sql` (T20a + T20b). **Pendiente de ejecutar en CLEO Pruebas.** T20b requiere que `copia09@cleo.test` exista en auth.users; si no existe hace SKIP.

2. **Tests adicionales dual flush:** `20-tests-adicionales-dual.sql` — **Ejecutado en CLEO Pruebas (2026-09-30). T16–T20 pasaron.**
   - T16: `tipo_perfil='productos'` + oportunidad modo=productos + pedido vinculado ✓
   - T17: tombstone oportunidad con pedido → SET NULL en pedido (complementa T08 que solo cubre cotizaciones) ✓
   - T18: recordatorio borrado del blob sin tombstone → persiste en DB ✓
   - T19: resolución de conflicto "conservar local" — cleo_dual_read + reintento con timestamp correcto ✓
   - T20a: `cleo_reabrir_pedido` Entregado → Preparando + snapshot archivado ✓
   - T20b: rechazo cross-negocio de `cleo_reabrir_pedido` ✓

## Etapas siguientes (fuera del alcance actual)

2. **Migración de datos — copia inicial:** Poblar tablas relacionales a partir del blob; `schema_ver` permanece `'blob'`. La app no cambia su comportamiento. Diseño en §Diseño de migración de datos. **Requiere autorización explícita; no ejecutar hasta que el diseño esté aprobado.**

3. **Migración de datos — activación (`schema_ver` → `'dual'`):** Hacer que las tablas relacionales sean la fuente de verdad para entidades nuevas. **No avanzar hasta que:** (a) cloudSync implemente el echo blob→tablas; (b) esté definido cómo tratar versiones antiguas de la app; (c) el caso de prueba del guardado esperando el bloqueo haya pasado. Etapa separada de la copia inicial.

4. **Sincronización (`cloudSync.js`):** Requiere implementar el echo blob→tablas relacionales para la fase `dual`. **No modificar hasta que la copia inicial esté ejecutada y el diseño del echo esté aprobado.** Prerequisito de la activación.

5. **Integración con Hoy:** conectar la vista de seguimiento diario con `recordatorios` vinculados a `oportunidades`; suprimir sugerencias calculadas cuando ya existe un recordatorio pendiente para la oportunidad.

---

## Restricciones que deben mantenerse

- **No ejecutar SQL en producción.** CLEO Pruebas es el único entorno autorizado para esta rama.
- **No modificar `cloudSync.js`** hasta que el diseño de migración esté aprobado y ejecutado en CLEO Pruebas.
- El build en esta rama solo funciona en Vercel Preview con credenciales de CLEO Pruebas (guard en `scripts/check-preview.cjs`). No modificar ese guard.
- **Stripe fuera del alcance actual.** No implementar hasta decisión explícita.
- **Inventario y costos en tablas:** `19`, `21` y `22` ejecutados y verificados. La capa SQL de inventario está completa.

---

## Nota para retomar (2026-09-18)

**Dónde quedamos:** Pruebas SQL (1–23) y test real de concurrencia (13-CONCURRENTE) pasaron en CLEO Pruebas. La migración de datos y la integración con la aplicación no se han ejecutado ni modificado.

**Qué se hizo en esta sesión:**
- Se corrigió la interpretación de "0 filas afectadas" en el UPDATE post-bloqueo de cloudSync: en la prueba controlada se espera 1 fila; en uso real, 0 filas es un conflicto para investigar, no evidencia de escritura durante el lock (FOR UPDATE lo impide). No sobrescribir ni reintentar a ciegas.
- Se creó `tests/analizar-migracion.cjs` — analizador de solo lectura que transforma una copia local del blob JSON en memoria y reporta campos sin correspondencia, relaciones ambiguas, duplicados, diferencias de importes y referencias huérfanas. Verificado con `--test` (datos ficticios). Salida limpia, código de salida 0 sin errores bloqueantes / 1 con errores.

**Primer paso al retomar:** Revisar `tests/analizar-migracion.cjs` con el contexto del blob real (campos presentes, valores de estatus y tipos usados en producción, lógica de vinculadaOportunidadActual). El analizador no está aprobado para usarse con datos reales hasta esa revisión. La migración sigue bloqueada hasta que el diseño esté aprobado.

---

## Diseño de migración de datos (blob → relacional)

**Estado:** diseño para revisión — no ejecutado, no autorizado.
**No modificar `cloudSync.js` hasta que el diseño esté aprobado.**

### Control de avance: schema_ver

`negocios.schema_ver` controla la fuente de verdad por usuario:
- `'blob'`: tablas relacionales vacías; solo `user_data` se usa.
- `'dual'`: tablas relacionales son fuente de verdad para entidades nuevas; `cloudSync.js` escribe en ambas (echo). Entidades no migradas tienen `oportunidad_id = NULL`.
- `'relacional'`: tablas relacionales son la única fuente de verdad; campos legacy del cliente se conservan solo para lectura histórica.

El avance de `schema_ver` ocurre en dos TX independientes (ver §Transacciones y recuperación ante fallos):
- **Copia inicial**: pobla tablas relacionales; `schema_ver` permanece `'blob'`.
- **Activación** (TX separada): `UPDATE negocios SET schema_ver='dual'`; requiere prerequisitos implementados y probados.

Solo `service_role` (o `postgres`) puede avanzar `schema_ver` — el guard `cleo_guard_negocios_reserved` bloquea cualquier intento de `'authenticated'`.

### Orden de inserción (dependencias FK)

1. `negocios` — de `cleo_perfil` + `cleo_productos` + claves UI
2. `clientes` — de `cleo_clientes`
3. `catalogo_items` — de `cleo_servicios` (modo='servicios') + `cleo_productos_cat` (modo='productos')
4. `oportunidades` — solo casos no ambiguos (ver §Relaciones ambiguas)
5. `cotizaciones` — de `cleo_cots`; asigna `oportunidad_id` donde corresponde
6. `pedidos` — de `cleo_pedidos`
7. `ventas` — de `cleo_ventas`
8. `pagos` — de `pagos[]` embebidos en cots, pedidos, ventas
9. `historial_contactos` — de `cliente.historialContactos[]`; lookup de `cotizacion_id` por `cleo_id`
10. `recordatorios` — de `cliente.recordatorios[]`
11. `archivo_adjuntos` — de `cotizacion.archivoAdjunto` / `pedido.archivoAdjunto`

### Correspondencia de campos

#### cleo_perfil → negocios

| Campo blob | Columna | Notas |
|---|---|---|
| nombre | nombre | |
| tuNombre | nombre_contacto | |
| tipoPerfil | tipo_perfil | también en `cleo_tipo_perfil` |
| telefono | telefono | |
| email | email | |
| color | color | |
| colorSecundario | color_sec | |
| banco | banco | |
| bancoaccount | cuenta | |
| bancoclabe | clabe | |
| bancotitular | titular | |
| moneda | moneda | |
| logo, mensaje, condicionesPago, redes, direccion… | config jsonb | campos de marca/display sin queries sobre ellos |
| modoDemo, ultimaVez… | — | no migrar |

`cleo_productos` (string[]) → `negocios.productos`  
`cleo_alertas_cerradas` → `negocios.datos_ui.alertas_cerradas`  
`cleo_etapas_vistas` → `negocios.datos_ui.etapas_vistas`  
`cleo_streak_accion_prod` → `negocios.datos_ui.streak_prod`  
`cleo_streak_accion_serv` → `negocios.datos_ui.streak_serv`  
`cleo_data_version` → no migrar (marcador de versión de app)

#### cleo_clientes → clientes

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| nombre | nombre | |
| negocio | empresa | nombre del negocio del cliente (no nuestro negocio) |
| contacto | telefono | campo 'contacto' en formVacio |
| email | email | |
| instagram | instagram | |
| messenger | messenger | |
| canalPrincipal | canal | |
| origen | origen | |
| etapa | etapa | etapa de pipeline (Servicios) |
| fechaEtapa | fecha_etapa | |
| estadoProspecto | estado_prospecto | |
| motivoPerdida | motivo_perdida | |
| razonCierre | razon_cierre | array |
| ultimoContacto | ultimo_contacto | |
| notas | notas | |
| etiqueta | etiqueta | |
| notaRecontacto | nota_recontacto | |
| fechaPedido | fecha_pedido | |
| servicioInteres | servicio_interes | |
| itemsInteres | items_interes | jsonb |
| mensajeSeguimiento | mensaje_seguimiento | |
| seguimientoCustom | seguimiento_custom | |

`historialContactos[]` → `historial_contactos` (ver abajo)  
`recordatorios[]` → `recordatorios` (ver abajo)

#### historialContactos → historial_contactos

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | puede faltar en registros viejos |
| tipo | tipo | CHECK: precio_enviado, consulta_registrada, consulta_actualizada, contacto |
| descripcion | descripcion | |
| monto | monto | solo para tipo='precio_enviado' |
| cotizacionId | cotizacion_id | lookup por cleo_id; NULL si la cot fue borrada |
| fecha | fecha | |

**Validación:** tipo fuera del set → decidir mapeo ('contacto') o saltar el registro antes de ejecutar.

#### recordatorios → recordatorios

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | puede ser null en registros viejos |
| categoria | categoria | CHECK: pipeline, postventa, reactivacion, manual |
| texto | texto | |
| fecha | fecha | |
| completado | completado | |
| — | estatus | derivar: completado=true → 'atendido'; si no → 'pendiente' |
| fechaAtendido (si existe) | fecha_atendido | |
| esPersonalizada | es_personalizada | |
| origen | origen | |
| — | oportunidad_id | NULL (sin vínculo declarado en el blob) |

#### cleo_servicios / cleo_productos_cat → catalogo_items

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| nombre | nombre | |
| precio | precio | |
| descripcion | descripcion | |
| condiciones | condiciones | |
| — | modo | 'servicios' / 'productos' según la key de origen |

Unicidad: `(negocio_id, modo, cleo_id)` — evita colisiones entre los dos catálogos si comparten IDs.

#### cleo_cots → cotizaciones

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| clienteId | cliente_id | lookup; NULL si cliente no existe |
| items | items | jsonb, mantener tal cual |
| subtotal | subtotal | |
| total | monto | |
| descuento | descuento | |
| tipoDescuento | tipo_descuento | |
| anticipo | anticipo | |
| fechaAnticipo | fecha_anticipo | |
| vigencia | vigencia | |
| vigenciaDias | vigencia_dias | |
| tipoPago | tipo_pago | |
| condicionesServicio | sv_condiciones | |
| condicionesServicioHTML | sv_condiciones_html | |
| notas | notas | |
| etiqueta | etiqueta | |
| estatus | estatus | CHECK: Borrador, Pendiente, Enviada, Aceptada, Rechazada, Cancelada |
| fecha | fecha | |
| fechaEnvio | fecha_envio | |
| fechaCierre | fecha_cierre | |
| fechaHoraCierre | fecha_hora_cierre | |
| fechaRechazo | fecha_rechazo | |
| fechaHoraRechazo | fecha_hora_rechazo | |
| itemsAceptacion | items_aceptacion | |
| montoAceptacion | monto_aceptacion | |
| historialAceptacion | versiones_aceptacion | |
| postvPago | postv_pago | |
| postvSeguimiento | postv_seguimiento | |
| vinculadaOportunidadActual | — | ver §Relaciones ambiguas |
| pagos[] | → pagos | ver §Pagos |

#### cleo_pedidos → pedidos

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| clienteId | cliente_id | lookup |
| cotizacionId | cotizacion_id | lookup |
| items | items | jsonb |
| productos | productos | string resumen |
| cantidad | cantidad | |
| montoTotal | monto_total | |
| notas | notas | |
| etiqueta | etiqueta | |
| estado | estado_pedido | lowercase: Preparando→preparando, Entregado→entregado, Cancelado→cancelado |
| fecha | fecha | |
| fechaEntrega | fecha_entrega | |
| fechaCancelacion | fecha_cancelacion | |
| antiocitoConservado | anticipo_conservado | posible typo en blob — verificar nombre real |
| motivoCancelacion | motivo_cancelacion | |
| motivoCancelacionLado | motivo_cancelacion_lado | CHECK: cliente, negocio |
| itemsConfirmacion | items_confirmacion | |
| montoConfirmacion | monto_confirmacion | |
| historialConfirmacion | versiones_confirmacion | |
| postvPago | postv_pago | |
| postvSeguimiento | postv_seguimiento | |
| origen | origen_venta | registro_manual, oportunidad, venta_rapida |

#### cleo_ventas → ventas

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| clienteId | cliente_id | lookup |
| concepto | concepto | |
| items | items | jsonb |
| monto | monto | |
| tipo | tipo | normal, rapida |
| notas | notas | |
| etiqueta | etiqueta | |
| fecha | fecha | |
| fechaHora | fecha_hora | |
| postvPago | postv_pago | |
| postvSeguimiento | postv_seguimiento | |

#### Pagos (embebidos en cots, pedidos, ventas) → pagos

| Campo blob | Columna | Notas |
|---|---|---|
| id | cleo_id | |
| monto | monto | |
| fecha | fecha | |
| fechaHoraPago | fecha_hora_pago | |
| concepto | concepto | |
| — | cotizacion_id / pedido_id / venta_id | según documento padre; solo uno no nulo |

### Relaciones ambiguas: oportunidades

#### Modo Productos — conversión del estado histórico

Cada cliente con `tipoPerfil='productos'` genera exactamente una oportunidad en la migración. Esto es una regla de conversión del estado histórico del blob: `estadoProspecto` representaba una única oportunidad por cliente en el modelo anterior. No es una restricción del nuevo modelo, que permite múltiples oportunidades independientes por cliente. Las oportunidades creadas en fase `dual` no tienen ningún límite de cantidad por cliente.

| estadoProspecto | estatus | etapa |
|---|---|---|
| 'Nueva' / null / vacío | activa | nueva |
| 'En seguimiento' | activa | en_seguimiento |
| 'Sin respuesta' | activa | sin_respuesta |
| 'Convertido' | ganada | convertido |
| 'Perdido' | perdida | perdido |

- `titulo` ← `servicioInteres`, o primer ítem de `itemsInteres`, o `''`
- `precio_interes` ← `precioInteres` (si existe)
- `fecha` ← `created_at` del cliente
- `origen_migracion = 'migrada_producto'`

#### Modo Servicios — cotizaciones independientes (1:1)

Cotizaciones con `vinculadaOportunidadActual = false`:

- Crea una oportunidad por cotización (modo='servicios')
- estatus/etapa derivados del estatus de la cotización:
  - Borrador/Pendiente → activa, nuevo_contacto
  - Enviada → activa, cotizacion_enviada
  - Aceptada → ganada, ganado
  - Rechazada/Cancelada → perdida, perdido
- `titulo` ← primer ítem de `cotizacion.items`, o `''`
- `precio_interes` ← `cotizacion.monto`
- `origen_migracion = 'migrada_cotindep'`
- `cotizacion.oportunidad_id` ← UUID recién creado; `cotizacion.oportunidad_vinculada = true`

#### Modo Servicios — cotizaciones vinculadas (ambiguo, sin resolución automática)

Cotizaciones con `vinculadaOportunidadActual = true` o `undefined` no tienen un grupo de oportunidad unívoco. Dos cotizaciones del mismo cliente con esta marca pueden pertenecer a la misma negociación o a dos distintas; el blob no lo indica.

**Decisión de diseño:**
- Estas cotizaciones migran con `oportunidad_id = NULL` y `oportunidad_vinculada = false`.
- El campo `origen_migracion = 'migrada_vinculada'` en la cotización; no se crea ninguna oportunidad.
- El cliente conserva su `etapa` original en `clientes.etapa`; el usuario crea oportunidades y asigna cotizaciones manualmente desde la UI durante la fase `dual`.
- **No se infieren asociaciones por heurística ni por proximidad de fechas.**

#### Recordatorios → oportunidades

Todos migran con `oportunidad_id = NULL`. No hay campo en el blob que vincule un recordatorio a una negociación específica.

### Validaciones previas al insert

Ejecutar como lectura sobre el blob antes de escribir nada:

1. **cleo_id único** dentro de cada colección (cleo_clientes, cleo_cots, cleo_pedidos, cleo_ventas) — duplicados bloquean la migración del usuario.
2. **estadoProspecto** en Productos: valores fuera de {'Nueva','En seguimiento','Sin respuesta','Convertido','Perdido', null} → registrar; no migrar esa oportunidad.
3. **etapa** (Servicios): valores fuera de {'nuevo_contacto','cotizacion_enviada','negociacion','ganado','perdido', null} → registrar; no migrar ese campo.
4. **historialContactos.tipo** fuera del set CHECK → decidir mapeo a 'contacto' o saltar el registro; consignar en audit log.
5. **clienteId dangling**: cots/pedidos/ventas que referencian clientes no existentes → migrar con `cliente_id = NULL`.
6. **cotizacionId dangling** en historialContactos → migrar con `cotizacion_id = NULL`.
7. **estado_pedido** values: asegurar lowercase antes del INSERT.
8. **Pagos sin monto o fecha** → saltar el pago; no bloquear la migración del documento padre.
9. **Nombre del campo antioco/anticito** en pedidos → verificar nombre real en el blob antes de mapear.

### Transacciones y recuperación ante fallos

#### Fase 1 — Copia inicial (schema_ver permanece 'blob')

- **Una transacción por usuario.** La TX captura el blob con `SELECT data, updated_at FROM user_data WHERE user_id = $1 FOR UPDATE`, inserta en tablas relacionales y hace COMMIT. **`schema_ver` permanece `'blob'` al terminar esta TX.** Si algo falla: ROLLBACK completo; el usuario queda en `'blob'` y puede reintentarse.

- **FOR UPDATE protege durante la TX; no después.** El bloqueo impide que cloudSync escriba mientras se leen y migran los datos. Pero un guardado que estaba esperando ejecutará su UPDATE inmediatamente después del COMMIT. Si entre el `FOR UPDATE` y ese UPDATE posterior el usuario realizó cambios (en otro dispositivo o pestaña), `user_data.data` quedará más actualizado que lo que se insertó en tablas relacionales. Esto es aceptable en la fase de copia: el blob sigue siendo la única fuente activa, las tablas son una referencia inerte. El diff debe registrarse en el audit log; no hay divergencia activa porque `schema_ver` no cambió.

  Verificación: la copia no escribe en `user_data`, por lo que `updated_at` no cambia durante la TX. El UPDATE de cloudSync posterior usa el mismo `updated_at` que vio antes del bloqueo y debe afectar exactamente 1 fila en la prueba controlada (sin escritores concurrentes, con la versión esperada). En uso real, 0 filas afectadas no prueba que alguien escribió durante el bloqueo — FOR UPDATE lo habría impedido. Las causas posibles incluyen un cambio que ocurrió fuera del window del lock, desfase de reloj u otro error no anticipado. Nunca sobrescribir ni reintentar a ciegas: registrar en el audit log, marcar para revisión y dejar el blob como fuente activa.

- **Idempotencia con detección de conflictos.** `schema_ver = 'dual'` o `'relacional'` → skip (activación ya ocurrió). Para re-ejecuciones de la copia, `ON CONFLICT DO NOTHING` no es suficiente porque enmascara dos casos distintos:
  - **No-op real**: fila existente con contenido idéntico → registrar como "ya existía, sin cambio" y continuar.
  - **Conflicto de contenido**: fila existente con campos distintos → registrar como "CONFLICTO DE CONTENIDO" con los campos que difieren y **no sobrescribir**. La copia falla para ese usuario; requiere revisión manual.
  
  Mecanismo: `INSERT ... ON CONFLICT (negocio_id, cleo_id) DO NOTHING`; si rowCount < registros esperados, leer las filas omitidas y comparar campo a campo. Nunca omitir datos en silencio.

- **Audit log externo.** Por cada usuario: conteos de filas insertadas, dangling refs, valores fuera de set, no-ops reales, conflictos de contenido y diffs post-guardado (blob capturado vs. blob final después del UPDATE de cloudSync). Fuera de la TX del usuario para no perderlos en ROLLBACK.

#### Fase 2 — Activación (schema_ver 'blob' → 'dual')

Fase separada, TX independiente. **No ejecutar hasta que se cumplan todos los prerequisitos.**

- **Prerequisitos antes de activar:**
  1. Copia inicial ejecutada y auditada para el usuario.
  2. El echo blob→tablas está implementado en cloudSync y probado.
  3. Está definido y probado el tratamiento de versiones antiguas de la app (ver punto siguiente).
  4. El caso de prueba del guardado esperando el bloqueo pasó sin divergencia silenciosa.

- **Versiones antiguas de la app.** Una versión anterior solo escribe el blob; no actualiza tablas relacionales. Si escribe tras activar `schema_ver='dual'`, las tablas quedan silenciosamente desactualizadas. Opciones a decidir: (a) rechazar la escritura detectando una versión de app incompatible en el payload de cloudSync; (b) diseñar el echo para reconstruir los cambios a partir de la diferencia entre el blob nuevo y el anterior; (c) forzar recarga de la app antes de activar. Ninguna opción está implementada; **decisión pendiente antes de la Fase 2**.

- **`schema_ver` como gate.** `UPDATE negocios SET schema_ver='dual'` es el único statement de la TX de activación. Es el gate que la app y cloudSync consultan para saber si las tablas relacionales están activas. Solo se ejecuta una vez confirmados todos los prerequisitos.

### Caso de prueba: guardado de cloudSync esperando el bloqueo

Propósito: verificar que un guardado de cloudSync que esperó el bloqueo de la copia no produce divergencia silenciosa ni avance inadvertido de `schema_ver`. Debe ejecutarse en CLEO Pruebas antes de autorizar la activación.

**Escenario:**
1. La app de CLEO Pruebas está activa en el dispositivo A; cloudSync está a punto de disparar su ciclo de 5 s con cambios pendientes.
2. El proceso de migración abre la TX y ejecuta `SELECT data, updated_at FROM user_data WHERE user_id = $1 FOR UPDATE`.
3. cloudSync intenta `UPDATE user_data SET data = ... WHERE user_id = $1 AND updated_at = $2` — bloquea esperando el lock.
4. La TX inserta en tablas relacionales y hace COMMIT. `schema_ver` permanece `'blob'`.
5. El UPDATE de cloudSync se desbloquea y ejecuta; `user_data.data` refleja el estado más reciente de localStorage.

**Verificaciones esperadas:**
- `user_data.data` post-guardado coincide con el localStorage del dispositivo A al momento del paso 5.
- Las tablas relacionales contienen los datos del blob capturado en el paso 2; pueden diferir si hubo cambios entre el paso 2 y el paso 5. El diff aparece en el audit log.
- `negocios.schema_ver` sigue siendo `'blob'`; la app no cambia su comportamiento.
- El UPDATE de cloudSync en el paso 5 afecta exactamente 1 fila (no 0); `updated_at` de la fila no cambió durante la TX de migración.

**El test falla si:**
- `schema_ver` avanzó a `'dual'` como parte de la copia.
- La divergencia blob/tablas (si existe) quedó sin registrar en el audit log.
- El UPDATE de cloudSync afectó 0 filas. En esta prueba controlada (un solo dispositivo, sin escritores concurrentes, versión esperada correcta) el resultado esperado es 1 fila; 0 filas indica algo inesperado que debe investigarse. No interpretar automáticamente como escritura concurrente durante el bloqueo — eso no es posible con FOR UPDATE activo. Registrar, no sobrescribir, no reintentar a ciegas.

---

## Notas de diseño para futuras ampliaciones

**`schema_ver` solo señala el modelo activo.**
El campo `schema_ver` en `negocios` ('blob' → 'dual' → 'relacional') indica qué capa es fuente de verdad en cada fase. No define por sí mismo cómo se transforman ni sincronizan los datos — ese proceso de migración está pendiente de diseño y no queda decidido que sea responsabilidad exclusiva de `cloudSync.js`.

**Suscripción futura de CLEO separada de los pagos comerciales.**
Si en el futuro se incorpora Stripe para la suscripción del emprendedor a CLEO, esa tabla (p. ej. `suscripciones_cleo`) debe vincularse a `negocios.id` (`negocio_id`). El `user_id` del negocio será el responsable de facturación, pero no es la única identidad de la suscripción — el negocio como entidad es el ancla. La tabla `pagos` ya existente es para los pagos que los clientes del emprendedor le hacen a él — datos comerciales dentro del tenant. Nunca mezclar ambos conceptos en la misma tabla ni en la misma FK.
