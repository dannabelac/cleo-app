# Rediseño visual "Tu mesa" — guía de implementación

Rama: `design/rediseno-visual`. Trabajar solo aquí. **Un commit por fase, sin push y sin merge.**
Si git pide identidad, usar la del último commit sin cambiar la configuración:
`git -c user.name="$(git log -1 --format=%an)" -c user.email="$(git log -1 --format=%ae)" commit ...`

Diseño aprobado (canvas): https://claude.ai/artifact/XBsXEyje5bASihURwe8gyA — página **"Ronda 5 · Tu mesa + idea del día"**.
Copias del HTML de esas pantallas en `docs/rediseno/referencias/` (son mockups: los `{{negocio}}` son el color del negocio; ignorar `support.js`, `<x-dc>` y el bloque `<script type="text/x-dc">`).

---

## 1. Qué es y qué no es

- **Solo diseño visual del front.** No cambiar lógica, datos, localStorage, cloudSync, flujos ni reglas del negocio.
- **No cambiar textos** salvo los listados en "Excepciones aprobadas".
- **No inventar** funciones, métricas ni contenido. Si algo no está resuelto, anotarlo como pendiente.
- Aplica a los **dos perfiles**: productos (Inicio, Hoy, Oportunidades, Pedidos, Clientes, Ingresos, Inventario y costos, Resumen, Eventos) y servicios (Inicio, Hoy, Seguimientos, Clientes, Cotizaciones, Trabajos, Ingresos, Resumen).

Usuario: emprendedores que venden por WhatsApp/Instagram, hoy se organizan con libreta o Excel, sin sistema formal. Debe sentirse **cercano, claro y propio, no un CRM ni un dashboard**. No saturar.

---

## 2. Fase 1 (hecha, commit `fe071e4`)

- Paleta `C` nueva (mismas claves; `C.purple` ahora es pervinca profundo, se agregaron `C.ink`, `C.accent`, `C.accentSoft`) y `FONT_CLEO` (Plus Jakarta Sans) en `CLEO.jsx`; fuente cargada en `index.html`.
- Estilos base en `st` (`btn`, `btnP`, `btnG`, `card`, `inp`, `lbl`, `ov`, `modal`, `modal2.footer`).
- Riel lateral de escritorio y barra inferior móvil + menú "Más" ya con el diseño aprobado.

---

## 3. Sistema visual

### Color (todo en `C`)
| Rol | Valor | Uso |
|---|---|---|
| Azul noche `C.ink` / `C.dark` | `#0E1328` | Texto fuerte, **acción principal**, riel, bloque "Tu día", menú Más |
| Pervinca `C.accent` | `#8D9BFF` | Bloque de registro, marca, resaltado sobre azul noche |
| Pervinca claro sobre oscuro | `#9AA7FF` / `#A3AFFF` / `#AEB8FF` | Palabras clave, contadores e íconos sobre azul noche |
| Pervinca profundo `C.purple` | `#3F4BD0` | Enlaces ("Ver todo →"), íconos de acento, selección sobre claro |
| Pervinca suave `C.accentSoft` | `#EEF0FF` (`#E4E8FF` en barra móvil activa) | Fondo de ícono/selección |
| Fondo `C.bg` | `#ECEEF5` | "La mesa" |
| Bloque `C.surface` / sutil `C.surfaceUp` | `#FFFFFF` / `#F4F5FA` | Bloques / celdas internas |
| Bordes | `#E3E6EF`, controles `#D5D8E4` | |
| Texto secundario `C.textMuted` / `C.textDim` | `#4A5068` / `#6E7489` | Nunca más claro que esto para texto legible |
| Atención (ocre) | fondo `#FBF1DC`, texto `#6E4806`/`#8A5A06`, cifra `#5E3D04` | Plazos, saldos pendientes, anticipo |
| Completo (verde) | fondo `#E2F2E8`, texto `#1E5C38` | "Pagado ✓" |
| Neutro de estado | fondo `#ECEEF5`, texto `#4A5068` | "12d preparando" |

Reglas: el color de estado **siempre va con texto o ícono**. Un pendiente normal **no es rojo**; el rojo (`C.red`) queda solo para errores o algo realmente vencido. El color del negocio del usuario solo aparece en el anillo de su logo (riel y menú Más), nunca en botones, estados ni selección.

### Escala por viewport

El objeto `sc` en `CLEO.jsx` centraliza ambas escalas. Aplicar siempre con `isMobile`:

| Token | Desktop (≥768px) | Móvil (<768px) | Notas |
|---|---|---|---|
| `sc.text` | 14px | 16px | Texto normal de la interfaz |
| `sc.textSec` | 13px | 15px | Texto secundario, descripciones |
| `sc.textLabel` | 11px | 12px | Etiquetas de grupo (mayúsculas) |
| `sc.titlePage` | 26px | 28px | Saludo / título de pantalla |
| `sc.titleSection` | 20px | 22px | Encabezados de sección |
| `sc.namePerson` | 17px | 18px | Nombre de persona en tarjeta |
| `sc.btnH` | 38px | 44px | Alto de botón (mín. táctil móvil) |
| `sc.inputFs` | 14px | 16px | Fuente de campo (16px evita zoom iOS) |
| `sc.blockPad` | 20px | 24px | Padding interno de bloques |
| `sc.blockR` | 22px | 28px | Radio de bloques |

**Regla de oro:** en móvil, campos siempre con `fontSize:16` y botones con `minHeight:44`. En desktop, campos con `minHeight:40` y botones con `minHeight:38`.

### Tipografía
Plus Jakarta Sans (`FONT_CLEO`), cifras tabulares (`fontVariantNumeric:"tabular-nums"`).
- Saludo / título de pantalla: **26px desktop / 28px móvil**, 800, `letter-spacing:-0.035em`.
- Títulos de sección: **20px desktop / 22px móvil**, 800, `-0.03em`.
- Nombre de persona: **17px desktop / 18px móvil**, 800.
- Texto: **14px desktop / 16px móvil**, line-height 1.6. Secundario: 13px/15px. Mínimo legible: 13px.
- Etiquetas de grupo: **11px desktop / 12px móvil**, 800, mayúsculas, `letter-spacing:.08em`, contador en `#3F4BD0`.

### Formas
- Bloques: radio **22px desktop / 28–30px móvil**, sin borde ni sombra (la jerarquía la da el color).
- Botones: píldora (`borderRadius:999`), alto **38px desktop / 44px móvil**. Principal azul noche; secundario blanco con borde `#D5D8E4`; discreto sin fondo (p. ej. "Ya le hablé" con palomita).
- Campos: radio 14, borde 1.5px `#D5D8E4`, **14px desktop / 16px móvil**.
- Áreas táctiles ≥ 44px en móvil.
- Sin avatares de iniciales junto a cada persona: el nombre manda.
- Sin emojis decorativos en la interfaz (👋 🎯 📦 💬 💡 → texto o ícono SVG).
- Padding de página: **24–32px desktop** (24 con sidebar abierto, 32 expandido) / **20px 16px móvil**.
- Separación entre bloques: **16px desktop**, 12–20px móvil.
- Barra lateral: **104px ancho expandido / 68px colapsada**, ítems de **52px alto**, íconos de **20px**, nombres de **11.5px**.
- Modales: **440px de ancho, 22px de padding, título 18px** en desktop.

---

## 4. Fase 2 — Inicio (desktop y móvil)

Referencias: `R5-Inicio.html`, `R5-Inicio-SinIdea.html`, `R5-Movil-Inicio.html`.

**Desktop**
1. Encabezado: fecha · nombre del negocio (14.5px, `#5A6078`), "Buenas tardes, Danna" (34px 800, sin 👋) y **"+ Nuevo" arriba a la derecha** (botón azul noche). Se elimina el subtítulo "Hoy tienes…" de aquí (pasa al bloque oscuro).
2. Fila de dos bloques (grid 12 col): **registro** (span 7) y **Tu día** (span 5), misma altura.
   - Registro: fondo `#8D9BFF`, título "¿Qué ha pasado en {negocio}?" + subtítulo; las 4 acciones en **un solo objeto blanco dividido en 2×2** (cuadrantes, 21px 800, flecha en círculo `#EEF0FF`), sin íconos por acción.
   - Tu día (azul noche con resplandor `radial-gradient(110% 80% at 100% 0%, #24307A 0%, transparent 62%)`): frase "Hoy tienes **3 oportunidades por retomar** y **4 pedidos** que requieren tu atención." en dos tonos (gris `#A9AFC6` + blanco + palabras clave pervinca), 28px 800. Debajo, **Idea del día** (si existe) en panel `rgba(255,255,255,.07)` con borde pervinca suave, etiqueta "IDEA DEL DÍA" en `#FFD36B` con ícono de foco, texto 16px `#D6D9E6` con producto y plazo en blanco. Al pie, acceso **"Hoy (n) →"**.
3. "A quién contactar hoy" + subtítulo + "Ver todo →". Máximo **3 recordatorios** en Inicio. Oportunidades (span 8, cuadrícula de 2) y pedidos (span 4, columna).
   - Persona: bloque blanco radio 28. Nombre → frase con datos destacados (producto/importe en `#0E1328` 700; plazo en ocre con ícono de reloj) → nota del usuario con ícono de lápiz pervinca, separada por línea `#E6E8F0` → acciones "Contactar" (principal) y "Ya le hablé" (discreto).
   - Pedido con saldo: bloque `#FBF1DC`; "Saldo pendiente:" 15px y la cifra 44px 800 `#5E3D04` (36px si pasa de 12 caracteres); producto; "Instagram" (secundario, abre el perfil) y "Ver pedido →" (principal).
4. **Se quita el botón flotante del sol**: su destino (Hoy) ya está en el riel y en el bloque oscuro.
5. Quitar bordes laterales de color y avatares de iniciales de las filas.

**Móvil**
- Sin la "C" del logo ni "CLEO · Nunca emprendas solo".
- Orden: fecha + "+ Nuevo" (misma fila) → "Buenas tardes, emprendedor" (28px 800) → bloque Tu día (resumen + idea + Hoy) → bloque de registro → contactos.
- Registro en móvil: cuadrantes compactos (texto y flecha en la misma línea, ~74px de alto).
- Personas a ancho completo; acciones en 2 columnas de 50px de alto.
- El contenido termina por encima de la barra inferior (padding inferior ~120px).

**Estados vacíos:** si no hay pendientes, cada grupo muestra el texto actual de CLEO en un bloque con borde suave (no inventar textos nuevos).

---

## 4b. Ronda 7 — Inicio con aire (aprobada, reemplaza el Inicio de la fase 2)
Referencias: `docs/rediseno/referencias/R7-Inicio-Desktop.html` y `R7-Movil-Inicio.html`.
- "+ Nuevo ▾" solo arriba a la derecha; fecha y saludo debajo (sin el nombre del negocio junto a la fecha).
- Resumen "Hoy tienes…" y acceso a Hoy unidos en una sola franja oscura; toda la franja lleva a Hoy. Desaparece el bloque "Tu día".
- Registro: desktop en una fila de 4 tarjetas; móvil en 2x2. Tarjetas blancas separadas sobre #8D9BFF.
- A quién contactar: máximo 3. Desktop en fila de 3 tarjetas; móvil en un bloque blanco con filas.
- Idea del día al final de Inicio, en tarjeta blanca con foco ocre. Si no hay idea, no se muestra.
- Más aire: 32px bajo el saludo y 48px entre secciones (36px en móvil). Main desktop con padding 36px 64px.
- Riel desktop: 104px de ancho, items de 88px, letra 11px, sin cortar palabras ("Oportunidades" completa; "Inventario y costos" en dos líneas).

## 4c. Ronda 8 — Clientes (aprobada)
Referencias: `docs/rediseno/referencias/R8-Clientes.html` (desktop) y `R8-Movil-Clientes.html` (móvil). Aplica en la vista de clientes de ambos perfiles (productos y servicios; el subtítulo cambia según el perfil, como hoy).
- Encabezado: "Tus clientes" + subtítulo actual a la izquierda; "+ Nuevo ▾" a la derecha (móvil: "+ Nuevo" solo arriba y el título debajo).
- Buscador blanco redondo con lupa (placeholder "Buscar..."). El select de etapa pasa a pastillas: Todos · Activos · Ganados · Perdidos (mismos valores y misma lógica de filtro). Seleccionada: fondo #E4E8FF, texto ink 800.
- Lista en un solo bloque blanco (radio 22 desktop / 24 móvil) con filas separadas por línea #EDEFF5; ya no hay tarjetas sueltas, sombras ni borde izquierdo de color.
- Sin círculo de iniciales. En su lugar, la letra inicial del nombre en pervinca #3F4BD0 (13px, 800), solo en la primera fila de cada letra.
- Nombre 15.5px/700. Si hay `negocio`, va debajo en 13px #6E7489 (si está vacío no se deja espacio).
- Seguimiento: "Seguimiento hoy / mañana / en N días" con reloj, en pastilla #EEF0FF/#3F4BD0. Si es hoy, ocre (#FBF1DC/#8A5A06); si está vencido, rojo #B23A24 con alerta.
- Canal (BtnCanal): botón neutro con contorno #E3E6EF, ícono + nombre en desktop; solo ícono de 40px en móvil. Conserva su comportamiento y el stopPropagation.
- Chevron gris a la derecha; toda la fila abre el perfil como hoy.

## 4d. Ronda 9 — Tarjetas de Pedidos y Oportunidades (aprobada)
Referencias: `docs/rediseno/referencias/R9-Pedidos.html`, `R9-Movil-Pedidos.html`, `R9-Oportunidades.html`, `R9-Movil-Oportunidades.html`. Reemplaza el diseño de tarjeta de R5/R6 en ambas vistas.
Desktop: tarjeta blanca radio 22, padding 22/24, grid `minmax(0,1fr) 280px`, gap 32.
- Línea 1: nombre (17px/800) + etapa como pastilla tocable (28px, punto + texto + chevron) que abre el MISMO selector de etapa/estado de hoy. Colores: Preparando/Nueva = #EEF0FF/#3F4BD0; Entregado = #E2F2E8/#1E5C38; Sin respuesta y demás = #EEF0F5/#4A5068. Se quita la etiqueta de estado duplicada y el select grande.
- Línea 2: producto 14.5px/600 (en oportunidades conserva el lápiz de editar).
- Línea 3 (13.5px #5A6078): fecha. Pedidos: "Entrega 1 oct 2026" con ícono calendario, o el enlace "+ Agregar fecha de entrega". Tiempo en ocre #8A5A06 con reloj: "12 días preparando", "9 días sin movimiento".
- Nota del usuario con lápiz #7C8CFF; consejo de CLEO con foco en #3F4BD0.
- Columna derecha, alineada a la derecha. Pedidos con saldo: "Resta" + importe 26px en #5E3D04, barra de 6px (#EEF0F5, relleno #C99A3E al % pagado) y debajo "{estado de pago} · $pagado de $total". Pedidos pagados: "Total" + importe, barra llena #3E9A64 y "✓ Pagado completo" en verde. Oportunidades: "Total" + importe. Se quitan las 3 cajas Total/Pagado/Restante.
- Acciones (separadas por línea #EDEFF5): todos los botones 36px, contorno #E3E6EF, texto 13px/700: canal (ícono + nombre), Cotización, Pagos (N), Adjuntar archivo como botón de solo ícono (clip, con title/aria-label). Acción principal oscura a la derecha (Registrar pago solo si hay saldo; Enviar precio / WhatsApp en oportunidades, como hoy).
Móvil: misma tarjeta en una columna, padding 18, radio 24. Importe arriba a la derecha junto al nombre (Resta o Total, 18px). Etapa como pastilla al inicio de la línea de datos. En pedidos con saldo, la barra va con "Registrar pago" a su derecha. Botones de 40px: el canal solo con ícono, los secundarios sin ícono y sin envolver. En oportunidades, la acción principal ocupa el resto de la fila.

## 4e. Ronda 10 — Ingresos (aprobada, reemplaza R6-Ingresos)
Referencias: `docs/rediseno/referencias/R10-Ingresos.html` (desktop) y `R10-Movil-Ingresos.html` (móvil).
- Encabezado: "Ingresos" + "Dinero que ya entró a tu negocio".
- Desktop: grid `minmax(0,1fr) 300px`, gap 24. Izquierda: lista de movimientos en bloque blanco (radio 22, padding 20/26). Derecha (sticky top 24): el periodo.
- Periodo: un bloque oscuro (mismo degradado navy, radio 22) con "Entró hoy / Entró esta semana / Entró este mes" (13px #A9AFC6) y el total del periodo elegido (34px desktop, 30px móvil). Debajo, un selector blanco con las 3 opciones (Hoy, Semana, Mes), cada una con su importe; la elegida en #E4E8FF. En desktop van apiladas (filas 15px de etiqueta + importe a la derecha); en móvil, en fila de 3 (etiqueta arriba, importe abajo). Se quitan las 3 tarjetas grandes. Misma lógica de periodo que hoy.
- Buscador y filtro Todos · Pedidos · Ventas rápidas dentro del bloque de la lista, sobre fondo #F4F5FA.
- Grupos por día (AYER, 10 OCT…) en pervinca 12px/800, como hoy.
- Movimiento: ícono de 40px (36px móvil) radio 13: pedido = bolsa en #EEF0FF/#3F4BD0; venta rápida = rayo en #FBF1DC/#8A5A06; pedido cancelado = × en #FBE6E1/#B23A24. Nombre 15px/700; debajo, en 13px #5A6078: tipo en negritas ("Pedido", "Venta rápida", "Pedido cancelado" en rojo) + " · " + concepto. En móvil el texto se ajusta en varias líneas, sin cortar. Importe 15.5px/800 a la derecha; negativos en rojo con "−". Se quitan las etiquetas en mayúsculas.

## 5. Fase 3 — Pedidos (y el resto de secciones)

Referencias: `R5-Pedidos.html`, `R5-Movil-Pedidos.html`.

**Pedidos desktop**: título "Pedidos" 36px 800 + subtítulo; "+ Pedido" arriba a la derecha (azul noche, ya no verde). Buscador píldora blanco (48px) + filtros píldora blancos. Cada pedido es un bloque blanco con dos columnas:
- Izquierda: nombre, producto (16.5px 600), estados (`Pagado ✓` verde, `Anticipo recibido` ocre con medio círculo, `12d preparando` neutro con reloj), "Entrega: …", "+ Agregar fecha de entrega" (botón discreto pervinca), nota con lápiz.
- Derecha (~470px): selector de estado del pedido y el **ticket de importes**: Total / Pagado / Restante en 3 celdas `#F4F5FA`, alineadas a la derecha, 20px 800. Restante con saldo → celda ocre; en $0.00 → gris `#7A8096`.
- Fila de acciones con línea superior: WhatsApp/Instagram, Adjuntar archivo, Cotización, Pagos (n) como secundarios **que no parezcan deshabilitados**; "Registrar pago" principal a la derecha cuando hay saldo.

**Pedidos móvil**: título + "+ Pedido" en la misma fila; buscador a lo ancho; **filtros visibles en dos renglones (no deslizables)**; importes como **recibo vertical** (etiqueta izquierda, cifra derecha; restante resaltado) para que cifras largas no se corten; "Registrar pago" a lo ancho; resto de acciones en cuadrícula 2×2.

**Resto de secciones** (Hoy, Oportunidades/Seguimientos, Clientes, Cotizaciones, Trabajos, Ingresos, Inventario y costos, Eventos, Resumen): aplicar el mismo lenguaje (bloques sin borde, nombres primero, frases con datos destacados, estados con ícono, cifras tabulares alineadas). No hay mockup de estas: seguir las reglas de la sección 3 y anotar dudas.

---

## 6. Fase 4 — Modales y formularios (~45)

Usar `st.modal` / `st.modal2` (ya actualizados) y revisar uno por uno: registro (Alguien preguntó, Envié un precio, Cerré una venta, Recibí un pago — productos y servicios), venta rápida, cliente/prospecto/identidad, etapa, combinar/vincular oportunidad, pedido nuevo/confirmar/pago/historial/fecha, cotización y seguimiento, inventario/costos (material, compra, preparación, ingredientes, reporte), eventos (nuevo, gasto, productos, terminar), Mi perfil/Mi negocio, Mi cuenta, catálogo, importar catálogo, exportar, eliminar cuenta, reporte comercial. Cuidar: título 20–22px 800, footer fijo, botón principal azul noche, campos 16px, nada cortado en móvil.

## 7. Fase 5 — Revisión final
Capturas desktop (1440) y móvil (390) de cada pantalla y modal, en ambos perfiles; textos que se corten; áreas táctiles ≥44px; contraste ≥4.5:1; actualizar `DESIGN.md` al nuevo sistema.

---

## 8. Cómo probar
- `npm run dev` → `http://localhost:5173`.
- Modo demo desde el onboarding: "Vendo productos" → "Empecemos" → nombre → negocio → **"Ver cómo funciona con datos de ejemplo"**.
- Pruebas: `node --test tests/local-setter.test.cjs` debe pasar. `tests/cloudSync.test.cjs` ya tenía 15 pruebas fallando antes del rediseño; no tocar `cloudSync.js`.

## 9. Excepciones aprobadas (cambios de texto o navegación)
- Navegación con nombres completos: "Oportunidades", "Seguimientos", "Cotizaciones", "Inventario y costos" (también en el menú Más móvil, antes "Inventario").
- "Mi catálogo · N productos" en el riel; "N productos" junto a "Mis productos" en Más (confirmar que es el mismo dato).
- Bloque del negocio (logo, nombre, anillo de color) en riel y menú Más.
- Se elimina el botón flotante del sol; se quitan títulos de grupo del riel y emojis decorativos.
- En móvil: se quitan la "C" y "CLEO · Nunca emprendas solo"; se agrega el resumen "Hoy tienes…" (antes solo desktop).
- Etiquetas TOTAL / PAGADO / RESTANTE pasan a mayúscula inicial.
- Ingresos R10: "MES/SEMANA/HOY" → "Entró este mes / esta semana / hoy" en el bloque del periodo; el tipo de movimiento pasa de etiqueta en mayúsculas a texto + ícono.
- Tarjetas R9: "12d preparando" → "12 días preparando" en ocre (no rojo); "Entrega: …" → "Entrega …" con calendario; Total/Pagado/Restante pasan a "Resta" + barra de pago.
- Clientes R8: "Seg: En N días" pasa a "Seguimiento en N días"; filtro de etapa como pastillas; se quitan el borde de color y las iniciales.
- Inicio R7: resumen y acceso a Hoy en una franja; idea del día al final; en pedidos con saldo, el importe a la derecha del nombre en móvil.

## 10. Pendientes por confirmar con Danna
- Opciones del menú "+ Nuevo" (no revisadas en diseño).
- Límite de texto de la idea del día y si alguna vez trae una acción.
- Si "12d preparando" debe marcar retraso a partir de cierto número de días.
- Texto completo de "Registrar pago" (en la captura salía cortado).
- Qué abre el chip de WhatsApp en Pedidos (se asume la conversación).
