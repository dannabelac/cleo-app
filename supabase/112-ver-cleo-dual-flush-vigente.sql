-- SOLO LECTURA. Ver la función cleo_dual_flush TAL COMO ESTÁ INSTALADA hoy
-- en producción — no asumir cuál de las 17 versiones del historial de
-- archivos del repo es la vigente.
select pg_get_functiondef('public.cleo_dual_flush(jsonb,text,timestamptz)'::regprocedure);
