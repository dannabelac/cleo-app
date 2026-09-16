# Revisión: proteger el guardado de CLEO

Cuando hay cambios locales pendientes, cargar la nube podía sustituirlos. Esta corrección conserva la versión local y pide elegir explícitamente entre dispositivo y nube. Si una pestaña queda desactualizada, sus nuevos guardados se detienen antes de escribir y el formulario permanece abierto.

## Cambios incluidos

- Validación y reversión de escrituras locales incompletas.
- Referencia pequeña de la última versión confirmada para distinguir caché de cambios pendientes.
- Protección al resolver conflictos si los datos cambian durante la consulta.
- Aviso entre pestañas basado en la misma comprobación que protege el guardado.

## Validación

30 pruebas automatizadas con almacenamiento y servidor simulados pasan. La compilación termina correctamente; conserva advertencias de tamaño de paquetes y API CJS de Vite. La prueba manual confirmó PRUEBA C en Supabase de pruebas y en ambas pestañas después de elegir dispositivo y luego nube. El ajuste más reciente del aviso todavía requiere verificación en navegador.

## Límites para revisar

No combina versiones automáticamente. La comprobación y escritura de localStorage no es atómica entre procesos. No son transaccionales las acciones que modifican varias colecciones. La recuperación de formularios sigue requiriendo copiar borradores antes de recargar. Este cambio no certifica la seguridad integral ni que CLEO esté lista para comercializarse.

## Alcance de publicación

Sin migración de tablas. La configuración local apunta a Supabase de pruebas y no debe publicarse. El SQL de preparación de pruebas no forma parte de la corrección. Antes de publicar: comparar con main actual, preparar una vista previa conectada solo a pruebas, verificar recuperación y obtener una decisión de publicación sobre esa versión concreta.
