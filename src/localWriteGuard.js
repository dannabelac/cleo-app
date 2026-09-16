// Compare storage with the values this mounted interface has actually seen.
// Do not compare React values: startup migrations may transform those values.
// This detects stale tabs without relying on delayed browser storage events.
export const BUSINESS_KEYS = [
  "cleo_clientes", "cleo_cots", "cleo_ventas", "cleo_servicios",
  "cleo_pedidos", "cleo_productos", "cleo_productos_cat", "cleo_perfil",
  "cleo_cache_owner_user_id",
];

export const STALE_TAB_MESSAGE = "Hay cambios en otra pestaña. No guardamos este cambio para evitar sobrescribirlos. Tu formulario sigue abierto. Copia lo que escribiste antes de recargar esta pestaña.";

export function createLocalWriteGuard(storage) {
  const expected = new Map(BUSINESS_KEYS.map(key => [key, storage.getItem(key)]));
  function assertCurrent() {
    for (const [key, value] of expected) {
      if (storage.getItem(key) !== value) {
        const error = new Error(STALE_TAB_MESSAGE);
        error.code = "CLEO_STALE_TAB";
        throw error;
      }
    }
  }
  function write(key, value) {
    assertCurrent();
    storage.setItem(key, value);
    if (storage.getItem(key) !== String(value)) throw new Error("Escritura local incompleta");
    if (expected.has(key)) expected.set(key, String(value));
  }
  function remove(key) {
    assertCurrent();
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw new Error("Borrado local incompleto");
    if (expected.has(key)) expected.set(key, null);
  }
  return { assertCurrent, write, remove };
}
