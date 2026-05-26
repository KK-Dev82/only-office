#!/bin/bash
# Script สำหรับ restart DocumentServer แบบล้าง Redis cache ให้สะอาด
#
# ปัญหาที่แก้:
# - OnlyOffice DocumentServer ใช้ Redis (ใน container เดียวกัน) เก็บ session state ของ document key
# - Redis เปิด persistence (AOF/RDB) เป็น default → ข้อมูล cache อยู่ใน volume `onlyoffice_data`
# - แค่ `docker restart` container → Redis โหลด state เก่ากลับมา → user เปิดเอกสารเดิมเจอ
#   "Version changed" เพราะ cache content ไม่ตรงกับไฟล์ปัจจุบันใน FileService
#
# Solution:
# - สั่ง `redis-cli FLUSHALL` ก่อน restart → cache เคลียร์ → DS โหลดสดจาก documentUrl ทุกครั้ง
#
# Usage:
#   ./restart-onlyoffice.sh [container-name]
#
# Default: onlyoffice-documentserver (canonical — ตรงกับ FileService production)

set -euo pipefail

resolve_container() {
  local name="$1"
  if [ -n "$name" ]; then echo "$name"; return; fi
  echo "onlyoffice-documentserver"
}

CONTAINER_NAME="$(resolve_container "${1:-}")"

echo "=========================================="
echo "OnlyOffice DocumentServer Restart (Clean)"
echo "Container: $CONTAINER_NAME"
echo "=========================================="
echo ""

# 1. ตรวจ container ว่ารันอยู่ไหม
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "⚠️  Container '$CONTAINER_NAME' ไม่ได้รันอยู่ — จะ start ใหม่อย่างเดียว"
    docker start "$CONTAINER_NAME" 2>/dev/null || {
        echo "❌ ไม่สามารถ start container ได้ — ตรวจชื่อ container อีกครั้ง"
        exit 1
    }
    echo "✅ Container started"
    exit 0
fi

# 2. ล้าง Redis cache (สำคัญที่สุด — แก้ "Version changed" หลัง restart)
echo "🧹 Clearing Redis cache..."
if docker exec "$CONTAINER_NAME" redis-cli FLUSHALL > /dev/null 2>&1; then
    echo "✅ Redis cache cleared (FLUSHALL)"
else
    echo "⚠️  ไม่สามารถเข้าถึง redis-cli ได้ — Redis อาจไม่ได้รันใน container นี้"
    echo "    (image custom หรือ OnlyOffice version ต่างจากที่คาดหวัง)"
    echo "    Continue กับ restart ปกติ..."
fi
echo ""

# 3. Graceful prepare4shutdown (ถ้ามี — ป้องกัน session ค้าง)
echo "🛑 Preparing graceful shutdown..."
if docker exec "$CONTAINER_NAME" test -x /usr/bin/documentserver-prepare4shutdown.sh 2>/dev/null; then
    docker exec "$CONTAINER_NAME" /usr/bin/documentserver-prepare4shutdown.sh > /dev/null 2>&1 || true
    echo "✅ documentserver-prepare4shutdown.sh executed"
else
    echo "ℹ️  documentserver-prepare4shutdown.sh not found — skipping"
fi
echo ""

# 4. Restart container
echo "🔄 Restarting container..."
docker restart "$CONTAINER_NAME" > /dev/null
echo "✅ Container restarted"
echo ""

# 5. รอ DS พร้อมรับ request
echo "⏳ Waiting for DocumentServer to be ready..."
HOST_PORT="${OO_HTTP_PORT:-8082}"
MAX_TRIES=30
TRIES=0
while [ $TRIES -lt $MAX_TRIES ]; do
    if curl -fsS "http://localhost:${HOST_PORT}/healthcheck" > /dev/null 2>&1; then
        echo "✅ DocumentServer healthy (port $HOST_PORT)"
        break
    fi
    TRIES=$((TRIES + 1))
    sleep 2
    echo -n "."
done

if [ $TRIES -ge $MAX_TRIES ]; then
    echo ""
    echo "⚠️  Healthcheck timeout — DS อาจยังไม่พร้อม แต่ container start แล้ว"
    echo "   ตรวจ log: docker logs $CONTAINER_NAME --tail 50"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Done — DS restarted with clean Redis cache"
echo "=========================================="
echo ""
echo "ขั้นถัดไป:"
echo "  - ทดสอบเปิดเอกสารใน browser → ไม่ควรเจอ 'Version changed'"
echo "  - ถ้ายังเจอ: เช็ค log → docker logs $CONTAINER_NAME --tail 100"
