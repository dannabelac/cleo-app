#!/usr/bin/env bash
# Guarda CLEO_ASISTENTE_N8N_URL y CLEO_ASISTENTE_N8N_SECRET en Supabase,
# EXCLUSIVAMENTE en el proyecto cleo-pruebas (pconfadsbtwjbjeblxgl) --
# nunca en producción, el ref está fijo abajo y no se puede pasar por
# argumento ni variable de entorno.
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

PROJECT_REF="pconfadsbtwjbjeblxgl" # cleo-pruebas -- fijo a propósito, no editable por flag

echo "Esto va a guardar secretos SOLO en el proyecto: $PROJECT_REF (cleo-pruebas)."
echo

read -r -p "URL de producción del webhook de n8n: " N8N_URL
if [ -z "$N8N_URL" ]; then
  echo "URL vacía, cancelado." >&2
  exit 1
fi

# -s: no se muestra en pantalla mientras se escribe.
read -r -s -p "Secreto de Header Auth (no se mostrará mientras escribes): " N8N_SECRET
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
echo "Guardando en Supabase (proyecto $PROJECT_REF)..."
npx supabase secrets set --env-file "$TMPFILE" --remote="$PROJECT_REF"

echo
echo "Listo. El archivo temporal ya se borró."
