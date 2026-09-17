# CLEO — plan de publicación de la corrección de guardado

Estado: preparación local. No hay cambios publicados ni una aprobación de despliegue.
Versión de referencia revisada: 8caabf1bd3e977a67be84a10c8981a501fa87f4c.

## Cambio propuesto

Conservar caché pendiente antes de cargar la nube; bloquear cargas incompletas; bloquear escrituras de interfaces desactualizadas; y mantener pausada la sincronización si los datos cambian durante la resolución de un conflicto. No migrar tablas ni cambiar el formato de user_data.

## Evidencia

30 pruebas automatizadas con almacenamiento y servidor simulados. Pruebas manuales reportadas: recarga antes de sincronizar; recuperación después de iniciar sesión; reconexión; conflicto entre navegadores con Prueba A verificada en Supabase; bloqueo entre pestañas de Chrome conservando el formulario Prueba D.

## Antes de publicar

1. Confirmar de nuevo la versión actual de main y Vercel. Si avanzó desde la referencia, revisar e integrar los cambios antes de desplegar.
2. Preparar una rama de corrección y revisión del cambio. No enviar directamente a main.
3. Configurar cualquier vista previa exclusivamente con pconfadsbtwjbjeblxgl (Supabase de pruebas). No subir .env.local ni ejecutar supabase/01-pruebas-guardado.sql en producción.
4. Comprobar en la vista previa la resolución normal de ambas opciones de conflicto y el caso de una modificación concurrente durante la resolución. El bloqueo nuevo falla de forma conservadora; falta una experiencia completa para recuperar/combinar una captura que cambió después del respaldo del conflicto.
5. Verificar la clave y URL de Supabase de producción en Vercel sin reemplazarlas por las de pruebas. Confirmar un respaldo reciente antes del despliegue.
6. Presentar el cambio y sus límites para la decisión de publicación. No afirmar que elimina toda posibilidad de pérdida de datos.

## Límites pendientes

Resultado manual adicional (16 de septiembre): se descargó y leyó un respaldo con cuatro clientes, incluidos PRUEBA A y PRUEBA C; no contenía B ni D. El usuario eligió conservar el dispositivo y confirmó C en Supabase de pruebas tras actualizar. Después eligió nube en la otra pestaña y confirmó C y la desaparición del conflicto. La primera pestaña mostró entonces el aviso de datos modificados externamente. No se ha confirmado todavía su recuperación tras recargar. Esta resolución preserva la versión elegida, no combina versiones.

Revisión del aviso: el listener de storage activa el aviso ante cualquier evento de una colección, mientras el bloqueo de escritura compara los valores actuales con los capturados al montar la interfaz. El aviso no demuestra por sí solo que esa comparación fallaría. Hay que alinear el aviso con el estado real y diseñar la recuperación conservando formularios antes de considerar resuelta la experiencia entre pestañas. No eliminar la protección ni recargar automáticamente una interfaz con borradores.

La comparación y escritura de localStorage no es atómica entre procesos; una carrera exactamente simultánea necesita coordinación adicional. Tampoco son atómicas las operaciones que cambian varias colecciones. Quedan pendientes pruebas completas de permisos con dos cuentas contra la API, respaldo independiente de adjuntos y restauración en un proyecto separado. No se ha completado una auditoría integral de seguridad/comercialización.

## Publicación controlada

Identificar la versión aprobada y su deployment. Evitar cambios de esquema en esta entrega. Validar con una cuenta interna alta, edición, recarga y sincronización, y observar errores de guardado/conflicto después de publicar. Indicar que se cierren otras pestañas antes de actualizar para no mezclar clientes antiguos y nuevos.

## Reversión

Si aparecen errores nuevos de acceso o guardado, volver al deployment de aplicación previamente verificado en Vercel. No restaurar la base completa como primera medida: borraría del estado activo cambios posteriores al respaldo. El formato persistido sigue siendo compatible, pero volver al código anterior reintroduce los fallos originales de sincronización; primero preservar los cambios pendientes y los respaldos de conflicto. Una reversión de interfaz no revierte datos ya enviados al servidor.

No se ha ejecutado una reversión real ni se ha verificado aún el deployment que se usará como destino; debe anotarse antes de publicar.

## Ajuste local del aviso entre pestañas

El aviso ahora consulta la misma protección que el guardado, en lugar de quedar activado por cualquier evento. Si los valores vuelven a coincidir, un nuevo evento retira el aviso; también contempla el vaciado del almacenamiento. No actualiza automáticamente el estado de la interfaz ni descarta formularios. Prueba de regresión con eventos retrasados, restauración de valores y clear superada. Falta verificación en navegador de este ajuste; no está publicado.

## Rama temporal exclusiva de Preview

La configuración Vercel de esta rama exige entorno Preview y URL/clave pública exactas de CLEO Pruebas antes de compilar. Una configuración heredada de producción hace fallar el build sin generar una vista previa nueva. La política de conexiones de esta rama permite solo el Supabase de pruebas. La clave incluida en la comprobación es publishable, no secreta. No fusionar esta configuración temporal a main: preparar y revisar por separado la configuración final de producción.

El usuario confirmó que después de recargar ambas pestañas muestran PRUEBA C sin avisos. Esto confirma recuperación tras recarga; no prueba todas las carreras simultáneas.

## Preparación final autorizada — 16 septiembre 2026

Carpeta principal: /Users/danna/Documents/cleo chatgtp mejoras. Main remoto confirmado en 8caabf1bd3e977a67be84a10c8981a501fa87f4c antes de publicar. Usuario autorizó publicar solo mejoras del guardado, sin migraciones, cambios de permisos ni diagnóstico de tablas.

Se reemplaza la restricción temporal exclusiva de Preview: Production exige URL exacta del proyecto gpvpvkeqfcgypuoxvjne y clave pública; Preview sigue exigiendo credenciales públicas exactas del proyecto pconfadsbtwjbjeblxgl. Para claves JWT de producción se comprueba rol anon y referencia del proyecto, no su firma; las claves publishable opacas requieren verificación funcional tras desplegar. CSP permite ambos proyectos exactos, sin comodines.

34 pruebas aprobadas y compilación correcta. Respaldo físico informado por el usuario: 16 Sep 2026 11:41:47 UTC. No cubre escrituras posteriores ni objetos Storage. Respaldo independiente de adjuntos diferido por decisión del usuario.

Pruebas manuales reportadas: Preview recupera PRUEBA C y guarda PRUEBA PREVIEW, verificada en Supabase. SQL de producción: anon ve cero filas; una cuenta simulada ve una fila propia y cero ajenas en user_data y legal_acceptances. En pruebas: actualizar/borrar filas ajenas afecta cero filas, inserción ajena bloqueada por RLS. No equivalen a prueba integral de API.

Referencia para reversión de aplicación: commit 8caabf1bd3e977a67be84a10c8981a501fa87f4c. Seleccionar en Vercel el deployment Ready de Production asociado a ese commit; el identificador de deployment no ha podido comprobarse automáticamente. No restaurar toda la base de datos para revertir esta entrega. No se han ejecutado migraciones.

Pendiente tras envío: confirmar Ready de Production y verificar acceso, lectura y guardado con cuenta propia. No declarar despliegue exitoso solo por el push de Git.
