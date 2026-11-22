-- SOLO LECTURA. ¿Existe la tabla relacional de eventos en ESTA base
-- (producción)? No asumir por el comentario del archivo 40 — confirmarlo.
select
  to_regclass('public.eventos_inventario') as existe_eventos_inventario,
  to_regclass('public.eventos_productos')  as existe_eventos_productos,
  to_regclass('public.eventos_gastos')     as existe_eventos_gastos;
