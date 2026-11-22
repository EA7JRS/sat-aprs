#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS+ · Monta la consola en este equipo y retira los restos de una
# instalación antigua. Se puede repetir sin miedo: solo hace lo que falta.
#
#   sudo sh tools/instalar.sh                          instalación nueva
#   sudo sh tools/instalar.sh --desde /opt/sat-aprs.antiguo
#                                                      además trae la configuración de la carpeta antigua
#
# Qué hace:
#   1. para la consola y retira los servicios antiguos (sat-aprs-web, sat-aprs-agent…);
#   2. con --desde, copia de la carpeta antigua .env, sat_config.json, los avisos
#      emitidos, el perfil, la última posición y el historial (y config.ini solo
#      si no hay sat_config.json, para que la consola lo importe una vez);
#   3. instala Node.js 22 si falta o es anterior a la 22.13;
#   4. crea el usuario de servicio, sus permisos de sudo, el token de administrador
#      si falta y la unidad de systemd;
#   5. instala dependencias, compila, arranca y comprueba (tools/actualizar.sh --aqui).
# No borra la carpeta antigua: al final dice cómo hacerlo cuando todo funcione.
# No toca Direwolf, aprx, gpsd ni sus archivos de /etc.
set -eu

USUARIO="${SAT_USUARIO:-satapr}"
SERVICIO="${SAT_SERVICIO:-sat-aprs.service}"
UNIDADES="${SAT_UNIDADES:-/etc/systemd/system}"
DESDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --desde) shift; DESDE="${1:?falta la carpeta antigua}" ;;
    -h|--help|--ayuda) sed -n '5,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $1 (pruebe --ayuda)" >&2; exit 2 ;;
  esac
  shift
done

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
[ "$(id -u)" = 0 ] || { echo "Ejecútelo con sudo: sudo sh tools/instalar.sh" >&2; exit 1; }
[ -f package.json ] && [ -f server.ts ] || { echo "$DIR no parece la consola S.A.T.-APRS+" >&2; exit 1; }
paso() { printf '\n== %s\n' "$*"; }

if [ -n "$DESDE" ]; then
  DESDE="$(cd "$DESDE" 2>/dev/null && pwd)" || { echo "No existe la carpeta antigua" >&2; exit 1; }
  [ "$DESDE" != "$DIR" ] || { echo "--desde tiene que ser otra carpeta, no esta" >&2; exit 1; }
fi

paso "1. Restos de la versión antigua"
if systemctl cat "$SERVICIO" >/dev/null 2>&1; then systemctl stop "$SERVICIO" || true; echo "Consola parada."; fi
# Nombres que ha tenido la consola y su agente en instalaciones anteriores
for viejo in sat-aprs-web.service sat-aprs-agent.service sat-aprs-py.service aprs-sat.service aprs_sat.service; do
  if [ -f "$UNIDADES/$viejo" ] || systemctl cat "$viejo" >/dev/null 2>&1; then
    systemctl disable --now "$viejo" >/dev/null 2>&1 || true
    rm -f "$UNIDADES/$viejo"
    echo "Retirado el servicio antiguo $viejo."
  fi
done
# Archivos del agente Python que hayan quedado sueltos en esta carpeta (ya no están en el repositorio)
for f in aprs_sat.py aprs_proto.py weather_services.py config.ini.example __pycache__; do
  if [ -e "$f" ] && ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then rm -rf "$f"; echo "Borrado $f."; fi
done

if [ -n "$DESDE" ]; then
  paso "2. Configuración de $DESDE"
  for f in .env sat_config.json sat_avisos.json sat_perfil.json last_gps.json sat_historial.db sat_historial.db-wal sat_historial.db-shm; do
    if [ -f "$DESDE/$f" ]; then
      if [ -f "$f" ]; then echo "  $f ya existe aquí: se deja el de aquí."; else cp -p "$DESDE/$f" "$f"; echo "  $f copiado."; fi
    fi
  done
  if [ ! -f sat_config.json ] && [ -f "$DESDE/config.ini" ] && [ ! -f config.ini ]; then
    cp -p "$DESDE/config.ini" config.ini
    echo "  config.ini copiado: la consola lo importará una vez al arrancar."
  fi
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Creado .env desde .env.example (emisión apagada). Edítelo: nano $DIR/.env"
fi
# Sin token de administrador la consola no guarda cambios: se crea uno si falta
TOKEN_NUEVO=""
if ! grep -Eq '^SAT_ADMIN_TOKEN="?[^"[:space:]]{16,}' .env; then
  TOKEN_NUEVO="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  sed -i '/^SAT_ADMIN_TOKEN=/d' .env
  printf 'SAT_ADMIN_TOKEN="%s"\n' "$TOKEN_NUEVO" >> .env
  echo "Creado el token de administrador en .env (se muestra al final)."
fi
chmod 600 .env

paso "3. Node.js"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  echo "Instalando Node.js 22 de NodeSource (había: $(node -v 2>/dev/null || echo ninguno))…"
  command -v curl >/dev/null 2>&1 || apt-get install -y curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"
command -v sqlite3 >/dev/null 2>&1 || apt-get install -y sqlite3 || true

paso "4. Usuario y servicio"
if ! id "$USUARIO" >/dev/null 2>&1; then
  useradd --system --home "$DIR" --shell /usr/sbin/nologin "$USUARIO"
  echo "Creado el usuario de servicio $USUARIO."
fi
# Puerto serie, audio y GPS, si los grupos existen
for g in dialout audio plugdev; do if getent group "$g" >/dev/null 2>&1; then usermod -aG "$g" "$USUARIO" 2>/dev/null || true; fi; done
chown -R "$USUARIO": "$DIR"
UNIDAD="$UNIDADES/$SERVICIO"
NUEVA="$(mktemp)"
cat > "$NUEVA" <<UNIT
[Unit]
Description=S.A.T.-APRS+ Consola Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USUARIO
WorkingDirectory=$DIR
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
SyslogIdentifier=sat-aprs

[Install]
WantedBy=multi-user.target
UNIT
if [ -f "$UNIDAD" ] && cmp -s "$NUEVA" "$UNIDAD"; then echo "La unidad $SERVICIO ya está al día."; rm -f "$NUEVA"
else
  if [ -f "$UNIDAD" ]; then cp -p "$UNIDAD" "$UNIDAD.antigua"; echo "La unidad anterior queda en $UNIDAD.antigua."; fi
  install -m 0644 "$NUEVA" "$UNIDAD"; rm -f "$NUEVA"
  echo "Escrita $UNIDAD (usuario $USUARIO, carpeta $DIR)."
fi
# Permisos justos para leer y escribir la configuración de radio y reiniciar sus servicios
if [ -d /etc/sudoers.d ] && command -v visudo >/dev/null 2>&1 && [ "$USUARIO" != root ]; then
  SUDOERS="$(mktemp)"
  sed "s/^USUARIO /$USUARIO /" "$DIR/tools/sudoers-sat-aprs" > "$SUDOERS"
  if visudo -cf "$SUDOERS" >/dev/null 2>&1; then install -m 0440 -o root -g root "$SUDOERS" "${SAT_SUDOERS:-/etc/sudoers.d/sat-aprs}"; echo "Permisos de $USUARIO en /etc/sudoers.d/sat-aprs."
  else echo "Atención: no se instalaron los permisos de sudo (el archivo no pasó la comprobación)." >&2; fi
  rm -f "$SUDOERS"
fi
systemctl daemon-reload
systemctl enable "$SERVICIO" >/dev/null 2>&1 || true

paso "5. Compilar y arrancar"
sh "$DIR/tools/actualizar.sh" --aqui

paso "Siguientes pasos"
echo "· Actualizar más adelante:      sudo sh $DIR/tools/actualizar.sh"
echo "· aprx del fork (si no está):   sudo sh $DIR/tools/instalar-aprx.sh"
echo "· NAVTEX con SDR (opcional):    sudo sh $DIR/tools/instalar-navtex.sh"
if [ -n "$TOKEN_NUEVO" ]; then
  echo "· Token de administrador (guárdelo; se pide en Sistema → Acceso de administrador):"
  echo "    $TOKEN_NUEVO"
fi
if [ -n "$DESDE" ]; then echo "· Cuando todo funcione, borre la carpeta antigua:  sudo rm -rf $DESDE"; fi
