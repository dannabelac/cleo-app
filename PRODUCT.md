# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hombres y mujeres dueños de pequeños negocios que venden bajo pedido o prestan servicios: costureras, joyeras, reposteras, fotógrafos, diseñadores, consultores, vendedores por catálogo. Trabajan solos o con muy poco equipo, mayormente desde el celular, y manejan todo su negocio sin herramientas dedicadas.

## Product Purpose

CLEO organiza clientes, cotizaciones, pedidos, seguimientos y cobros en un solo lugar, sin configuración compleja. Le dice al usuario exactamente qué necesita su atención cada día. El éxito es que el dueño del negocio nunca pierda un cliente ni un pedido por falta de seguimiento.

## Positioning

Todo en uno, hecho para el ritmo del negocio chico: no es un CRM genérico ni un Excel, sino una herramienta que entiende cómo trabaja alguien que vende bajo pedido o por servicio y que no tiene tiempo para aprender software.

## Operating Context

El app se usa mientras se atienden clientes, en cualquier momento del día, principalmente desde celular. Los usuarios manejan WhatsApp como canal principal de comunicación y necesitan generar cotizaciones y comprobantes para compartir ahí mismo. El flujo típico: nuevo prospecto → cotización → pedido / trabajo → entrega → cobro.

## Capabilities and Constraints

- Dos perfiles de negocio: **servicios** (pipeline, cotizaciones, trabajos) y **productos** (prospectos, pedidos, inventario)
- Vista "Hoy" que consolida todo lo que necesita atención ese día
- Generación de PDFs: cotización, comprobante de pago, reporte comercial, reporte de inventario
- Sincronización en la nube vía Supabase (un blob JSON por usuario)
- Autenticación por magic link (correo, sin contraseña)
- App web progresiva; no es app nativa
- Un solo componente principal (~4000+ líneas); sin rutas separadas

## Brand Commitments

- **Nombre:** CLEO — no cambia
- **Colores:** morado para perfil servicios, azul para perfil productos; ambos se conservan aunque pueden refinarse
- **Tono:** cercano, en español mexicano, tuteando, sin tecnicismos — es parte de la identidad y no cambia

## Evidence on Hand

- Implementación visual completa en `src/CLEO.jsx`
- PDFs generados: `src/CotizacionPDF.jsx`, `src/ComprobantePDF.jsx`, `src/ReporteComercialPDF.jsx`, `src/ReporteInventarioPDF.jsx`
- Pantalla de autenticación: `src/AuthGate.jsx`
- Datos de demostración embebidos en `src/CLEO.jsx` (perfilDemoProductos, perfilDemoServicios)

## Product Principles

1. **Claridad sobre control** — mostrarle al usuario qué hacer hoy es más valioso que darle opciones infinitas de configuración.
2. **Hecho para el celular, pensado para el negocio chico** — cada flujo debe funcionar bien en pantalla pequeña y con interrupciones frecuentes.
3. **Confianza sin fricción** — el usuario debe sentir que CLEO no le va a perder información; la sincronización y los conflictos se resuelven de forma transparente.
4. **Lenguaje propio** — el tono cercano y el español mexicano son parte del producto, no del copy.
5. **Lo que no estorba, ayuda** — cualquier elemento que no sea accionable en ese momento debe quedar en segundo plano.

## Accessibility & Inclusion

Usuarios con nivel técnico bajo; el app debe ser autoexplicativo sin tutoriales. Uso mayoritario en móvil con conectividad variable.
