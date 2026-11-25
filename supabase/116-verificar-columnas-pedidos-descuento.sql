-- SOLO LECTURA. Confirma si pedidos ya tiene columnas descuento/tipo_descuento
-- (no debería, pero se verifica, no se asume).
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='pedidos'
  and column_name in ('descuento','tipo_descuento','promo_venta');
