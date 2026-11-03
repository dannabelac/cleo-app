# Revisión pre-despliegue — Asistente a producción

Evidencia y correcciones pedidas antes de desplegar `feat/asistente-mensaje-ia` a producción (`gpvpvkeqfcgypuoxvjne`, concleo.com).

## 1. Las 15 pruebas fallidas de `npm run test:sync` — preexistentes, no introducidas por esta rama

**Causa:** `TypeError: console.log is not a function` / `console.warn is not a function` dentro de `tests/cloudSync.test.cjs` — un mock de consola roto en el arnés de pruebas, no un bug de `cloudSync.js`.

**Evidencia reproducida en esta revisión:**

1. Corrida contra el baseline limpio de producción (`origin/main`, commit `b6c000c`, worktree separado):
   - `pass: 15`, `fail: 15` (15 nombres únicos; el reporter los lista dos veces, de ahí el conteo de 31 líneas con `✖`).
2. Corrida contra `feat/asistente-mensaje-ia` (commit `323c178`, con los 4 commits nuevos de esta rama):
   - Mismo resultado exacto: `pass: 15`, `fail: 15`, **los mismos 15 nombres de prueba**, carácter por carácter.
3. `git diff --stat b6c000c..323c178 -- src/cloudSync.js tests/cloudSync.test.cjs tests/local-setter.test.cjs` → **vacío**. Ninguno de los 4 commits de esta rama tocó `cloudSync.js`, `cloudSync.test.cjs` ni `local-setter.test.cjs`.

**Lista de las 15 pruebas fallidas (idéntica en ambas corridas):**
```
recarga conserva cambios locales sin enviar y pausa sincronización
caché confirmado permite recibir cambios remotos sin falso conflicto
cambiar de cuenta no ofrece datos de la cuenta anterior
salir del demo recupera los datos reales
fallo al elegir nube mantiene el conflicto pendiente
elegir nube con éxito no reabre conflicto al recargar
un guardado confirmado deja una referencia para la próxima apertura
el orden de propiedades no produce conflictos
la referencia de sincronización es pequeña y no contiene nombres
fallar al guardar la huella no descarta las diferencias en la siguiente apertura
escritura silenciosamente rechazada no se considera una carga exitosa
dos navegadores: el segundo guardado no sobrescribe la nube y conserva su versión local
resolver local no publica un respaldo anterior si el caché cambió después del conflicto
resolver local con caché estable confirma la versión elegida y permite seguir
resolver nube no borra cambios locales que aparecen durante la consulta
```

**Conclusión:** no es una regresión de esta rama. Es deuda técnica preexistente en el arnés de pruebas (`cloudSync.test.cjs`), separada de este despliegue. No bloquea el merge, pero queda pendiente arreglar el mock de consola en una sesión aparte.

## 2. Límite de solicitudes por usuaria — sigue siendo solo por instancia (riesgo real en producción)

`asistente-proxy/index.ts`, `excedeLimiteDeTasa()`: el contador vive en un `Map` en memoria del proceso de la función. Si Supabase despliega más de una instancia/región para `asistente-proxy` (algo fuera de nuestro control directo), **cada instancia cuenta por separado** — una usuaria real podría superar las 20 solicitudes/minuto repartidas entre instancias sin que ninguna lo detecte. Esto ya estaba documentado como limitación conocida desde la implementación inicial (pensada para las pruebas de una sola usuaria en CLEO Pruebas), pero con usuarias reales de producción el riesgo es distinto: ya no es solo "no es exacto", es "el límite real efectivo puede ser varias veces mayor a 20/min sin que nadie se entere".

Dos caminos, ninguno aplicado todavía — pendiente de tu decisión:
- **Aceptar el riesgo para el lanzamiento inicial**, dado que el volumen esperado de usuarias reales al inicio es bajo, y revisar si hace falta algo más robusto cuando el uso crezca.
- **Reemplazarlo por un límite real entre instancias**, respaldado en una tabla de Postgres (conteo atómico por usuaria/minuto, usando la service role ya disponible como secreto de plataforma). Esto es un cambio de esquema nuevo — requiere una migración SQL que prepararía para tu revisión y aprobación explícita antes de ejecutarla, como con cualquier otro cambio de SQL.

## 3. Comando de reversión — corregido

El comando original (`npx supabase functions delete asistente-proxy --remote=gpvpvkeqfcgypuoxvjne`) le faltaba `--yes`. Sin esa bandera, `functions delete` es un cambio "hosted" que pide confirmación interactiva antes de borrar — al copiarlo y correrlo tal cual, se queda esperando una respuesta que nunca llega si no se corre en una terminal interactiva real, en vez de completarse. Corregido a:

```
npx supabase functions delete asistente-proxy --remote=gpvpvkeqfcgypuoxvjne --yes
```
