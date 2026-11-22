-- SOLO LECTURA. Corre nada más esto (no el archivo 109 completo), para ver
-- únicamente cleo_eventos_inventario de esta cuenta.
select jsonb_pretty(data->'cleo_eventos_inventario') as eventos_inventario
from public.user_data
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';
