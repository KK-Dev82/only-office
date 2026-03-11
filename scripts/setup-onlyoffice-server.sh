#!/bin/bash
# Script สำหรับ setup Only Office Plugins และ Dictionary
# รองรับทั้ง local (developer.docker-compose) และ server (staging/production)
# Usage: ./setup-onlyoffice-server.sh [container-name] [only-office-path]
# Default: container-name=onlyoffice-documentserver (auto-detect ถ้าไม่ระบุ)
#
# NOTE: Script นี้จะหา only-office root directory อัตโนมัติจากตำแหน่ง script
#       หรือระบุ only-office path เป็น parameter ที่ 2

set -euo pipefail

# Auto-detect container: ถ้าไม่ระบุ ให้ลอง onlyoffice-documentserver ก่อน แล้ว onlyoffice-docs-developer (legacy)
resolve_container() {
  local name="$1"
  if [ -n "$name" ]; then
    echo "$name"
    return
  fi
  if docker ps --format "{{.Names}}" | grep -q "^onlyoffice-documentserver$"; then
    echo "onlyoffice-documentserver"
    return
  fi
  if docker ps --format "{{.Names}}" | grep -q "^onlyoffice-docs-developer$"; then
    echo "onlyoffice-docs-developer"
    return
  fi
  echo "onlyoffice-documentserver"  # default สำหรับ error message
}

CONTAINER_NAME="$(resolve_container "${1:-}")"

# หา only-office root directory จากตำแหน่ง script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script อยู่ใน only-office/scripts/ ดังนั้นขึ้นไป 1 level
DEFAULT_ONLYOFFICE_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

ONLYOFFICE_PATH="${2:-$DEFAULT_ONLYOFFICE_PATH}"

echo "=========================================="
echo "Only Office Setup Script (Server)"
echo "Container: $CONTAINER_NAME"
echo "=========================================="
echo ""

# ตรวจสอบว่า container กำลังรันอยู่หรือไม่
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ ERROR: Container '$CONTAINER_NAME' ไม่ได้รันอยู่"
    echo ""
    echo "   Local:  docker compose -f compose/developer.docker-compose.yml up -d"
    echo "   Server: docker compose restart onlyoffice-documentserver"
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
    echo "     cd /path/to/only-office/scripts"
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

# ตรวจสอบว่า dictionary path เป็น bind mount read-only หรือไม่ (docker-compose mount :ro)
# ถ้าเป็น bind mount ไฟล์จาก host จะมีอยู่แล้ว ไม่ต้อง docker cp (จะ error: mounted volume is marked read-only)
DICT_IS_READONLY=false
if docker exec "$CONTAINER_NAME" sh -c "touch $DICT_DST/.write_test 2>/dev/null && rm -f $DICT_DST/.write_test" 2>/dev/null; then
    DICT_IS_READONLY=false
else
    DICT_IS_READONLY=true
fi

if [ "$DICT_IS_READONLY" = true ]; then
    echo "   ℹ️  Dictionary path เป็น bind mount (read-only) - ไฟล์จาก host มีอยู่แล้ว"
    echo "   ตรวจสอบว่าไฟล์มีอยู่บน host: $DICT_SRC"
    for f in th_TH.dic th_TH.aff th_TH.json; do
        if [ -f "$DICT_SRC/$f" ]; then
            echo "   ✅ $f (จาก host bind mount)"
        else
            echo "   ⚠️  $f ไม่พบใน source"
        fi
    done
else
    # Copy dictionary files เข้า container (path เขียนได้)
    echo "   Copying dictionary files..."
    docker exec "$CONTAINER_NAME" mkdir -p "$DICT_DST" 2>/dev/null || true

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
        echo '{ "codes": [1054] }' | docker exec -i "$CONTAINER_NAME" sh -c "cat > $DICT_DST/th_TH.json"
        echo "   ✅ Created th_TH.json"
    fi

    echo "   Setting permissions..."
    docker exec "$CONTAINER_NAME" chown -R ds:ds "$DICT_DST" 2>/dev/null || \
    docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$DICT_DST" 2>/dev/null || \
    docker exec "$CONTAINER_NAME" chown -R root:root "$DICT_DST" 2>/dev/null || true

    docker exec "$CONTAINER_NAME" chmod -R a+r "$DICT_DST"/* 2>/dev/null || true
fi

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
# Plugins ที่ปิดการโหลด (มีใน source แต่ไม่ copy เข้า container)
PLUGINS_DISABLED="comment-bridge thai-spellcheck"

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
echo "   Disabled (ไม่ copy): $PLUGINS_DISABLED"

# นับจำนวน plugins
PLUGIN_COUNT=$(find "$PLUGINS_SRC" -maxdepth 1 -type d ! -name "onlyoffice-plugins" | wc -l)
echo "   Found $PLUGIN_COUNT plugin(s) in source"

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

# ลบ disabled plugins จาก container (ถ้ามีจาก setup ครั้งก่อน)
for d in $PLUGINS_DISABLED; do
    if docker exec "$CONTAINER_NAME" test -d "$PLUGINS_DST/$d" 2>/dev/null; then
        docker exec "$CONTAINER_NAME" rm -rf "$PLUGINS_DST/$d" 2>/dev/null || true
        echo "   Removed disabled plugin: $d"
    fi
done

# Copy custom plugins
# NOTE: sdkjs-plugins ต้องเป็น writable (docker-compose ใช้ onlyoffice_plugins volume)
#       ถ้า error "mounted volume is marked read-only" ให้ recreate container ด้วย docker-compose ล่าสุด
echo "   Copying custom plugins..."
COPIED_COUNT=0
PLUGINS_WRITABLE=true
for plugin_dir in "$PLUGINS_SRC"/*; do
    if [ -d "$plugin_dir" ]; then
        plugin_name=$(basename "$plugin_dir")
        case " $PLUGINS_DISABLED " in
            *" $plugin_name "*) echo "     ⊘ Skipping disabled: $plugin_name"; continue ;;
        esac
        echo "     Copying $plugin_name..."
        
        # สร้าง temp tar file
        TEMP_TAR=$(mktemp)
        tar -czf "$TEMP_TAR" -C "$PLUGINS_SRC" "$plugin_name" 2>/dev/null
        
        # Extract ใน container (ใช้ docker cp แทน tar ถ้า tar ล้มเหลวจาก read-only)
        if docker exec -i "$CONTAINER_NAME" sh -c "cd $PLUGINS_DST && tar -xzf -" < "$TEMP_TAR" 2>/dev/null; then
            docker exec "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || \
            docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            docker exec "$CONTAINER_NAME" chmod -R a+rX "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            echo "     ✅ $plugin_name copied"
            COPIED_COUNT=$((COPIED_COUNT + 1))
        elif docker cp "$plugin_dir" "$CONTAINER_NAME:$PLUGINS_DST/$plugin_name" 2>/dev/null; then
            # Fallback: docker cp (อาจทำงานได้ถ้า path เขียนได้)
            docker exec "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || \
            docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            docker exec "$CONTAINER_NAME" chmod -R a+rX "$PLUGINS_DST/$plugin_name" 2>/dev/null || true
            echo "     ✅ $plugin_name copied (via docker cp)"
            COPIED_COUNT=$((COPIED_COUNT + 1))
        else
            echo "     ❌ Failed to copy $plugin_name (sdkjs-plugins อาจเป็น read-only)"
            PLUGINS_WRITABLE=false
        fi
        
        rm -f "$TEMP_TAR"
    fi
done

if [ "$PLUGINS_WRITABLE" = false ]; then
    echo ""
    echo "   ⚠️  sdkjs-plugins เป็น read-only - ให้ recreate container:"
    echo "      docker compose -f docker-compose.staging.yml up -d --force-recreate onlyoffice-documentserver"
    echo ""
fi

echo "   ✅ Copied $COPIED_COUNT plugin(s)"
echo ""

# ============================================
# 3. Setup Fonts (TH Sarabun)
# ============================================
echo "🔤 Setting up Fonts (TH Sarabun)..."
echo "----------------------------------------"

FONTS_SRC="$ONLYOFFICE_PATH/THSarabunNew"
FONTS_DST="/usr/share/fonts/truetype/th-sarabun"

# ตรวจสอบว่า source มีอยู่
if [ ! -d "$FONTS_SRC" ]; then
    echo "   ⚠️  Fonts source ไม่พบ: $FONTS_SRC"
    echo "   💡 Fonts อาจจะ mount ผ่าน volume ใน docker-compose แล้ว"
else
    echo "   Source: $FONTS_SRC"
    echo "   Destination: $FONTS_DST"
    
    # ตรวจสอบว่า fonts ถูก mount แล้วหรือไม่
    FONT_FILES=("THSarabunNew.ttf" "THSarabunNewBold.ttf" "THSarabunNewBoldItalic.ttf" "THSarabunNewItalic.ttf")
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
        
        # ตรวจสอบว่า destination directory เป็น read-only หรือไม่
        TEST_FILE="$FONTS_DST/.test_write"
        if docker exec "$CONTAINER_NAME" sh -c "touch $TEST_FILE 2>/dev/null && rm -f $TEST_FILE" 2>/dev/null; then
            # Directory เขียนได้
            echo "   💡 Copy fonts เข้า container..."
            
            # Copy fonts เข้า container
            docker exec "$CONTAINER_NAME" mkdir -p "$FONTS_DST" 2>/dev/null || true
            
            for font in "${FONT_FILES[@]}"; do
                if [ -f "$FONTS_SRC/$font" ]; then
                    if docker cp "$FONTS_SRC/$font" "$CONTAINER_NAME:$FONTS_DST/$font" 2>/dev/null; then
                        echo "     ✅ Copied $font"
                    else
                        echo "     ❌ Failed to copy $font (may be read-only mount)"
                    fi
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
            # Directory เป็น read-only
            echo "   ⚠️  Fonts directory เป็น read-only (mounted volume)"
            echo "   💡 แนะนำให้ mount fonts ผ่าน docker-compose volume:"
            echo "      ใน docker-compose.staging.yml เพิ่ม:"
            echo "      - ./only-office/THSarabunNew:/usr/share/fonts/truetype/th-sarabun:ro"
            echo ""
            echo "   💡 หรือ copy ไปที่ location อื่นที่เขียนได้:"
            ALT_FONTS_DST="/var/www/onlyoffice/Data/fonts/th-sarabun"
            echo "      Copying to alternative location: $ALT_FONTS_DST"
            docker exec "$CONTAINER_NAME" mkdir -p "$ALT_FONTS_DST" 2>/dev/null || true
            
            for font in "${FONT_FILES[@]}"; do
                if [ -f "$FONTS_SRC/$font" ]; then
                    if docker cp "$FONTS_SRC/$font" "$CONTAINER_NAME:$ALT_FONTS_DST/$font" 2>/dev/null; then
                        echo "     ✅ Copied $font to $ALT_FONTS_DST"
                    else
                        echo "     ❌ Failed to copy $font"
                    fi
                fi
            done
            
            echo "   ⚠️  Note: Fonts ถูก copy ไปที่ $ALT_FONTS_DST"
            echo "   ⚠️  Only Office อาจจะไม่เห็น fonts จนกว่าจะ rebuild font cache"
            echo "   💡 ลอง mount fonts ผ่าน volume ใน docker-compose แทน"
        fi
    else
        echo "   ✅ All fonts are mounted correctly"
        echo "   💡 If fonts don't appear, try rebuilding font cache:"
        echo "      docker exec $CONTAINER_NAME fc-cache -fv"
        echo "      docker exec $CONTAINER_NAME /usr/bin/documentserver-generate-allfonts.sh"
    fi
fi

echo ""

# ============================================
# 4. Example Files + DS Nginx (serve sample.docx)
# ============================================
# Image ใหม่: /var/www/onlyoffice/documentserver-example/example เป็น binary (Node.js app)
#   → ใช้ /var/www/onlyoffice/Data/example-files/ (named volume, writable) แทน
# ds.conf ใช้ include /etc/nginx/includes/ds-*.conf;
#   → เขียน location block เข้า ds-example.conf (ไฟล์มีอยู่แล้วแต่ว่างเปล่า)
echo "📄 Setting up Example Files (sample.docx)..."
echo "----------------------------------------"

EXAMPLE_SRC="$ONLYOFFICE_PATH/example/files"
EXAMPLE_DST="/var/www/onlyoffice/Data/example-files"
DS_EXAMPLE_CONF="/etc/nginx/includes/ds-example.conf"

if [ ! -d "$EXAMPLE_SRC" ]; then
    echo "   ⚠️  Example files source ไม่พบ: $EXAMPLE_SRC"
    echo "   💡 ข้ามขั้นตอนนี้"
else
    echo "   Source: $EXAMPLE_SRC"
    echo "   Destination: $EXAMPLE_DST (inside container)"

    # สร้าง directory + copy files
    docker exec "$CONTAINER_NAME" mkdir -p "$EXAMPLE_DST" 2>/dev/null || \
        docker exec -u root "$CONTAINER_NAME" mkdir -p "$EXAMPLE_DST"

    EXAMPLE_COPIED=0
    for f in "$EXAMPLE_SRC"/*; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        if docker cp "$f" "$CONTAINER_NAME:$EXAMPLE_DST/$fname" 2>/dev/null; then
            echo "   ✅ Copied $fname"
            EXAMPLE_COPIED=$((EXAMPLE_COPIED + 1))
        else
            echo "   ❌ Failed to copy $fname"
        fi
    done

    # Fix permissions
    docker exec "$CONTAINER_NAME" chown -R ds:ds "$EXAMPLE_DST" 2>/dev/null || \
        docker exec -u root "$CONTAINER_NAME" chown -R ds:ds "$EXAMPLE_DST" 2>/dev/null || true
    docker exec "$CONTAINER_NAME" chmod -R a+r "$EXAMPLE_DST" 2>/dev/null || true

    echo "   ✅ Copied $EXAMPLE_COPIED file(s)"
    echo ""

    # Nginx: เขียน location block เข้า ds-example.conf
    echo "   🔧 Patching Nginx (ds-example.conf)..."

    if docker exec "$CONTAINER_NAME" test -f "$DS_EXAMPLE_CONF" 2>/dev/null; then
        # เขียนทับ ds-example.conf (ไฟล์ว่างเดิม หรือ patch เดิม)
        docker exec "$CONTAINER_NAME" sh -c "cat > $DS_EXAMPLE_CONF" << 'NGINX_EOF'
# KK: serve example files (sample.docx) statically
# เพราะ Example App (Node.js) ไม่รัน เนื่องจาก DS_EXAMPLE=false
location ^~ /example/files/ {
    alias /var/www/onlyoffice/Data/example-files/;
    autoindex off;
}
NGINX_EOF

        # ตรวจสอบว่าเขียนสำเร็จ
        if docker exec "$CONTAINER_NAME" grep -q 'example-files' "$DS_EXAMPLE_CONF" 2>/dev/null; then
            echo "   ✅ ds-example.conf updated"

            # Test nginx config
            if docker exec "$CONTAINER_NAME" nginx -t 2>&1 | grep -q "successful"; then
                docker exec "$CONTAINER_NAME" nginx -s reload 2>/dev/null
                echo "   ✅ Nginx reloaded"

                # Verify
                sleep 1
                HTTP_CODE=$(docker exec "$CONTAINER_NAME" curl -s -o /dev/null -w "%{http_code}" \
                    --max-time 5 http://localhost/example/files/sample.docx 2>/dev/null || echo "000")
                if [ "$HTTP_CODE" = "200" ]; then
                    echo "   ✅ Verified: /example/files/sample.docx → HTTP $HTTP_CODE"
                else
                    echo "   ⚠️  /example/files/sample.docx → HTTP $HTTP_CODE (อาจต้องรอ DS พร้อม)"
                fi
            else
                echo "   ❌ Nginx config test failed:"
                docker exec "$CONTAINER_NAME" nginx -t 2>&1 | head -5
            fi
        else
            echo "   ❌ Failed to write ds-example.conf"
        fi
    else
        echo "   ⚠️  $DS_EXAMPLE_CONF not found — image อาจใช้โครงสร้างอื่น"
        echo "   💡 ลอง: docker exec $CONTAINER_NAME ls /etc/nginx/includes/"
    fi
fi

echo ""

# ============================================
# 5. Summary
# ============================================
echo "=========================================="
echo "✅ Setup completed!"
echo ""
echo "📋 Summary:"
echo "   - Dictionary: $DICT_DST"
echo "   - Plugins: $PLUGINS_DST ($COPIED_COUNT plugins)"
echo "   - Example files: $EXAMPLE_DST"
echo ""
echo "💡 Next steps:"
echo "   1. Restart container เพื่อให้ plugins โหลด:"
echo "      docker-compose restart $CONTAINER_NAME"
echo ""
echo "   2. ตรวจสอบผลลัพธ์:"
echo "      docker exec $CONTAINER_NAME ls -la $DICT_DST"
echo "      docker exec $CONTAINER_NAME ls -la $PLUGINS_DST"
echo "      docker exec $CONTAINER_NAME curl -s -o /dev/null -w '%{http_code}' http://localhost/example/files/sample.docx"
echo ""
echo "   3. ตรวจสอบใน editor: เปิดเอกสารใน Only Office แล้วดูที่เมนู Plugins"
echo ""
echo "   4. Quick fix (ถ้า example files ไม่ทำงานหลัง restart):"
echo "      docker exec $CONTAINER_NAME sh -c 'cat > /etc/nginx/includes/ds-example.conf << \"EOF\""
echo "location ^~ /example/files/ {"
echo "    alias /var/www/onlyoffice/Data/example-files/;"
echo "    autoindex off;"
echo "}"
echo "EOF'"
echo "      docker exec $CONTAINER_NAME nginx -s reload"
echo "=========================================="
