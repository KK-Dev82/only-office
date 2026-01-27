#!/bin/bash
# Script สำหรับ setup Only Office Plugins และ Dictionary บน Server
# Usage: ./setup-onlyoffice-server.sh [container-name] [only-office-path]
# Default: container-name=onlyoffice-documentserver
# 
# NOTE: Script นี้จะหา only-office root directory อัตโนมัติจากตำแหน่ง script
#       หรือระบุ only-office path เป็น parameter ที่ 2

set -euo pipefail

CONTAINER_NAME="${1:-onlyoffice-documentserver}"

# หา only-office root directory จากตำแหน่ง script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script อยู่ใน onlyoffice-plugins/scripts/ ดังนั้นขึ้นไป 2 level
DEFAULT_ONLYOFFICE_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"

ONLYOFFICE_PATH="${2:-$DEFAULT_ONLYOFFICE_PATH}"

echo "=========================================="
echo "Only Office Setup Script (Server)"
echo "Container: $CONTAINER_NAME"
echo "=========================================="
echo ""

# ตรวจสอบว่า container กำลังรันอยู่หรือไม่
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ ERROR: Container '$CONTAINER_NAME' ไม่ได้รันอยู่"
    echo "   เริ่ม container ก่อน: docker-compose restart $CONTAINER_NAME"
    exit 1
fi

echo "✅ Container กำลังรันอยู่"
echo ""

# ตรวจสอบว่า only-office path ถูกต้อง (มี dict และ plugins)
if [ ! -d "$ONLYOFFICE_PATH/dict/th_TH" ] || [ ! -d "$ONLYOFFICE_PATH/onlyoffice-plugins" ]; then
    echo "❌ ERROR: Only Office path ไม่ถูกต้อง: $ONLYOFFICE_PATH"
    echo "   ตรวจสอบว่า path นี้มี dict/th_TH และ onlyoffice-plugins"
    echo ""
    echo "   Usage:"
    echo "     # รันจาก scripts directory (แนะนำ):"
    echo "     cd /path/to/only-office/onlyoffice-plugins/scripts"
    echo "     ./setup-onlyoffice-server.sh $CONTAINER_NAME"
    echo ""
    echo "     # หรือระบุ only-office path:"
    echo "     ./setup-onlyoffice-server.sh $CONTAINER_NAME /path/to/only-office"
    exit 1
fi

echo "✅ Only Office path: $ONLYOFFICE_PATH"
echo ""

# ============================================
# 1. Setup Dictionary
# ============================================
echo "📚 Setting up Dictionary (Thai)..."
echo "----------------------------------------"

DICT_SRC="$ONLYOFFICE_PATH/dict/th_TH"
DICT_DST="/var/www/onlyoffice/documentserver/dictionaries/th_TH"

# ตรวจสอบว่า source มีอยู่
if [ ! -d "$DICT_SRC" ]; then
    echo "❌ ERROR: Dictionary source ไม่พบ: $DICT_SRC"
    exit 1
fi

echo "   Source: $DICT_SRC"
echo "   Destination: $DICT_DST"

# Copy dictionary files เข้า container
echo "   Copying dictionary files..."
docker exec "$CONTAINER_NAME" mkdir -p "$DICT_DST" 2>/dev/null || true

# Copy files
if [ -f "$DICT_SRC/th_TH.dic" ]; then
    docker cp "$DICT_SRC/th_TH.dic" "$CONTAINER_NAME:$DICT_DST/th_TH.dic"
    echo "   ✅ Copied th_TH.dic ($(du -h "$DICT_SRC/th_TH.dic" | cut -f1))"
else
    echo "   ❌ th_TH.dic not found in source"
fi

if [ -f "$DICT_SRC/th_TH.aff" ]; then
    docker cp "$DICT_SRC/th_TH.aff" "$CONTAINER_NAME:$DICT_DST/th_TH.aff"
    echo "   ✅ Copied th_TH.aff"
else
    echo "   ❌ th_TH.aff not found in source"
fi

if [ -f "$DICT_SRC/th_TH.json" ]; then
    docker cp "$DICT_SRC/th_TH.json" "$CONTAINER_NAME:$DICT_DST/th_TH.json"
    echo "   ✅ Copied th_TH.json"
else
    # สร้าง th_TH.json
    echo '{ "codes": [1054] }' | docker exec -i "$CONTAINER_NAME" sh -c "cat > $DICT_DST/th_TH.json"
    echo "   ✅ Created th_TH.json"
fi

# ตั้ง permission
echo "   Setting permissions..."
docker exec "$CONTAINER_NAME" chown -R ds:ds "$DICT_DST" 2>/dev/null || \
docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$DICT_DST" 2>/dev/null || \
docker exec "$CONTAINER_NAME" chown -R root:root "$DICT_DST" 2>/dev/null || true

docker exec "$CONTAINER_NAME" chmod -R a+r "$DICT_DST"/* 2>/dev/null || true

echo "   ✅ Dictionary setup completed"
echo ""

# Update dictionary registry
echo "   Updating dictionary registry..."
if docker exec "$CONTAINER_NAME" test -x "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" 2>/dev/null; then
    docker exec "$CONTAINER_NAME" python3 "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" 2>&1 | grep -v "^$" || true
    echo "   ✅ Dictionary registry updated"
elif docker exec "$CONTAINER_NAME" test -x "/usr/bin/documentserver-dictionaries-update.sh" 2>/dev/null; then
    docker exec "$CONTAINER_NAME" /usr/bin/documentserver-dictionaries-update.sh 2>&1 | grep -v "^$" || true
    echo "   ✅ Dictionary registry updated"
else
    # สร้าง registry file manually
    REGISTRY_DIR="/var/www/onlyoffice/documentserver/server/dictionaries"
    REGISTRY_FILE="$REGISTRY_DIR/dictionaries.json"
    docker exec "$CONTAINER_NAME" mkdir -p "$REGISTRY_DIR" 2>/dev/null || true
    echo '[{"name":"Thai (Thailand)","code":"th_TH","codes":[1054],"file":"th_TH.dic"}]' | \
        docker exec -i "$CONTAINER_NAME" sh -c "cat > $REGISTRY_FILE"
    docker exec "$CONTAINER_NAME" chown ds:ds "$REGISTRY_FILE" 2>/dev/null || \
        docker exec -u root "$CONTAINER_NAME" chown ds:ds "$REGISTRY_FILE" 2>/dev/null || true
    echo "   ✅ Dictionary registry file created manually"
fi

echo ""

# ============================================
# 2. Setup Plugins
# ============================================
echo "📦 Setting up Plugins..."
echo "----------------------------------------"

PLUGINS_SRC="$ONLYOFFICE_PATH/onlyoffice-plugins"
PLUGINS_DST="/var/www/onlyoffice/documentserver/sdkjs-plugins"

# ตรวจสอบว่า source มีอยู่
if [ ! -d "$PLUGINS_SRC" ]; then
    echo "❌ ERROR: Plugins source ไม่พบ: $PLUGINS_SRC"
    exit 1
fi

echo "   Source: $PLUGINS_SRC"
echo "   Destination: $PLUGINS_DST"

# นับจำนวน plugins
PLUGIN_COUNT=$(find "$PLUGINS_SRC" -maxdepth 1 -type d ! -name "onlyoffice-plugins" | wc -l)
echo "   Found $PLUGIN_COUNT plugin(s)"

# ลบ default plugins (ถ้ามี plugin manager)
echo "   Removing default plugins..."
if docker exec "$CONTAINER_NAME" test -x "/usr/bin/documentserver-pluginsmanager.sh" 2>/dev/null; then
    docker exec "$CONTAINER_NAME" /usr/bin/documentserver-pluginsmanager.sh \
        --directory="$PLUGINS_DST" \
        --remove="highlight code, speech input, youtube, mendeley, zotero, photo editor, ocr, translator, ai, speech, thesaurus" \
        2>&1 | grep -E "(Remove plugin|OK|Error)" || true
    echo "   ✅ Default plugins removal attempted"
else
    echo "   ⚠️  Plugin manager not found, skipping default plugin removal"
fi

# Copy custom plugins
echo "   Copying custom plugins..."
COPIED_COUNT=0
for plugin_dir in "$PLUGINS_SRC"/*; do
    if [ -d "$plugin_dir" ]; then
        plugin_name=$(basename "$plugin_dir")
        echo "     Copying $plugin_name..."
        
        # สร้าง temp tar file
        TEMP_TAR=$(mktemp)
        tar -czf "$TEMP_TAR" -C "$PLUGINS_SRC" "$plugin_name" 2>/dev/null
        
        # Extract ใน container
        if docker exec -i "$CONTAINER_NAME" sh -c "cd $PLUGINS_DST && tar -xzf -" < "$TEMP_TAR" 2>/dev/null; then
            # ตั้ง permission
            docker exec "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || \
            docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            
            docker exec "$CONTAINER_NAME" chmod -R a+rX "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            
            echo "     ✅ $plugin_name copied"
            COPIED_COUNT=$((COPIED_COUNT + 1))
        else
            echo "     ❌ Failed to copy $plugin_name"
        fi
        
        # ลบ temp file
        rm -f "$TEMP_TAR"
    fi
done

echo "   ✅ Copied $COPIED_COUNT plugin(s)"
echo ""

# ============================================
# 3. Setup Fonts (TH Sarabun)
# ============================================
echo "🔤 Setting up Fonts (TH Sarabun)..."
echo "----------------------------------------"

FONTS_SRC="$ONLYOFFICE_PATH/THSarabunITBold"
FONTS_DST="/usr/share/fonts/truetype/th-sarabun"

# ตรวจสอบว่า source มีอยู่
if [ ! -d "$FONTS_SRC" ]; then
    echo "   ⚠️  Fonts source ไม่พบ: $FONTS_SRC"
    echo "   💡 Fonts อาจจะ mount ผ่าน volume ใน docker-compose แล้ว"
else
    echo "   Source: $FONTS_SRC"
    echo "   Destination: $FONTS_DST"
    
    # ตรวจสอบว่า fonts ถูก mount แล้วหรือไม่
    FONT_FILES=("THSarabunIT.ttf" "THSarabunITBold.ttf" "THSarabunITBoldItalic.ttf" "THSarabunITItalic.ttf")
    FONTS_MOUNTED=true
    
    for font in "${FONT_FILES[@]}"; do
        if docker exec "$CONTAINER_NAME" test -f "$FONTS_DST/$font" 2>/dev/null; then
            echo "   ✅ $font (mounted)"
        else
            echo "   ⚠️  $font not found in container"
            FONTS_MOUNTED=false
        fi
    done
    
    if [ "$FONTS_MOUNTED" = false ]; then
        echo ""
        echo "   💡 Fonts ไม่ได้ mount ผ่าน volume"
        echo "   💡 Copy fonts เข้า container..."
        
        # Copy fonts เข้า container
        docker exec "$CONTAINER_NAME" mkdir -p "$FONTS_DST" 2>/dev/null || true
        
        for font in "${FONT_FILES[@]}"; do
            if [ -f "$FONTS_SRC/$font" ]; then
                docker cp "$FONTS_SRC/$font" "$CONTAINER_NAME:$FONTS_DST/$font"
                echo "     ✅ Copied $font"
            else
                echo "     ❌ $font not found in source"
            fi
        done
        
        # ตั้ง permission
        docker exec "$CONTAINER_NAME" chown -R root:root "$FONTS_DST" 2>/dev/null || true
        docker exec "$CONTAINER_NAME" chmod -R a+r "$FONTS_DST"/* 2>/dev/null || true
        
        # Rebuild font cache
        echo "   Rebuilding font cache..."
        docker exec "$CONTAINER_NAME" fc-cache -fv 2>&1 | grep -E "(THSarabun|Cache)" || true
        docker exec "$CONTAINER_NAME" /usr/bin/documentserver-generate-allfonts.sh 2>&1 | tail -5 || true
        echo "   ✅ Font cache rebuilt"
    else
        echo "   ✅ All fonts are mounted correctly"
        echo "   💡 If fonts don't appear, try rebuilding font cache:"
        echo "      docker exec $CONTAINER_NAME fc-cache -fv"
        echo "      docker exec $CONTAINER_NAME /usr/bin/documentserver-generate-allfonts.sh"
    fi
fi

echo ""

# ============================================
# 4. Summary
# ============================================
echo "=========================================="
echo "✅ Setup completed!"
echo ""
echo "📋 Summary:"
echo "   - Dictionary: $DICT_DST"
echo "   - Plugins: $PLUGINS_DST ($COPIED_COUNT plugins)"
echo ""
echo "💡 Next steps:"
echo "   1. Restart container เพื่อให้ plugins โหลด:"
echo "      docker-compose restart $CONTAINER_NAME"
echo ""
echo "   2. ตรวจสอบผลลัพธ์:"
echo "      docker exec $CONTAINER_NAME ls -la $DICT_DST"
echo "      docker exec $CONTAINER_NAME ls -la $PLUGINS_DST"
echo ""
echo "   3. ตรวจสอบใน editor: เปิดเอกสารใน Only Office แล้วดูที่เมนู Plugins"
echo "=========================================="
