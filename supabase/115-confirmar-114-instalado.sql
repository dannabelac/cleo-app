-- SOLO LECTURA. Confirma que las dos funciones ya tienen el cambio de
-- promos_rapidas instalado (no solo que el CREATE OR REPLACE no dio error).
select
  (pg_get_functiondef('public.cleo_dual_flush(jsonb,text,timestamptz)'::regprocedure)
    like '%promos_rapidas%') as flush_tiene_promos_rapidas,
  (pg_get_functiondef('public.cleo_dual_read()'::regprocedure)
    like '%promos_rapidas%') as read_tiene_promos_rapidas;
