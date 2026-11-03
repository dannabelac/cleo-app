#!/usr/bin/env bash
# Prueba DIRECTA a n8n (sin pasar por asistente-proxy), para aislar si el
# problema está en el tramo hacia n8n. Corre esto en TU PROPIA terminal,
# nunca lo pegues en un chat.
#
# El secreto:
#   - no se muestra en pantalla mientras lo escribes (read -s),
#   - no se guarda en tu historial de shell,
#   - no se escribe en ningún archivo (va directo a la cabecera del
#     curl, en memoria, nunca a disco),
#   - nunca se imprime en este script, en ningún resultado -- solo su
#     longitud y si tiene espacios/caracteres raros, para detectar
#     typos de copiado sin revelar el contenido.
#
# El cuerpo de la respuesta de n8n SÍ se imprime cuando el código no es
# 2xx -- es el mensaje de error propio de n8n (quién rechaza y por qué),
# no datos de CLEO ni el secreto, así que es seguro mostrarlo para
# diagnosticar.
set -uo pipefail

echo "Esto prueba tu webhook de n8n DIRECTO, sin pasar por asistente-proxy."
echo

read -r -p "Production URL del webhook de n8n: " N8N_URL
if [ -z "$N8N_URL" ]; then
  echo "URL vacía, cancelado." >&2
  exit 1
fi

read -r -s -p "Secreto de Header Auth (no se mostrará mientras escribes): " N8N_SECRET
echo
if [ -z "$N8N_SECRET" ]; then
  echo "Secreto vacío, cancelado." >&2
  exit 1
fi

echo
echo "────────────────────────────────────────────"
echo "URL que se usará: $N8N_URL"
echo "Cabecera que se enviará: x-cleo-asistente-secret (fija, igual a la que usa asistente-proxy)"
SECRET_LEN=${#N8N_SECRET}
echo "Longitud de la clave ingresada: $SECRET_LEN caracteres (el contenido nunca se muestra)."
if [[ "$N8N_SECRET" == " "* || "$N8N_SECRET" == *" " ]]; then
  echo "Aviso: la clave tiene un espacio al inicio o al final -- revisa que no se haya copiado de más."
fi
if printf '%s' "$N8N_SECRET" | LC_ALL=C grep -q '[^ -~]'; then
  echo "Aviso: la clave contiene caracteres fuera del rango ASCII imprimible normal"
  echo "(posible espacio especial, salto de línea o carácter invisible copiado desde otra app)."
fi
echo "────────────────────────────────────────────"
echo
echo "Enviando una solicitud de prueba (máximo 15s de espera)..."

RESPONSE="$(curl -s -w $'\n%{http_code}' --max-time 15 -X POST "$N8N_URL" \
  -H "x-cleo-asistente-secret: $N8N_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mensaje":"prueba directa, por favor ignora este mensaje","historial":[]}')"
CURL_EXIT=$?
RESP_CODE="${RESPONSE##*$'\n'}"
RESP_BODY="${RESPONSE%$'\n'*}"

echo
echo "────────────────────────────────────────────"
if [ $CURL_EXIT -ne 0 ]; then
  echo "No hubo respuesta HTTP en absoluto (curl terminó con código $CURL_EXIT)."
  case $CURL_EXIT in
    6)
      echo "Diagnóstico: no se pudo resolver el nombre de dominio de la URL."
      echo "  -> Revisa que la URL esté bien escrita, sin espacios ni typos."
      ;;
    7)
      echo "Diagnóstico: no se pudo establecer conexión (conexión rechazada)."
      echo "  -> El host podría no estar aceptando conexiones en esa ruta/puerto,"
      echo "     o algo (firewall, VPN) está bloqueando el acceso desde internet."
      ;;
    28)
      echo "Diagnóstico: tiempo de espera agotado (más de 15s sin respuesta)."
      echo "  -> n8n podría estar tardando demasiado, o la solicitud se quedó"
      echo "     esperando sin que el workflow la procesara."
      ;;
    35|60)
      echo "Diagnóstico: problema de conexión segura (TLS/certificado)."
      ;;
    *)
      echo "Diagnóstico: fallo de conexión genérico (código curl $CURL_EXIT)."
      ;;
  esac
  echo
  echo "En cualquiera de estos casos, muy probablemente la solicitud NUNCA"
  echo "llegó a iniciar una ejecución en n8n -- consistente con no verla en"
  echo "Executions, pero no es la única causa posible de eso (ver abajo)."
else
  echo "Código HTTP recibido: $RESP_CODE"
  echo
  case "$RESP_CODE" in
    200|201|202|204)
      echo "Diagnóstico: n8n respondió con éxito. La autenticación y la"
      echo "conexión funcionan -- si en Executions tampoco aparece esta"
      echo "prueba, revisa si el workflow está configurado para no guardar"
      echo "ejecuciones exitosas."
      ;;
    401|403)
      echo "Diagnóstico: RECHAZO DE AUTENTICACIÓN. n8n sí recibió la"
      echo "solicitud, pero el secreto (o el nombre de la cabecera) no"
      echo "coincide con lo configurado en Header Auth."
      echo "  -> Un rechazo de autenticación normalmente ocurre ANTES de que"
      echo "     n8n cree un registro de ejecución -- por eso no verla en"
      echo "     Executions no significa que la solicitud no haya llegado."
      echo "  -> El cuerpo de la respuesta (abajo) suele decir quién la"
      echo "     rechazó -- revísalo."
      ;;
    404)
      echo "Diagnóstico: WEBHOOK NO ENCONTRADO en esa ruta."
      echo "  -> La URL no corresponde a ningún webhook activo ahí mismo --"
      echo "     revisa que sea la Production URL exacta (no la de prueba),"
      echo "     y que el workflow esté publicado/activo."
      ;;
    408)
      echo "Diagnóstico: n8n mismo reportó tiempo de espera agotado."
      ;;
    500|502|503|504)
      echo "Diagnóstico: ERROR INTERNO DEL WORKFLOW. La solicitud SÍ llegó y"
      echo "pasó la autenticación (si no, habría sido 401/403), pero algo"
      echo "falló DENTRO del workflow al procesarla."
      echo "  -> Esto SÍ debería dejar una ejecución en n8n -- ábrela ahí y"
      echo "     busca el nodo marcado en rojo."
      ;;
    *)
      echo "Diagnóstico: código no esperado ($RESP_CODE) -- revisa manualmente"
      echo "qué significa ese código para tu configuración de n8n."
      ;;
  esac
  if [ "$RESP_CODE" != "200" ] && [ "$RESP_CODE" != "201" ] && [ "$RESP_CODE" != "202" ] && [ "$RESP_CODE" != "204" ]; then
    echo
    echo "Cuerpo de la respuesta de n8n (mensaje de error propio de n8n, no"
    echo "contiene tu secreto ni datos de CLEO):"
    echo "$RESP_BODY" | head -c 2000
    echo
  fi
fi
echo "────────────────────────────────────────────"
