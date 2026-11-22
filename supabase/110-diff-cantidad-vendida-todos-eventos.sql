-- SOLO LECTURA. Compara, para TODOS los eventos de esta cuenta, lo que
-- cantidad_vendida dice hoy contra lo que de verdad suman los pedidos
-- reales vinculados (excluyendo cancelados) — el mismo cálculo que ya
-- corregimos en el cliente (CLEO.jsx), aplicado aquí sobre los datos ya
-- guardados. Nada se modifica con esto.

with evento_pedidos as (
  select
    ei.id as evento_id,
    ei.nombre as evento_nombre,
    ei.fecha as evento_fecha,
    jsonb_array_elements_text(ei.pedidos_ids) as ped_cleo_id
  from public.eventos_inventario ei
  join public.negocios n on n.id = ei.negocio_id
  where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5'
),
items_reales as (
  select
    ep.evento_id,
    (item->>'catalogoId') as catalogo_id,
    sum(greatest(0, coalesce((item->>'cantidad')::numeric, 0)))::int as vendida_real
  from evento_pedidos ep
  join public.pedidos p
    on p.cleo_id = ep.ped_cleo_id
  cross join lateral jsonb_array_elements(p.items) as item
  where p.estado_pedido <> 'cancelado'
  group by ep.evento_id, (item->>'catalogoId')
)
select
  eprod.id as eventos_productos_id,
  ei.nombre as evento_nombre,
  ei.fecha as evento_fecha,
  eprod.nombre as producto,
  eprod.catalogo_id,
  eprod.cantidad_vendida as vendida_guardada,
  coalesce(ir.vendida_real, 0) as vendida_real,
  (coalesce(ir.vendida_real, 0) - eprod.cantidad_vendida) as diferencia
from public.eventos_productos eprod
join public.eventos_inventario ei on ei.id = eprod.evento_id
join public.negocios n on n.id = eprod.negocio_id
left join items_reales ir
  on ir.evento_id = eprod.evento_id
 and ir.catalogo_id = eprod.catalogo_id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5'
order by (coalesce(ir.vendida_real,0) - eprod.cantidad_vendida) <> 0 desc, ei.fecha desc, producto;
