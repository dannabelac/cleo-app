-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- BORRADOR — ejecutar DESPUÉS de 03-schema-relacional.sql.
-- Políticas de Storage para bucket 'cleo-cotizacion-archivos'.
--
-- PRERREQUISITO: el bucket debe existir antes de correr este script.
-- Crearlo en: Supabase Dashboard → Storage → New bucket
--   Nombre:  cleo-cotizacion-archivos
--   Público: NO (privado)
--
-- Estructura de paths en el bucket:
--   {user_id}/{cotizaciones|pedidos}/{doc_cleo_id}/{uuid}.{ext}
--
-- Estas políticas se mantienen en un archivo separado del DDL principal
-- porque pueden necesitar ajustarse de forma independiente y porque
-- Supabase permite gestionarlas también desde el Dashboard.
-- ══════════════════════════════════════════════════════════════════════════════

-- Guard: verificar que la tabla archivo_adjuntos existe (depende de 03).
do $guard$
begin
  if to_regclass('public.archivo_adjuntos') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
end;
$guard$;

-- Cada usuario solo accede a la carpeta cuyo nombre coincide con su uid.
-- La función storage.foldername(name) devuelve el array de segmentos del path;
-- el primer segmento [1] es el user_id.

create policy "storage: subir archivo propio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cleo-cotizacion-archivos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "storage: leer archivo propio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'cleo-cotizacion-archivos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "storage: eliminar archivo propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'cleo-cotizacion-archivos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Verificación: las tres políticas deben aparecer con bucket correcto.
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'storage:%'
order by policyname;
