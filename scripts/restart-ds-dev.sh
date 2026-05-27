#!/usr/bin/env bash
# Restart OnlyOffice DocumentServer (developer mode) แล้ว run inject scripts ภายใน container
#
# ใช้แทน "docker compose up -d --force-recreate" ตรงๆ เพราะ:
#   - YAML command: บล็อกบางอันใน developer.docker-compose.yml รันไม่สม่ำเสมอ
#   - script นี้ทำให้แน่ใจว่า inject-autoformat-disable.sh ได้รันเสมอ
#
# Usage:
#   ./restart-ds-dev.sh             # restart + inject (default mode: skip ถ้า user มีค่าใน localStorage แล้ว)
#   ./restart-ds-dev.sh --no-restart # ไม่ restart container, แค่รัน inject (สำหรับกรณี container ทำงานอยู่แล้ว)
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPOSE_DIR="$SCRIPT_DIR/../compose"
COMPOSE_FILE="$COMPOSE_DIR/developer.docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env.local"
CONTAINER_NAME="onlyoffice-documentserver"

DO_RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-restart) DO_RESTART=0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [ "$DO_RESTART" = "1" ]; then
  echo "==> Recreating container: $CONTAINER_NAME"
  if [ -f "$ENV_FILE" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate "$CONTAINER_NAME"
  else
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$CONTAINER_NAME"
  fi

  echo "==> Waiting for container to settle..."
  sleep 8
fi

echo "==> Running inject-autoformat-disable.sh inside container"
docker exec "$CONTAINER_NAME" bash /opt/kk-scripts/inject-autoformat-disable.sh

echo "==> Running inject-tab-as-tabchar.sh inside container"
docker exec "$CONTAINER_NAME" bash /opt/kk-scripts/inject-tab-as-tabchar.sh

echo ""
echo "==> Done."
echo "    หาก browser เคยเปิดเอกสารแล้ว ค่าใน localStorage จะค้างอยู่ (default-only mode)"
echo "    ถ้าต้องการ reset ให้ DevTools -> Application -> Local Storage -> ลบ:"
echo "      de-settings-autoformat-bulleted"
echo "      de-settings-autoformat-numbered"
echo "    แล้ว hard refresh (Cmd+Shift+R)"
