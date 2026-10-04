---
name: CLEO
description: La socia digital del negocio chico — cercana, ágil y siempre lista.
colors:
  indigo: "#4B5EFC"
  indigo-light: "#7B8AFC"
  indigo-pale: "rgba(75,94,252,0.08)"
  bg: "#F8FAFC"
  surface: "#FFFFFF"
  surface-up: "#F8F9FC"
  border: "#E5E7EB"
  border-strong: "#D1D5DB"
  text: "#0F1117"
  text-muted: "#6B7280"
  text-dim: "#9CA3AF"
  green: "#10B981"
  green-bg: "#ECFDF5"
  green-border: "#6EE7B7"
  red: "#EF4444"
  red-bg: "#FEF2F2"
  amber: "#F59E0B"
  amber-bg: "#FFFBEB"
  teal: "#0D9488"
  teal-pale: "rgba(13,148,136,0.07)"
  teal-border: "rgba(13,148,136,0.2)"
  sidebar: "#0B1020"
  sidebar-card: "#11182F"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.5px"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.5px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  pill: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-light}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    padding: "9px 16px"
  chip-active:
    backgroundColor: "{colors.indigo-pale}"
    textColor: "{colors.indigo}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  chip-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
---

# Design System: CLEO

## Overview

**Creative North Star: "Tu Socia Digital"**

CLEO se siente como una aplicación hecha por alguien que entiende exactamente cómo trabaja el negocio chico: sin rodeos, sin pantallas innecesarias, con lenguaje que tuteá al usuario y trata su tiempo como lo más valioso. El sistema visual no busca impresionar — busca que el dueño del negocio sienta que tiene todo bajo control.

La paleta combina un índigo vibrante (#4B5EFC) sobre fondos casi blancos (#F8FAFC), creando una sensación de claridad y orden. El sidebar oscuro (#0B1020) ancla el espacio sin competir con el contenido. Los semáforos de color (verde éxito, ámbar advertencia, rojo urgente) comunican estado en un vistazo, sin necesidad de leer texto.

La densidad es media-alta: hay mucha información disponible, pero jerarquizada. Los elementos accionables son visualmente distintos de la información de soporte. La tipografía usa la fuente del sistema para sentirse nativa en cualquier celular.

**Key Characteristics:**
- Índigo eléctrico como único acento; todos los demás colores son semánticos o neutros
- Sidebar oscuro + contenido claro: contraste fuerte como ancla estructural
- Bordes suaves y sombras mínimas; la jerarquía se crea con color de fondo, no con sombras
- Tipografía del sistema; lectura fluida en cualquier dispositivo
- Chips pill para estado; cards con esquinas redondeadas generosas

## Colors

Paleta dual: índigo vibrante como voz del producto, más un sistema semántico de tres colores (verde/ámbar/rojo) para comunicar estado.

### Primary
- **Índigo Eléctrico** (`#4B5EFC`): Color de marca. Botones primarios, links activos, bordes de foco, íconos de acción principal. Es el único color que habla directamente por CLEO.
- **Índigo Claro** (`#7B8AFC`): Hover y variantes de menor jerarquía del índigo principal.
- **Índigo Palido** (`rgba(75,94,252,0.08)`): Fondo de elementos seleccionados, chips activos, áreas destacadas sin peso visual.

### Neutral
- **Fondo Principal** (`#F8FAFC`): Fondo de página. Casi blanco con un toque azulado frío.
- **Superficie Card** (`#FFFFFF`): Fondo de tarjetas y modales. Blanco puro.
- **Superficie Sutil** (`#F8F9FC`): Fondo de secciones internas dentro de un card, separadores visuales suaves.
- **Borde Suave** (`#E5E7EB`): Borde de inputs, cards, divisores. El borde predeterminado.
- **Borde Fuerte** (`#D1D5DB`): Borde con más peso visual cuando se necesita definición.
- **Texto Principal** (`#0F1117`): Casi negro. Para texto de contenido y títulos.
- **Texto Atenuado** (`#6B7280`): Texto secundario, labels, metadatos.
- **Texto Tenue** (`#9CA3AF`): Placeholders, texto de menor relevancia.

### Tertiary (Sidebar)
- **Sidebar Oscuro** (`#0B1020`): Fondo de navegación lateral. Contraste alto con el contenido principal.
- **Sidebar Card** (`#11182F`): Hover y áreas activas dentro del sidebar.

### Semánticos
- **Verde Éxito** (`#10B981`) + fondo (`#ECFDF5`): Pagado, entregado, completado.
- **Ámbar Pendiente** (`#F59E0B`) + fondo (`#FFFBEB`): Pendiente, anticipo, en proceso.
- **Rojo Urgente** (`#EF4444`) + fondo (`#FEF2F2`): Error, urgente, rechazado.

**La Regla del Semáforo.** Verde, ámbar y rojo son exclusivamente para comunicar estado. Nunca decorativos, nunca para diferenciar categorías sin carga semántica.

**La Regla del Acento Único.** El índigo (#4B5EFC) es la única voz visual de CLEO. Cualquier otro color con acento es semántico (estado) o pertenece al perfil personalizable del usuario. Nunca introducir un segundo acento decorativo.

## Typography

**Font:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (fuente del sistema en todas las plataformas)

**Carácter:** La fuente del sistema crea inmediatamente una sensación nativa y familiar para el usuario de celular. Sin carga tipográfica extra, sin descarga de web fonts. La jerarquía se construye con peso y tamaño, no con familias distintas.

### Hierarchy
- **Título de sección** (700, 18px, 1.3): Nombre de módulo activo (Hoy, Pipeline, Clientes). Solo uno por pantalla.
- **Título de ítem** (600, 15-16px, 1.4): Nombre de cliente, nombre de pedido. El elemento principal dentro de una card.
- **Body** (400, 14px, 1.55): Contenido de notas, descripciones, detalle de ítem. Lectura primaria.
- **Label** (600, 11px, letter-spacing 0.5px, UPPERCASE): Cabeceras de columnas, etiquetas de campo ("CLIENTE", "TOTAL", "ESTADO"). Siempre en mayúsculas.
- **Caption** (700, 10px, letter-spacing 0.5px, UPPERCASE): Chips de estado, etiquetas de categoría pequeñas. Máxima condensación.
- **Monto** (700, 16-18px): Valores monetarios. Se tratan como datos primarios con peso visual propio.

**La Regla del UPPERCASE Reservado.** Las mayúsculas completas se reservan exclusivamente para labels de columna y chips de categoría. El cuerpo del texto y los títulos siempre en sentence case. Mezclarlos degrada la jerarquía.

## Layout

CLEO usa un layout de dos columnas en desktop: sidebar de navegación oscuro fijo a la izquierda (~220px), contenido principal a la derecha. En mobile, la navegación se mueve a una barra inferior o a un menú de hamburguesa, y el contenido ocupa toda la pantalla.

El contenido principal tiene padding de 16px en mobile y 20-24px en desktop. Las cards se apilan verticalmente con gap de 8-12px. Los modales son centrados con max-width de ~480px y max-height del 88-94vh en mobile.

La densidad es deliberadamente media-alta: se muestra suficiente información en cada card para tomar decisiones sin entrar al detalle. La regla es: lo que se puede ver en una pantalla debe ser suficiente para la acción más común.

## Elevation & Depth

El sistema es casi completamente plano. La profundidad se crea con diferencia de color de fondo (blanco sobre gris-azul claro), no con sombras. Las sombras existen solo en dos contextos: el borde inferior de cards (sutil, `0 1px 2px rgba(0,0,0,0.03)`) y los dropdowns/modales flotantes (`0 8px 24px rgba(0,0,0,0.10)`).

### Shadow Vocabulary
- **Sombra de card** (`0 1px 2px rgba(0,0,0,0.03)`): Separación mínima de la superficie de fondo. Casi invisible; refuerza el límite sin añadir dramatismo.
- **Sombra de flotante** (`0 8px 24px rgba(0,0,0,0.10)`): Dropdowns de autocompletado, tooltips de fecha. Indica que el elemento está sobre la interfaz.

**La Regla Plano por Defecto.** Las superficies en reposo son planas. La sombra aparece únicamente cuando un elemento flota sobre el contenido (dropdown, modal, tooltip). Un card en la lista no tiene sombra prominente.

## Shapes

El lenguaje de formas es redondeado y amigable, con consistencia por jerarquía de componente. No hay elementos con esquinas cuadradas; la curva mínima es 6px.

- **Cards principales** (12-14px): La unidad de contenido central. Esquinas generosas que comunican amabilidad.
- **Inputs y selects** (8-10px): Un paso menos redondeados que los cards; indica interactividad sin competir visualmente.
- **Botones de acción** (10-12px): Similar a los cards; se sienten parte del mismo lenguaje.
- **Chips y badges** (20px — pill): Siempre en píldora. La forma circular indica estado o categoría, nunca acción primaria.
- **Botones de contacto/canal** (8px): Cuadrados con esquinas sutiles; discretos y funcionales.

**La Regla de la Jerarquía de Radio.** Cards > Botones > Inputs > Chips. El elemento más importante visualmente tiene el radio más generoso. Nunca mezclar un input con radio de 14px junto a una card con radio de 6px.

## Components

### Botones
- **Primario:** Fondo índigo (#4B5EFC), texto blanco, 10px padding vertical, 20px horizontal, radius 12px. Usado para la acción principal única de cada pantalla.
- **Secundario/Ghost:** Borde 1px `#E5E7EB`, fondo transparente o `#F8F9FC`, texto `#6B7280`, mismo radius. Para acciones de soporte.
- **Destructivo:** Fondo rojo (`#EF4444`) o borde rojo; usado solo para eliminar o rechazar con confirmación previa.
- **Hover/Focus:** Transición de fondo a variante más clara del color; sin escala ni transformaciones agresivas.

### Chips de Estado
- **Activo/Seleccionado:** Fondo índigo pálido (`rgba(75,94,252,0.08)`), texto índigo (#4B5EFC), pill (radius 20px), 11px font, 600 weight.
- **Inactivo:** Sin fondo, texto `#6B7280`, mismo radio.
- **Semánticos (Pagado/Pendiente/etc.):** Fondo del color correspondiente + 22% opacidad, texto del color sólido, misma forma pill.

### Cards / Contenedores
- **Radius:** 12-14px
- **Fondo:** Blanco (#FFFFFF) sobre fondo de página (#F8FAFC)
- **Sombra:** `0 1px 2px rgba(0,0,0,0.03)` — mínima
- **Borde:** `1px solid #E5E7EB` cuando el contraste con el fondo lo requiere
- **Padding interno:** 12-16px

### Inputs / Campos
- **Estilo:** Borde 1px `#E5E7EB`, fondo blanco, radius 8-10px, padding 9px 12px
- **Focus:** Borde cambia a índigo; sin glow. La claridad del borde es suficiente.
- **Placeholder:** Texto `#9CA3AF`, misma fuente en peso regular.
- **Error:** Borde rojo + mensaje de error debajo en rojo, pequeño.

### Navegación (Sidebar)
- **Fondo:** `#0B1020` — oscuro, contraste alto
- **ítem inactivo:** Texto `rgba(255,255,255,0.55)`, sin fondo
- **ítem activo:** Fondo `rgba(255,255,255,0.06)`, texto blanco, borde izquierdo índigo (3px)
- **Mobile:** Navegación inferior con íconos; el tab activo usa el color del perfil del usuario.

### Componente Firma: Vista "Hoy"
La vista Hoy es el componente más distintivo de CLEO: una lista priorizada de acciones concretas agrupadas por urgencia. Cada ítem muestra cliente, acción requerida, y contexto (cotización/pedido/cobro) en una card compacta. El color del borde izquierdo (ámbar = pendiente, verde = completado) comunica estado sin leer. Es la pantalla que define la promesa del producto.

## Do's and Don'ts

### Do:
- **Do** usar el índigo (#4B5EFC) para el único elemento de acción primaria por pantalla. Su rareté es su poder.
- **Do** usar verde/ámbar/rojo únicamente para estado real del negocio (pagado, pendiente, urgente). Nunca decorativo.
- **Do** usar radius 12-14px en cards y 20px (pill) en chips. La forma redondeada es parte de la voz de CLEO.
- **Do** usar la fuente del sistema (`-apple-system, BlinkMacSystemFont`). La familiaridad nativa es intencional.
- **Do** mantener el sidebar en `#0B1020`. El contraste con el contenido claro crea el ancla visual de la app.
- **Do** escribir labels en UPPERCASE (10-11px, letter-spacing 0.5px) para cabeceras de columna y etiquetas de campo.

### Don't:
- **Don't** usar el índigo como color de fondo decorativo o para separadores. Solo en acciones y estado activo.
- **Don't** introducir un segundo color de acento. El sistema de color es deliberadamente austero.
- **Don't** agregar sombras prominentes a cards en reposo. La separación visual viene del contraste de fondo.
- **Don't** usar tipografía con esquinas cuadradas o radius menor a 6px. Rompe el lenguaje amigable del sistema.
- **Don't** mezclar texto en UPPERCASE con body copy. Las mayúsculas son exclusivas de labels estructurales.
- **Don't** usar verde, ámbar o rojo para categorías sin carga semántica de estado (ej: no diferenciar tipos de cliente con estos colores).
