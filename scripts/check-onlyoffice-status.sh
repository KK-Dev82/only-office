#!/bin/bash
# Script สำหรับตรวจสอบสถานะ Only Office Plugins และ Dictionary
# Usage: ./check-onlyoffice-status.sh [container-name]

CONTAINER_NAME="${1:-onlyoffice-documentserver}"

echo "=========================================="
echo "Only Office Status Checker"
echo "Container: $CONTAINER_NAME"
echo "=========================================="
echo ""

# ตรวจสอบว่า container กำลังรันอยู่หรือไม่
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ ERROR: Container '$CONTAINER_NAME' ไม่ได้รันอยู่"
    exit 1
fi

echo "✅ Container กำลังรันอยู่"
echo ""

# ============================================
# 1. ตรวจสอบ Dictionary
# ============================================
echo "📚 Dictionary Status..."
echo "----------------------------------------"

DICT_DIR="/var/www/onlyoffice/documentserver/dictionaries/th_TH"
if docker exec "$CONTAINER_NAME" test -d "$DICT_DIR" 2>/dev/null; then
    echo "✅ Dictionary directory พบ"
    
    DICT_FILES=("th_TH.dic" "th_TH.aff" "th_TH.json")
    for file in "${DICT_FILES[@]}"; do
        if docker exec "$CONTAINER_NAME" test -f "$DICT_DIR/$file" 2>/dev/null; then
            SIZE=$(docker exec "$CONTAINER_NAME" stat -c%s "$DICT_DIR/$file" 2>/dev/null || echo "0")
            OWNER=$(docker exec "$CONTAINER_NAME" stat -c "%U:%G" "$DICT_DIR/$file" 2>/dev/null || echo "unknown")
            echo "   ✅ $file (size: $SIZE bytes, owner: $OWNER)"
        else
            echo "   ❌ $file - ไม่พบ"
        fi
    done
else
    echo "❌ Dictionary directory ไม่พบ"
fi

# ตรวจสอบ Dictionary Registry
echo ""
echo "🔍 Dictionary Registry..."
REGISTRY_PATHS=(
    "/var/www/onlyoffice/documentserver/server/dictionaries/dictionaries.json"
    "/var/www/onlyoffice/documentserver/dictionaries/dictionaries.json"
)

REGISTRY_FOUND=false
for registry_path in "${REGISTRY_PATHS[@]}"; do
    if docker exec "$CONTAINER_NAME" test -f "$registry_path" 2>/dev/null; then
        echo "   ✅ Registry file พบ: $registry_path"
        REGISTRY_FOUND=true
        
        # ตรวจสอบว่า th_TH ลงทะเบียนแล้วหรือไม่
        if docker exec "$CONTAINER_NAME" grep -q "th_TH\|1054" "$registry_path" 2>/dev/null; then
            echo "   ✅ Thai dictionary (th_TH, LCID 1054) ลงทะเบียนแล้ว"
            echo "   📄 Registry content:"
            docker exec "$CONTAINER_NAME" cat "$registry_path" 2>/dev/null | python3 -m json.tool 2>/dev/null || \
            docker exec "$CONTAINER_NAME" cat "$registry_path" 2>/dev/null
        else
            echo "   ⚠️  Thai dictionary ยังไม่ได้ลงทะเบียน"
        fi
        break
    fi
done

if [ "$REGISTRY_FOUND" = false ]; then
    echo "   ⚠️  Dictionary registry file ไม่พบ"
fi

echo ""

# ============================================
# 2. ตรวจสอบ Plugins
# ============================================
echo "📦 Plugins Status..."
echo "----------------------------------------"

PLUGINS_DIR="/var/www/onlyoffice/documentserver/sdkjs-plugins"

# ตรวจสอบ Custom Plugins (ชื่อ directory)
EXPECTED_PLUGINS=("document-office" "dictionary-abbreviation" "speech-to-text" "thai-spellcheck" "thai-autocomplete" "comment-bridge")

echo "🔍 Custom Plugins (by name):"
FOUND_COUNT=0
for plugin in "${EXPECTED_PLUGINS[@]}"; do
    if docker exec "$CONTAINER_NAME" test -d "$PLUGINS_DIR/$plugin" 2>/dev/null; then
        if docker exec "$CONTAINER_NAME" test -f "$PLUGINS_DIR/$plugin/config.json" 2>/dev/null; then
            # อ่าน plugin name และ version
            PLUGIN_NAME=$(docker exec "$CONTAINER_NAME" grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGINS_DIR/$plugin/config.json" 2>/dev/null | head -1 | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "$plugin")
            PLUGIN_VERSION=$(docker exec "$CONTAINER_NAME" grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGINS_DIR/$plugin/config.json" 2>/dev/null | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "unknown")
            echo "   ✅ $plugin (name: $PLUGIN_NAME, version: $PLUGIN_VERSION)"
            FOUND_COUNT=$((FOUND_COUNT + 1))
        else
            echo "   ⚠️  $plugin - directory พบแต่ไม่มี config.json"
        fi
    else
        echo "   ❌ $plugin - ไม่พบ"
    fi
done

echo ""
echo "   📊 Found $FOUND_COUNT/${#EXPECTED_PLUGINS[@]} custom plugins"
echo ""

# ตรวจสอบ GUID directories (อาจเป็น default plugins ที่เหลือ)
echo "🔍 GUID Directories (may be default plugins):"
GUID_COUNT=$(docker exec "$CONTAINER_NAME" find "$PLUGINS_DIR" -maxdepth 1 -type d -name "{*}" 2>/dev/null | wc -l || echo "0")
if [ "$GUID_COUNT" -gt 0 ]; then
    echo "   ⚠️  พบ $GUID_COUNT GUID directory(ies) - อาจเป็น default plugins ที่เหลืออยู่"
    echo "   💡 ถ้าต้องการลบ: docker exec $CONTAINER_NAME /usr/bin/documentserver-pluginsmanager.sh --directory=$PLUGINS_DIR --remove=\"<plugin-names>\""
else
    echo "   ✅ ไม่มี GUID directories (default plugins ถูกลบหมดแล้ว)"
fi

echo ""

# ============================================
# 3. ตรวจสอบ License
# ============================================
echo "🔑 License Status..."
echo "----------------------------------------"

LICENSE_FILE="/var/www/onlyoffice/Data/license.lic"
if docker exec "$CONTAINER_NAME" test -f "$LICENSE_FILE" 2>/dev/null; then
    echo "   ✅ License file พบ"
    # อ่าน license info (ถ้าเป็น text file)
    LICENSE_INFO=$(docker exec "$CONTAINER_NAME" head -5 "$LICENSE_FILE" 2>/dev/null || echo "")
    if [ -n "$LICENSE_INFO" ]; then
        echo "   📄 License info:"
        echo "$LICENSE_INFO" | sed 's/^/      /'
    fi
else
    echo "   ⚠️  License file ไม่พบ (ใช้ Developer Edition - ไม่จำเป็นต้องมี license)"
    echo "   💡 Developer Edition ไม่ต้องมี license file"
fi

echo ""

# ============================================
# 4. Summary
# ============================================
echo "=========================================="
echo "📋 Summary:"
echo "   - Dictionary: $(if [ "$REGISTRY_FOUND" = true ]; then echo "✅ Ready"; else echo "⚠️  Registry missing"; fi)"
echo "   - Custom Plugins: $FOUND_COUNT/${#EXPECTED_PLUGINS[@]}"
echo "   - GUID Directories: $GUID_COUNT"
echo ""
echo "💡 Tips:"
echo "   - ตรวจสอบ plugins ใน editor: เปิดเอกสารใน Only Office แล้วดูที่เมนู Plugins"
echo "   - ตรวจสอบ dictionary: เปลี่ยนภาษาเป็นไทย แล้วพิมพ์คำ ควรเห็น underline สีแดงสำหรับคำที่ผิด"
echo "   - ถ้าไม่เห็น plugins: ลอง refresh หน้าเว็บหรือ restart container"
echo "=========================================="
