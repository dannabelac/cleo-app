-- SOLO LECTURA. No modifica nada. Ver supabase/110 (aún no escrito) para
-- el UPDATE real una vez confirmados estos datos.
--
-- Objetivo: ver los datos REALES del evento "Mercado CBY 21/11/2026" para
-- el negocio con user_id = a75203f2-6ec6-45c2-8a18-951ab26a13d5, antes de
-- escribir cualquier corrección. No asumir los números de la captura —
-- puede haber más días/ventas que no se vieron ahí.
--
-- user_data.data sigue siendo la fuente de cleo_eventos_inventario sin
-- importar el schema_ver del negocio (no existe todavía una tabla
-- relacional de eventos/inventario). cleo_pedidos puede venir de
-- user_data.data (modo blob) o de la tabla pedidos (modo dual/relacional);
-- este script muestra ambas fuentes para no asumir cuál aplica.

-- 1) Identificar el negocio y su schema_ver
select id as negocio_id, nombre, tipo_perfil, schema_ver
from public.negocios
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';

-- 2) Eventos guardados en el blob (ahí vive cleo_eventos_inventario siempre)
select jsonb_pretty(data->'cleo_eventos_inventario') as eventos_inventario
from public.user_data
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';

-- 3) Pedidos guardados en el blob (solo aplica si el negocio sigue en 'blob')
select jsonb_pretty(data->'cleo_pedidos') as pedidos_blob
from public.user_data
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';

-- 4) Pedidos en la tabla relacional (solo aplica si schema_ver es 'dual' o 'relacional')
select p.cleo_id, p.estado_pedido, p.items, p.monto_total, p.fecha
from public.pedidos p
join public.negocios n on n.id = p.negocio_id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5'
order by p.fecha desc, p.created_at desc;
