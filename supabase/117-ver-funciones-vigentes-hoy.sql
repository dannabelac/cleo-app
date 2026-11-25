-- SOLO LECTURA. Corre esta consulta SOLA primero.
select pg_get_functiondef('public.cleo_dual_flush(jsonb,text,timestamptz)'::regprocedure);
