-- 38-fix-colores-negocios.sql
-- Copia color y color_sec del blob user_data → negocios para dannaacubel@gmail.com.
-- Los colores están en user_data pero nunca llegaron a negocios (migración incompleta).
-- Idempotente: si ya tiene color no lo sobreescribe con null.
-- ══════════════════════════════════════════════════════════════════════════════

update public.negocios n
set
  color     = nullif(ud.data -> 'cleo_perfil' ->> 'color', ''),
  color_sec = nullif(ud.data -> 'cleo_perfil' ->> 'colorSecundario', '')
from public.user_data ud
where ud.user_id = n.user_id
  and ud.user_id = (select id from auth.users where email = 'dannaacubel@gmail.com');

-- Verificación
select n.color, n.color_sec
from public.negocios n
join public.user_data ud on ud.user_id = n.user_id
join auth.users u on u.id = n.user_id
where u.email = 'dannaacubel@gmail.com';
