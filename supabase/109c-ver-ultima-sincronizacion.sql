-- SOLO LECTURA. Para saber si el blob de esta cuenta lleva rato sin
-- sincronizar (problema real) o si es solo que todavía no le toca el
-- siguiente ciclo de 5 segundos (normal).
select
  updated_at,
  now() - updated_at as hace_cuanto,
  tipo_perfil
from public.user_data
where user_id = 'a75203f2-6ec6-45c2-8a18-951ab26a13d5';
