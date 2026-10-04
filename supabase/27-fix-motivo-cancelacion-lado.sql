-- ══════════════════════════════════════════════════════════════════════════════
-- 27-fix-motivo-cancelacion-lado.sql
-- Amplía el CHECK de pedidos.motivo_cancelacion_lado para incluir 'otro'.
--
-- CLEO usa tres valores: 'negocio', 'cliente', 'otro' (Otro motivo).
-- El schema original solo tenía los dos primeros.
-- SOLO CLEO PRUEBAS.
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  drop constraint if exists pedidos_motivo_cancelacion_lado_check;

alter table public.pedidos
  add constraint pedidos_motivo_cancelacion_lado_check
  check (motivo_cancelacion_lado in ('cliente', 'negocio', 'otro'));
