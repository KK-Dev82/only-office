#!/bin/bash
# Wrapper script สำหรับ setup-onlyoffice-server.sh
# Script นี้อยู่ที่ scripts/ directory
# มันจะเรียก script จริงจาก scripts/ directory เดียวกัน

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SCRIPT="$SCRIPT_DIR/setup-onlyoffice-server.sh"

if [ ! -f "$REAL_SCRIPT" ]; then
    echo "❌ ERROR: Script ไม่พบ: $REAL_SCRIPT"
    echo "   ตรวจสอบว่า setup-onlyoffice-server.sh มีอยู่ใน scripts/ directory"
    exit 1
fi

# เรียก script จริง
exec "$REAL_SCRIPT" "$@"
