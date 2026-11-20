#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS · Actualiza la consola con una orden (pensada para SSH).
#
#   sudo sh tools/actualizar.sh               actualiza a lo último de la rama
#   sudo sh tools/actualizar.sh --comprobar   dice si hay versión nueva y no toca nada
#   sudo sh tools/actualizar.sh --forzar      recompila y reinicia aunque no haya cambios
#   sudo sh tools/actualizar.sh --aqui        recompila y reinicia lo que hay en disco, sin traer nada
#   sudo sh tools/actualizar.sh --rama otra   usa otra rama (de serie, main)
#
# Qué hace, en este orden:
#   1. copia de seguridad de la configuración y del historial en copias/<fecha>/;
#   2. trae la versión nueva (git, solo avance rápido) y enseña qué cambia;
#   3. instala dependencias y compila, con la consola todavía en marcha;
#   4. reinicia el servicio y comprueba que arranca y responde.
# Si la compilación falla, vuelve a la versión anterior y la consola no se
# detiene. Si lo que falla es el arranque, lo dice y enseña el registro.
# No toca .env ni los archivos sat_*.json: no están en git.
set -eu

SERVICIO="${SAT_SERVICIO:-sat-aprs.service}"
RAMA=main
COMPROBAR=0
FORZAR=0
AQUI=0
while [ $# -gt 0 ]; do
  case "$1" in
    --comprobar) COMPROBAR=1 ;;
    --forzar) FORZAR=1 ;;
    --aqui) AQUI=1; FORZAR=1 ;;
    --rama) shift; RAMA="${1:?falta el nombre de la rama}" ;;
    -h|--help|--ayuda) sed -n '5,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $1 (pruebe --ayuda)" >&2; exit 2 ;;
  esac
  shift
done

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
[ -d .git ] || { echo "$DIR no es un clon de git" >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Ejecútelo con sudo: sudo sh tools/actualizar.sh" >&2; exit 1; }

# git y npm se ejecutan como el dueño de la instalación, para no dejar archivos de root
DUENO="$(stat -c %U "$DIR")"
como() { if [ "$DUENO" = root ]; then "$@"; else runuser -u "$DUENO" -- "$@"; fi; }
# El usuario de servicio no tiene carpeta personal donde git y npm puedan escribir
export HOME="${SAT_HOME:-$DIR}"
export npm_config_cache="${npm_config_cache:-$DIR/.npm}"
version() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1; }
paso() { printf '\n== %s\n' "$*"; }

# Node 22.13 o posterior (el historial usa node:sqlite)
NODE="$(node -p 'process.versions.node' 2>/dev/null || echo 0.0.0)"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  echo "Node.js $NODE: hace falta la 22.13 o posterior." >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs" >&2
  exit 1
fi

ANTES="$(como git rev-parse HEAD)"
V_ANTES="$(version)"
paso "Consola v$V_ANTES ($(echo "$ANTES" | cut -c1-7)), rama $RAMA"
if [ "$AQUI" = 1 ]; then NUEVO="$ANTES"; else
  como git fetch --quiet origin "$RAMA"
  NUEVO="$(como git rev-parse "origin/$RAMA")"
fi

if [ "$ANTES" = "$NUEVO" ] && [ "$FORZAR" = 0 ]; then
  echo "Ya está en la última versión."
  exit 0
fi
if [ "$ANTES" != "$NUEVO" ]; then
  V_NUEVA="$(como git show "origin/$RAMA:package.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
  echo "Hay versión nueva: v$V_NUEVA ($(echo "$NUEVO" | cut -c1-7))"
  como git log --oneline --no-decorate "$ANTES..$NUEVO" | head -30
fi
[ "$COMPROBAR" = 1 ] && exit 0

if [ "$ANTES" != "$NUEVO" ] && [ -n "$(como git status --porcelain --untracked-files=no)" ]; then
  echo "Hay archivos del repositorio modificados a mano; no se actualiza para no pisarlos:" >&2
  como git status --short --untracked-files=no >&2
  echo "Deshaga los cambios (git checkout -- <archivo>) o guárdelos, y repita." >&2
  exit 1
fi

paso "Copia de seguridad"
COPIA="copias/$(date +%Y-%m-%d_%H%M%S)"
como mkdir -p "$COPIA"
for f in .env sat_config.json sat_avisos.json sat_perfil.json last_gps.json; do
  if [ -f "$f" ]; then como cp -p "$f" "$COPIA/"; fi
done
if [ -f sat_historial.db ]; then
  # Copia coherente con la consola en marcha si hay sqlite3; si no, los tres archivos
  if command -v sqlite3 >/dev/null 2>&1 && como sqlite3 sat_historial.db ".backup '$COPIA/sat_historial.db'" 2>/dev/null; then :
  else for f in sat_historial.db sat_historial.db-wal sat_historial.db-shm; do if [ -f "$f" ]; then como cp -p "$f" "$COPIA/"; fi; done; fi
fi
echo "$COPIA: $(ls -A "$COPIA" | tr '\n' ' ')"
# Se guardan las diez últimas copias
ls -1d copias/*/ 2>/dev/null | sort | head -n -10 | while read -r vieja; do rm -rf "$vieja"; done

volver() {
  echo "" >&2
  echo "FALLO: $1. Se vuelve a la v$V_ANTES; la consola sigue como estaba." >&2
  como git reset --quiet --hard "$ANTES"
  como npm ci --no-audit --no-fund >/dev/null 2>&1 && como npm run build >/dev/null 2>&1 || echo "Atención: tampoco se pudo recompilar la versión anterior." >&2
  exit 1
}

if [ "$ANTES" != "$NUEVO" ]; then
  paso "Trayendo la versión nueva"
  como git merge --quiet --ff-only "origin/$RAMA" || {
    echo "No se puede avanzar sin más (el historial local ha divergido)." >&2
    echo "Con la copia hecha: git fetch origin && git reset --hard origin/$RAMA" >&2
    exit 1
  }
fi

paso "Dependencias"
como npm ci --no-audit --no-fund || volver "no se pudieron instalar las dependencias"
paso "Compilando"
como npm run build || volver "la compilación ha fallado"

if ! systemctl cat "$SERVICIO" >/dev/null 2>&1; then
  paso "Compilada la v$(version). No existe el servicio $SERVICIO: arránquela a mano (npm run start)."
  exit 0
fi

paso "Reiniciando $SERVICIO"
systemctl restart "$SERVICIO"
PUERTO="$(sed -n 's/^PORT=\([0-9][0-9]*\).*/\1/p' .env 2>/dev/null | head -1)"
PUERTO="${PUERTO:-3000}"
i=0
while [ $i -lt 30 ]; do
  sleep 1
  i=$((i + 1))
  systemctl is-active --quiet "$SERVICIO" || continue
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PUERTO/"; then break; fi
  elif [ $i -ge 5 ]; then break
  fi
done
# Que conteste alguien no basta: tiene que ser este servicio y no otro proceso que ocupe el puerto
if [ $i -lt 30 ] && command -v ss >/dev/null 2>&1; then
  ESCUCHA="$(ss -ltnpH "sport = :$PUERTO" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  GRUPO="$(systemctl show -p ControlGroup --value "$SERVICIO" 2>/dev/null || true)"
  if [ -n "$ESCUCHA" ] && [ -n "$GRUPO" ] && [ -r "/sys/fs/cgroup$GRUPO/cgroup.procs" ] && ! grep -qx "$ESCUCHA" "/sys/fs/cgroup$GRUPO/cgroup.procs"; then
    echo "FALLO: el puerto $PUERTO lo ocupa otro proceso, no $SERVICIO:" >&2
    ps -o pid,user,lstart,cmd -p "$ESCUCHA" >&2 || true
    systemctl status "$ESCUCHA" --no-pager 2>/dev/null | head -3 >&2 || true
    echo "Pare ese proceso (si es un servicio: sudo systemctl disable --now <nombre>) y repita con --aqui." >&2
    exit 1
  fi
fi
if [ $i -ge 30 ]; then
  echo "FALLO: la consola no responde en el puerto $PUERTO tras 30 s. Últimas líneas del registro:" >&2
  journalctl -u "$SERVICIO" -n 30 --no-pager >&2 || true
  echo "Para volver a la v$V_ANTES: sudo -u $DUENO git -C $DIR reset --hard $ANTES && sudo sh tools/actualizar.sh --aqui" >&2
  exit 1
fi

paso "Hecho: consola v$(version) en marcha (puerto $PUERTO)"
echo "Registro en vivo:  journalctl -u $SERVICIO -f"
