-- SOLO LECTURA.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='pedidos'
      and column_name in ('descuento','tipo_descuento')) as columnas_nuevas_en_pedidos,
  (pg_get_functiondef('public.cleo_dual_flush(jsonb,text,timestamptz)'::regprocedure) like '%tipo_descuento%') as flush_tiene_descuento,
  (pg_get_functiondef('public.cleo_dual_read()'::regprocedure) like '%pd.descuento%') as read_tiene_descuento;
