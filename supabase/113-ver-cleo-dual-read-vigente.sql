-- SOLO LECTURA. Ver cleo_dual_read tal como está instalada hoy en producción.
select pg_get_functiondef('public.cleo_dual_read()'::regprocedure);
