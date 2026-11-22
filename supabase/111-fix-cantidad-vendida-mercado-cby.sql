-- Corrige UNA sola fila: Crema de Ajo 200gr en el evento
-- "Mercado CBY 21/11/2026" (negocio user_id = a75203f2-6ec6-45c2-8a18-951ab26a13d5).
-- cantidad_vendida decía 2 por el bug ya corregido en CLEO.jsx (.find() en
-- vez de sumar todas las líneas) — el real, verificado contra los 3 pedidos
-- reales vinculados al evento, es 3. Confirmado con supabase/110 que es la
-- ÚNICA fila de las 39 (todos los eventos de esta cuenta) con diferencia.
--
-- El "and cantidad_vendida = 2" es una guarda de seguridad: si por lo que
-- sea esa fila ya no está en 2 cuando corras esto, el UPDATE no afecta
-- ninguna fila (0 actualizadas) en vez de sobreescribir a ciegas.

update public.eventos_productos
set cantidad_vendida = 3
where id = 'bbf8091c-d1c8-416e-bdf5-3e618e667cce'
  and cantidad_vendida = 2
returning id, evento_id, nombre, cantidad_vendida;
