-- SOLO LECTURA.
select
  count(*) filter (where h.cleo_id is null)     as sin_cleo_id,
  count(*) filter (where h.cleo_id is not null) as con_cleo_id,
  count(*)                                       as total
from public.historial_contactos h
join public.negocios n on n.id = h.negocio_id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';
