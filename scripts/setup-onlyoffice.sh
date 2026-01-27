#!/bin/bash
# Wrapper script สำหรับ setup-onlyoffice-server.sh
# Script นี้อยู่ที่ root ของ only-office เพื่อให้ใช้งานง่าย
# มันจะเรียก script จริงจาก onlyoffice-plugins/scripts/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SCRIPT="$SCRIPT_DIR/onlyoffice-plugins/scripts/setup-onlyoffice-server.sh"

if [ ! -f "$REAL_SCRIPT" ]; then
    echo "❌ ERROR: Script ไม่พบ: $REAL_SCRIPT"
    echo "   ตรวจสอบว่า onlyoffice-plugins/scripts/setup-onlyoffice-server.sh มีอยู่"
    exit 1
fi

# เรียก script จริง
exec "$REAL_SCRIPT" "$@"
