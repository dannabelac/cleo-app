-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- Solo consulta: no modifica tablas, usuarios, políticas ni datos.
-- Inspecciona la configuración vigente; no sustituye pruebas autenticadas de API.
select 'tabla' as tipo, c.relname as objeto,
       jsonb_build_object('rls_activo', c.relrowsecurity,
                          'rls_forzado', c.relforcerowsecurity) as detalle
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('user_data','legal_acceptances')
union all
select 'politica', tablename || ' / ' || policyname,
       jsonb_build_object('roles',roles,'comando',cmd,
                          'using',qual,'with_check',with_check,
                          'permisiva',permissive)
from pg_policies
where schemaname = 'public' and tablename in ('user_data','legal_acceptances')
union all
select 'permiso', t.tabla || ' / ' || r.rol,
       jsonb_build_object('select',has_table_privilege(r.rol,'public.'||t.tabla,'SELECT'),
                          'insert',has_table_privilege(r.rol,'public.'||t.tabla,'INSERT'),
                          'update',has_table_privilege(r.rol,'public.'||t.tabla,'UPDATE'),
                          'delete',has_table_privilege(r.rol,'public.'||t.tabla,'DELETE'))
from (values ('user_data'),('legal_acceptances')) t(tabla)
cross join (values ('anon'),('authenticated')) r(rol)
order by tipo, objeto;
