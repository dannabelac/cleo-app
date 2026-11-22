-- SOLO LECTURA. Verifica, para ESTA cuenta puntual, si hay un bloat de
-- historial_contactos sin cleo_id (el mismo mecanismo del incidente de
-- QuotaExceededError ya documentado) que pudiera estar tronando el pull
-- al cargar la app, y por eso startCloudSync nunca llega a arrancar.

-- 1) negocio_id y schema_ver reales de esta cuenta
select id as negocio_id, nombre, schema_ver, updated_at
from public.negocios
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';

-- 2) Historial sin cleo_id para ESTE negocio (el síntoma del incidente anterior)
select
  count(*) filter (where cleo_id is null)  as sin_cleo_id,
  count(*) filter (where cleo_id is not null) as con_cleo_id,
  count(*)                                  as total
from public.historial_contactos h
join public.negocios n on n.id = h.negocio_id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';

-- 3) Tamaño aproximado de lo que cleo_dual_read tendría que devolver para
-- clientes (incluye su historial embebido) — para ver si hay bloat real
-- de tamaño, no solo de conteo.
select
  count(*)                                  as total_clientes,
  pg_size_pretty(sum(pg_column_size(c.*)))  as tamano_aprox
from public.clientes c
join public.negocios n on n.id = c.negocio_id
where n.user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';
