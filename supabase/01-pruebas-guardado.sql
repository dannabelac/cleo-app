-- SOLO para CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- Configuración mínima para probar inicio de sesión y sincronización.
-- No es una copia completa del esquema de producción.
-- No contiene usuarios, aceptaciones ni datos reales.
begin;

-- Detenerse si ya existen las tablas: evita modificar la beta por accidente.
do $$
begin
  if to_regclass('public.user_data') is not null
     or to_regclass('public.legal_acceptances') is not null then
    raise exception 'Las tablas ya existen. Detente y verifica que estés en CLEO Pruebas.';
  end if;
end;
$$;

create table public.user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  tipo_perfil text,
  updated_at timestamptz not null default now(),
  constraint user_data_object check (jsonb_typeof(data) = 'object')
);

alter table public.user_data enable row level security;
revoke all on table public.user_data from anon, authenticated;
grant select, insert, update, delete on table public.user_data to authenticated;

create policy "Usuarios administran sus datos"
on public.user_data for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.cleo_test_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.cleo_test_set_updated_at() from public;
create trigger trg_user_data_set_updated_at
before insert or update on public.user_data
for each row execute function public.cleo_test_set_updated_at();

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  privacy_version text not null,
  terms_version text not null,
  adult_confirmed boolean not null check (adult_confirmed),
  financial_consent boolean not null check (financial_consent),
  acceptance_channel text not null check (acceptance_channel = 'web'),
  created_at timestamptz not null default now(),
  unique (user_id, privacy_version, terms_version, acceptance_channel)
);

alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
grant insert (user_id, privacy_version, terms_version, adult_confirmed,
  financial_consent, acceptance_channel)
on public.legal_acceptances to authenticated;

create policy "Usuarios consultan sus aceptaciones"
on public.legal_acceptances for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Usuarios registran sus aceptaciones"
on public.legal_acceptances for insert to authenticated
with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
commit;

-- Resultado esperado: dos tablas, ambas con rls_activo = true.
select relname as tabla, relrowsecurity as rls_activo
from pg_class
where oid in ('public.user_data'::regclass, 'public.legal_acceptances'::regclass)
order by relname;
