-- SOLO LECTURA.
select
  ei.id as evento_id, ei.cleo_id, ei.nombre, ei.fecha, ei.estado, ei.pedidos_ids,
  ep.catalogo_id, ep.nombre as producto, ep.cantidad as llevada, ep.cantidad_vendida as vendida
from public.eventos_inventario ei
join public.negocios n on n.id = ei.negocio_id
left join public.eventos_productos ep on ep.evento_id = ei.id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5'
order by ei.fecha desc, ep.nombre;
