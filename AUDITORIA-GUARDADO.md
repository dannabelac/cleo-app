# CLEO: corrección local de guardado

Base revisada: 8caabf1bd3e977a67be84a10c8981a501fa87f4c.
Estado: cambios locales, no publicados. No se ha conectado esta copia a Supabase real.

## Cambios

- Al cargar, un caché propio que difiere de la nube y no coincide con la última versión confirmada se conserva como conflicto, sin enviarlo automáticamente.
- La referencia confirmada utiliza SHA-256, está asociada al usuario, no contiene datos personales y se limpia al cerrar/cambiar de cuenta.
- Las escrituras de carga se verifican y sus errores bloquean el inicio. Se intenta restaurar el estado previo si falla una escritura intermedia.
- La resolución que elige la nube usa la misma comprobación de escritura.
- El mensaje de conflicto contempla cambios locales pendientes, no solo cambios de otro dispositivo.

## Validación

Pruebas con almacenamiento y Supabase simulados, sin red: `npm run test:sync`.
Las dos pruebas de regresión principales fallan contra el archivo original y pasan con la corrección.
La compilación de producción pasa. Vite advierte del tamaño de los paquetes; no impide compilar, pero queda como revisión de rendimiento.

## Límites y trabajo previo a publicación

- El primer uso de esta versión no tiene una huella anterior. Si nube y caché difieren, se pide decidir conservadoramente. No se fusionan registros.
- localStorage no es transaccional: la reversión es de mejor esfuerzo y no garantiza recuperación ante cierre del proceso a mitad de una escritura ni ante un navegador que rechace también restaurar. No afirmar atomicidad.
- Faltan pruebas de interfaz y del ciclo completo con cuentas ficticias en un Supabase separado, incluyendo dos dispositivos, cuentas distintas y límites reales del navegador.
- El manejo previo de claves locales corruptas, carreras generales entre pestañas y ediciones posteriores a un conflicto requiere revisión adicional; esta corrección no certifica toda la sincronización.
- No se han probado restauraciones de la base ni preparado respaldo de adjuntos.
- No publicar desde main ni configurar una vista previa con las credenciales de producción para hacer estas pruebas.

## Próximo paso

Preparar Supabase de pruebas con el esquema, políticas y funciones revisados y sin copiar registros personales. Configurar allí la vista previa; ejecutar alta, guardado, recarga, desconexión, conflictos y aislamiento con dos cuentas ficticias. Solo después preparar la publicación y reversión.

## Verificación adicional: almacenamiento y dos pestañas

Se ejecutaron 19 pruebas automatizadas: 18 verifican comportamientos de protección y una reproduce un defecto aún pendiente. La prueba de reproducción pasa porque confirma la existencia del fallo, no porque lo resuelva.

El setter central de CLEO conserva el estado anterior y lanza un error cuando el almacenamiento rechaza guardar. La carga también detecta escrituras que no lanzan error pero no quedan guardadas y cambios de otra pestaña durante el cálculo de la huella.

Riesgo confirmado con dos estados de interfaz simulados: ambas pestañas parten de [1]; la primera guarda [1,2] y la segunda, aún desactualizada, guarda [1,3]. El almacenamiento termina con [1,3], perdiendo el registro 2 antes de que la protección de versiones remotas pueda intervenir. El aviso de otra pestaña no impide esta escritura. Reproducción en tests/local-setter.test.cjs, usando el setter extraído del código real y simulando la ejecución de los actualizadores de React; falta validación en navegador.

No publicar como solución completa de pérdida de datos. Siguiente corrección: impedir escrituras desde una pestaña con estado obsoleto, cubriendo tanto las colecciones como el perfil y los flujos con varios cambios relacionados. Requiere diseñar la coordinación entre pestañas y comprobar compatibilidad con las migraciones locales; una comparación simple con el estado de React puede bloquear transformaciones legítimas.

Pruebas manuales reportadas por la usuaria: conflicto tras recarga inmediata resuelto conservando dispositivo; persistencia tras recarga y nuevo inicio de sesión; formulario conservado al perder conexión y guardado al reconectar. No se volvió a pedir repetir cambio de cuenta.

## Corrección de pestañas desactualizadas (copia local)

La reproducción anterior se convirtió en una prueba de protección: el segundo guardado debe fallar sin reemplazar los datos de la primera pestaña, sin actualizar el estado y sin alcanzar el cierre/limpieza del formulario. El nuevo guardián captura los valores originales del almacenamiento al montar CLEO, compara todas las colecciones comerciales y el propietario antes de guardar y actualiza solo las referencias de sus propias escrituras. Esto evita falsos conflictos por las transformaciones de datos que hace React al iniciar. Se aplica a los setters de colecciones y al perfil.

Validación actual: 24 pruebas automatizadas pasan. Incluyen pestaña obsoleta, cambio externo en otra colección, cambio de cuenta, perfil, migración inicial del estado, guardados consecutivos propios y remonte con datos frescos. Compilación pendiente de registrar en el resultado de esta ejecución. Prueba manual de dos pestañas pendiente.

Se retiró el botón de recarga inmediata del aviso de otra pestaña. El nuevo mensaje aclara que hay que copiar la captura pendiente antes de recargar: conservar el formulario en memoria al bloquear NO garantiza conservarlo después de una recarga.

Límite explícito: comparar y escribir en localStorage no constituye un bloqueo atómico entre procesos. La corrección cubre una pestaña ya desactualizada; una carrera estrictamente simultánea entre comprobación y escritura sigue requiriendo coordinación (p. ej. Web Locks y adaptación de flujos asíncronos). Tampoco vuelve transaccionales las operaciones que actualizan varias colecciones. No certificar ausencia universal de pérdida de datos ni publicar como tal.

## Aclaración de la prueba manual entre sesiones

La usuaria confirmó que abrió una sesión dentro de Codex y otra en Chrome/Safari. Por tanto, el caso observado no valida ni invalida la protección entre pestañas que comparten localStorage. El formulario se cerró, Prueba B quedó visible en la segunda sesión y apareció el conflicto de sincronización. No se inspeccionó la fila real de Supabase ni se confirmó aún el estado de Prueba A.

Se añadieron dos pruebas con almacenamiento independiente por sesión y un servidor simulado que sí implementa la comparación de updated_at y la restricción única por usuario. Se verifica que el primer envío permanece en el servidor, el segundo recibe conflicto, conserva su snapshot local y sigue pausado tras recargar. Las 26 pruebas pasan. Esto es evidencia automatizada del flujo, no certificación del resultado real en Supabase.

La compilación posterior a la protección de pestañas finalizó correctamente (601 módulos). Sigue pendiente una prueba manual con dos pestañas del mismo navegador y origen, sin reutilizar ni sobrescribir las versiones del conflicto actual. No se publicaron cambios.

## Cierre parcial de conflictos

La usuaria confirmó el aviso de bloqueo de guardado de la pestaña desactualizada, con el formulario conservado. Esa prueba manual queda aprobada para ese escenario.

Se añadieron comprobaciones para no resolver un conflicto local con un snapshot anterior al caché actual ni reemplazar el caché con la nube si cambió durante la consulta. La creación durante la resolución usa INSERT en lugar de UPSERT para no sobrescribir una fila creada por otra sesión. 29 pruebas automatizadas pasan. El plan de entrega y reversión está en PLAN-PUBLICACION.md; todavía no se autoriza ni ejecuta publicación.
