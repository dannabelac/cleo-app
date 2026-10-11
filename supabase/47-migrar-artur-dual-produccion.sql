-- ══════════════════════════════════════════════════════════════════════════════
-- 47-migrar-artur-dual-produccion.sql
-- PRODUCCIÓN únicamente — ejecutar en el SQL Editor de CLEO (proyecto principal)
--
-- Migra artur.szklarski2@gmail.com de blob a dual.
-- Lee su blob actual de user_data y llama cleo_dual_flush para poblar las
-- tablas relacionales en una sola transacción atómica.
--
-- Soporta dos casos:
--   A) El negocio ya existe con schema_ver='blob' → se actualiza a 'dual'
--   B) No existe negocio todavía (usuario blob puro) → cleo_dual_flush lo crea
--
-- REVERSIBLE: si el bloque falla → ROLLBACK automático.
--   Para revertir manualmente después del éxito:
--     UPDATE public.negocios SET schema_ver='blob'
--     WHERE user_id = (SELECT id FROM auth.users WHERE email='artur.szklarski2@gmail.com');
--
-- IDEMPOTENTE: NO — si el negocio ya está en dual, cleo_dual_flush devuelve
--   'conflicto' o error. Hacer rollback manual antes de reintentar.
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_email          text    := 'artur.szklarski2@gmail.com';
  v_uid            uuid;
  v_neg_id         uuid;
  v_neg_sv         text;
  v_neg_tp         text;
  v_ud_updated_at  timestamptz;
  v_blob           jsonb;
  v_resultado      jsonb;

  -- Contadores de verificación
  v_n_clientes     int;
  v_n_pedidos      int;
  v_n_eventos      int;
  v_n_gastos       int;
begin

  -- ── 1. OBTENER USUARIO ────────────────────────────────────────────────────
  select id into v_uid
    from auth.users
   where email = v_email
   limit 1;

  if v_uid is null then
    raise exception 'FALLO: % no existe en auth.users de este proyecto.', v_email;
  end if;
  raise notice 'Usuario encontrado: %', v_uid;

  -- ── 2. OBTENER NEGOCIO (puede no existir para usuarios blob puros) ────────
  select n.id, n.schema_ver, n.tipo_perfil
    into v_neg_id, v_neg_sv, v_neg_tp
    from public.negocios n
   where n.user_id = v_uid
   limit 1;

  if v_neg_id is not null then
    raise notice 'Negocio encontrado: % | schema_ver: % | tipo_perfil: %', v_neg_id, v_neg_sv, v_neg_tp;
    if v_neg_sv = 'dual' then
      raise exception 'FALLO: el negocio ya está en dual. Nada que hacer.';
    end if;
    if v_neg_sv <> 'blob' then
      raise exception 'FALLO: schema_ver inesperado: %. No continuar.', v_neg_sv;
    end if;
  else
    raise notice 'No existe negocio aún — cleo_dual_flush lo creará con schema_ver=dual.';
  end if;

  -- ── 3. OBTENER BLOB ACTUAL DE USER_DATA ───────────────────────────────────
  select ud.updated_at, ud.data
    into v_ud_updated_at, v_blob
    from public.user_data ud
   where ud.user_id = v_uid;

  if v_blob is null then
    raise exception 'FALLO: no hay user_data para %. Nada que migrar.', v_email;
  end if;

  -- Extraer tipo_perfil del blob si no teníamos negocio
  if v_neg_tp is null then
    v_neg_tp := coalesce(v_blob ->> 'cleo_tipo_perfil',
                         v_blob -> 'cleo_perfil' ->> 'tipoPerfil',
                         'productos');
    raise notice 'tipo_perfil extraído del blob: %', v_neg_tp;
  end if;

  -- Validar claves mínimas
  if v_blob -> 'cleo_oportunidades' is null then
    raise exception 'FALLO: el blob no tiene cleo_oportunidades — datos muy antiguos o truncados.';
  end if;
  if v_blob -> 'cleo_tombstones' is null then
    raise exception 'FALLO: el blob no tiene cleo_tombstones — datos muy antiguos o truncados.';
  end if;

  raise notice 'Blob obtenido. updated_at: %', v_ud_updated_at;
  raise notice '  clientes:  %', jsonb_array_length(coalesce(v_blob -> 'cleo_clientes',          '[]'::jsonb));
  raise notice '  pedidos:   %', jsonb_array_length(coalesce(v_blob -> 'cleo_pedidos',           '[]'::jsonb));
  raise notice '  eventos:   %', jsonb_array_length(coalesce(v_blob -> 'cleo_eventos_inventario','[]'::jsonb));

  -- ── 4. CAMBIAR schema_ver A 'dual' (solo si el negocio ya existía) ────────
  if v_neg_id is not null then
    update public.negocios
       set schema_ver = 'dual'
     where id = v_neg_id;
    raise notice 'schema_ver actualizado a dual.';
  end if;
  -- Si no había negocio, cleo_dual_flush lo crea directamente con schema_ver='dual'.

  -- ── 5. SIMULAR auth.uid() = uid de Artur ─────────────────────────────────
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text,
    true
  );

  -- ── 6. LLAMAR cleo_dual_flush ─────────────────────────────────────────────
  select public.cleo_dual_flush(
    v_blob,
    v_neg_tp,
    v_ud_updated_at
  ) into v_resultado;

  raise notice 'Resultado de cleo_dual_flush: %', v_resultado;

  if v_resultado is null then
    raise exception 'FALLO: cleo_dual_flush devolvió null.';
  end if;

  if v_resultado ->> 'estado' <> 'ok' then
    raise exception 'FALLO en cleo_dual_flush: estado=% | %',
      v_resultado ->> 'estado', v_resultado;
  end if;

  -- ── 7. OBTENER negocio_id si fue creado por cleo_dual_flush ──────────────
  if v_neg_id is null then
    select n.id into v_neg_id
      from public.negocios n
     where n.user_id = v_uid
     limit 1;
    raise notice 'Negocio creado por cleo_dual_flush: %', v_neg_id;
  end if;

  -- ── 8. VERIFICAR DATOS MIGRADOS ───────────────────────────────────────────
  select count(*) into v_n_clientes
    from public.clientes where negocio_id = v_neg_id;

  select count(*) into v_n_pedidos
    from public.pedidos where negocio_id = v_neg_id;

  select count(*) into v_n_eventos
    from public.eventos_inventario where negocio_id = v_neg_id;

  select count(*) into v_n_gastos
    from public.eventos_gastos where negocio_id = v_neg_id;

  raise notice '── Verificación ──────────────────────────────────────────────';
  raise notice '  clientes en tabla:  %', v_n_clientes;
  raise notice '  pedidos en tabla:   %', v_n_pedidos;
  raise notice '  eventos en tabla:   %', v_n_eventos;
  raise notice '  gastos en tabla:    %', v_n_gastos;
  raise notice '  pedidos con evento_id: %',
    (select count(*) from public.pedidos
      where negocio_id = v_neg_id and evento_id is not null);

  raise notice '══ MIGRACIÓN EXITOSA: % ahora en dual mode ══', v_email;

end;
$$;


-- ── Consulta de revisión rápida (opcional — corre después del bloque) ──────
/*
select
  c.nombre            as cliente,
  p.cleo_id           as pedido_id,
  p.evento_id         as evento_id_relacional,
  p.estado_pedido,
  p.monto_total
from public.pedidos p
left join public.clientes c on c.id = p.cliente_id
where p.negocio_id = (
  select n.id from public.negocios n
  join auth.users u on u.id = n.user_id
  where u.email = 'artur.szklarski2@gmail.com'
)
order by p.fecha desc;
*/
