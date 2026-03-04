#!/bin/bash
# Wrapper script สำหรับ setup-onlyoffice-server.sh
# รองรับทั้ง local (developer.docker-compose) และ server
# Usage: ./setup-onlyoffice.sh [container-name] [only-office-path]
# ถ้าไม่ระบุ container: auto-detect (onlyoffice-documentserver หรือ onlyoffice-docs-developer)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SCRIPT="$SCRIPT_DIR/setup-onlyoffice-server.sh"

if [ ! -f "$REAL_SCRIPT" ]; then
    echo "❌ ERROR: Script ไม่พบ: $REAL_SCRIPT"
    echo "   ตรวจสอบว่า setup-onlyoffice-server.sh มีอยู่ใน scripts/ directory"
    exit 1
fi

exec "$REAL_SCRIPT" "$@"
