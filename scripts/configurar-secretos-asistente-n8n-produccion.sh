#!/usr/bin/env bash
# Guarda CLEO_ASISTENTE_N8N_URL y CLEO_ASISTENTE_N8N_SECRET en Supabase,
# EXCLUSIVAMENTE en el proyecto de PRODUCCIÓN (gpvpvkeqfcgypuoxvjne) -- el
# ref está fijo abajo y no se puede pasar por argumento ni variable de
# entorno. Usa la URL y el secreto del workflow de n8n NUEVO y SEPARADO de
# producción -- nunca reutilices la URL/secreto de CLEO Pruebas aquí.
#
# Corre esto en TU PROPIA terminal, nunca lo pegues en un chat. El valor:
#   - nunca aparece en el comando (se manda por --env-file, no como
#     NAME=VALUE en la línea de comando -- eso evitaría que quedara
#     visible en la lista de procesos del sistema),
#   - no se guarda en tu historial de shell (la lectura ocurre con
#     `read`, nunca se escribe el valor como un comando aparte),
#   - no queda en ningún archivo permanente (se escribe a un archivo
#     temporal con permisos solo-para-ti, y se borra siempre al salir,
#     incluso si el script falla o lo cancelas con Ctrl+C),
#   - no se imprime en ninguna parte de este script.
set -euo pipefail

PROJECT_REF="gpvpvkeqfcgypuoxvjne" # CLEO producción -- fijo a propósito, no editable por flag

echo "Esto va a guardar secretos en PRODUCCIÓN: $PROJECT_REF (CLEO, concleo.com)."
echo "Usa la Production URL y el secreto del workflow de n8n NUEVO de producción"
echo "(no el de CLEO Pruebas)."
echo
read -r -p "Para confirmar que es a propósito, escribe PRODUCCION: " CONFIRMA
if [ "$CONFIRMA" != "PRODUCCION" ]; then
  echo "No escribiste PRODUCCION tal cual, cancelado por seguridad." >&2
  exit 1
fi

echo
read -r -p "Production URL del webhook de n8n (producción): " N8N_URL
if [ -z "$N8N_URL" ]; then
  echo "URL vacía, cancelado." >&2
  exit 1
fi

# -s: no se muestra en pantalla mientras se escribe.
read -r -s -p "Secreto de Header Auth de producción (no se mostrará mientras escribes): " N8N_SECRET
echo
if [ -z "$N8N_SECRET" ]; then
  echo "Secreto vacío, cancelado." >&2
  exit 1
fi

TMPFILE="$(mktemp)"
# Solo tu usuaria puede leer este archivo mientras exista.
chmod 600 "$TMPFILE"
# Se borra SIEMPRE al salir del script, pase lo que pase (éxito, error,
# Ctrl+C).
trap 'rm -f "$TMPFILE"' EXIT

{
  printf 'CLEO_ASISTENTE_N8N_URL=%s\n' "$N8N_URL"
  printf 'CLEO_ASISTENTE_N8N_SECRET=%s\n' "$N8N_SECRET"
} > "$TMPFILE"

echo
echo "Guardando en Supabase (proyecto $PROJECT_REF -- PRODUCCIÓN)..."
npx supabase secrets set --env-file "$TMPFILE" --remote="$PROJECT_REF"

echo
echo "Listo. El archivo temporal ya se borró."
