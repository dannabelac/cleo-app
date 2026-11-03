# Suite de pruebas del Asistente

Pruebas locales desechables (Playwright) para la función "Asistente" de
CLEO (`src/CLEO.jsx`). Nunca tocan CLEO Pruebas ni producción.

## Cómo correrla

```bash
npm run test:asistente
# o, equivalente:
node tests/run-asistente-suite.mjs
```

Esto corre todos los archivos `tests/verify-asistente-*.mjs` **uno a la
vez, en secuencia** — ver la siguiente sección sobre por qué nunca debe
paralelizarse.

Para correr un solo archivo durante desarrollo:

```bash
node tests/verify-asistente-<nombre>.mjs
```

### Requisitos antes de correr

1. Un backend simulado (PostgREST-like) escuchando en el puerto que
   `VITE_SUPABASE_URL` del modo de Vite usado apunte (por convención de esta
   sesión, `http://localhost:3714`). Estos scripts de simulación viven hoy
   en el worktree `cleo-whatsapp-pruebas/tests/sim/` (no en este
   worktree) — es un acomodo manual de esta sesión, no una convención fija
   del repo.
2. `npx vite --port 5193 --mode local-check` (o el puerto/modo que uses,
   ajustando `URL` en `tests/asistente-test-helpers.mjs` si cambia)
   sirviendo este worktree (`cleo-asistente-mensaje`).

## Por qué SIEMPRE secuencial, nunca en paralelo

Todas las pruebas de esta carpeta inician sesión con la **misma cuenta de
prueba falsa** (mismo `user_id` fijo — ver `FAKE_SESSION` en
`tests/asistente-test-helpers.mjs`) contra el mismo backend simulado
compartido.

Se comprobó directamente (ver `tests/verify-paralelo-no-interfiere.mjs`,
que reproduce el problema) que correr dos de estas pruebas al mismo tiempo
puede hacer que sus sincronizaciones choquen: cada una sube su propia
versión de los datos casi al mismo tiempo, y CLEO detecta eso como un
conflicto real entre "dos dispositivos" — mismo mecanismo que vería una
persona usando su cuenta en el celular y la computadora a la vez — y
muestra su modal real **"Encontramos dos versiones de tus datos"**. Esa
pantalla tapa el botón "Hablar con CLEO" (u otros) y la prueba, que no
sabe manejar ese modal, falla con un timeout de clic.

No es corrupción de datos ni un bug de la app: es CLEO funcionando como se
diseñó, pero las pruebas no están preparadas para ese caso. Confirmado con
captura de pantalla durante esta investigación — en 1 de cada 2-3 intentos
con solo 2 procesos en paralelo, el conflicto aparecía.

Arreglarlo de raíz exigiría dar a cada archivo su propia cuenta de prueba
(`user_id` distinto), lo cual queda fuera de alcance por ahora. Mientras
tanto, `tests/run-asistente-suite.mjs` es el único punto para correr la
suite completa, precisamente para que nadie lo reemplace sin querer por
algo que sí paralelice (`for ... & wait`, `Promise.all`, etc.).

## Aislamiento de datos entre pruebas

Cada prueba arranca con un negocio local **explícitamente vacío**
(`cleo_clientes`, `cleo_pedidos`, etc. en `[]`) sembrado antes de que la
página cargue — ver `paginaLimpia()` en `tests/asistente-test-helpers.mjs`
y el comentario ahí sobre por qué esto sí aísla de verdad (el local
sembrado siempre gana sobre lo que haya en el backend compartido, mientras
no haya un hash de sincronización ya confirmado para esa sesión). Las
pruebas que necesitan un cliente YA EXISTENTE (para probar "coincidencia
encontrada") lo siembran ellas mismas, con un nombre único por invocación
(`sufijoUnico()`) — ninguna depende de un seed externo ni de datos dejados
por otra corrida.

`tests/verify-asistente-sembrado-sobrevive-sync.mjs` verifica
específicamente que ese sembrado sobrevive tanto a varios ciclos reales de
sincronización como a una recarga de página (carga real desde el backend,
no solo el snapshot inicial).

## Por qué el conteo total de comprobaciones puede variar entre reportes

Si ves reportes de corridas anteriores de esta suite con un número total
de comprobaciones distinto (ej. 107 en una corrida, 111 en otra), **no es
intermitencia**: `run-asistente-suite.mjs` (y el `for` equivalente que se
usó antes de que este script existiera) descubre los archivos por patrón
(`verify-asistente-*.mjs`) en el momento en que arranca. Si se agrega o
quita un archivo de prueba entre una corrida y la siguiente, el total de
comprobaciones cambia aunque nada se haya roto — eso fue exactamente lo
que pasó la primera vez que se reportaron 107 vs. 111: la segunda corrida
incluyó `verify-asistente-sembrado-sobrevive-sync.mjs` (4 comprobaciones),
que todavía no existía cuando arrancó la primera.

Con el conjunto de archivos actual (ver `tests/verify-asistente-*.mjs`),
el total de comprobaciones de una corrida completa debería ser el mismo de
una corrida a la siguiente, siempre que ningún archivo cambie.
