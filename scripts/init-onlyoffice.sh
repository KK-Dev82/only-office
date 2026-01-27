#!/bin/bash
# Init script สำหรับ Only Office DocumentServer
# Script นี้สามารถรันได้ทั้งจาก container init และจากภายนอก
# Usage: 
#   - จาก container init: /opt/kk-init/init-onlyoffice.sh
#   - จากภายนอก: docker exec container-name /opt/kk-init/init-onlyoffice.sh

set -euo pipefail

# ตรวจสอบว่าเราอยู่ใน container หรือไม่
IN_CONTAINER=${IN_CONTAINER:-false}
if [ -f "/.dockerenv" ] || [ -n "${DOCKER_CONTAINER:-}" ] || [ -f "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" ]; then
    IN_CONTAINER=true
fi

echo "[KK] Only Office Init Script"
echo "[KK] Running in container: $IN_CONTAINER"
echo ""

INIT_MARK="/var/www/onlyoffice/Data/.kk_init_done"

# ============================================
# 1. Initial Setup (ครั้งแรกเท่านั้น)
# ============================================
if [ ! -f "$INIT_MARK" ]; then
    echo "[KK] init: installing fonts/plugins/dicts (first time)..."

    # Fonts: rebuild font cache + generate allfonts
    (fc-cache -fv || true)
    (/usr/bin/documentserver-generate-allfonts.sh || true)

    date > "$INIT_MARK"
    echo "[KK] init: done."
else
    echo "[KK] init: already done ($INIT_MARK)."
fi

# ============================================
# 2. Sync Dictionaries (ทุกครั้งที่ start)
# ============================================
echo "[KK] syncing dictionaries..."
DICS_DST="/var/www/onlyoffice/documentserver/dictionaries/th_TH"
mkdir -p "$DICS_DST" 2>/dev/null || true

# ตรวจสอบว่า source มีอยู่
if [ ! -d "/opt/kk-dict-src" ]; then
    echo "[KK] Warning: /opt/kk-dict-src not found, skipping dictionary sync"
else
    # Copy ไฟล์ dictionary (overwrite)
    if [ -f "/opt/kk-dict-src/th_TH/th_TH.dic" ]; then
        cp "/opt/kk-dict-src/th_TH/th_TH.dic" "$DICS_DST/th_TH.dic" 2>/dev/null && echo "[KK] Copied th_TH.dic" || echo "[KK] Failed to copy th_TH.dic"
    else
        echo "[KK] Warning: /opt/kk-dict-src/th_TH/th_TH.dic not found"
    fi
    if [ -f "/opt/kk-dict-src/th_TH/th_TH.aff" ]; then
        cp "/opt/kk-dict-src/th_TH/th_TH.aff" "$DICS_DST/th_TH.aff" 2>/dev/null && echo "[KK] Copied th_TH.aff" || echo "[KK] Failed to copy th_TH.aff"
    else
        echo "[KK] Warning: /opt/kk-dict-src/th_TH/th_TH.aff not found"
    fi
    if [ -f "/opt/kk-dict-src/th_TH/th_TH.json" ]; then
        cp "/opt/kk-dict-src/th_TH/th_TH.json" "$DICS_DST/th_TH.json" 2>/dev/null && echo "[KK] Copied th_TH.json" || echo "[KK] Failed to copy th_TH.json"
    else
        printf '{ "codes": [1054] }\n' > "$DICS_DST/th_TH.json" 2>/dev/null && echo "[KK] Created th_TH.json" || echo "[KK] Failed to create th_TH.json"
    fi
fi

# แก้ไข permission
if command -v sudo >/dev/null 2>&1; then
    sudo chown -R ds:ds "$DICS_DST" 2>/dev/null || chown -R ds:ds "$DICS_DST" 2>/dev/null || true
else
    chown -R ds:ds "$DICS_DST" 2>/dev/null || chown -R root:root "$DICS_DST" 2>/dev/null || true
fi
chmod -R a+r "$DICS_DST"/* 2>/dev/null || true

# Update dictionary registry
if [ -x "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" ]; then
    (python3 "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" || true)
elif [ -x "/usr/bin/documentserver-dictionaries-update.sh" ]; then
    (/usr/bin/documentserver-dictionaries-update.sh || true)
else
    # สร้าง registry file manually ถ้าไม่มี
    REGISTRY_DIR="/var/www/onlyoffice/documentserver/server/dictionaries"
    REGISTRY_FILE="$REGISTRY_DIR/dictionaries.json"
    if [ ! -f "$REGISTRY_FILE" ]; then
        mkdir -p "$REGISTRY_DIR" 2>/dev/null || true
        printf '[{"name":"Thai (Thailand)","code":"th_TH","codes":[1054],"file":"th_TH.dic"}]\n' > "$REGISTRY_FILE" 2>/dev/null || true
        chown ds:ds "$REGISTRY_FILE" 2>/dev/null || chown root:root "$REGISTRY_FILE" 2>/dev/null || true
    fi
fi

# ============================================
# 3. Sync Plugins (ทุกครั้งที่ start)
# ============================================
echo "[KK] syncing plugins..."
PLUGINS_DST="/var/www/onlyoffice/documentserver/sdkjs-plugins"
mkdir -p "$PLUGINS_DST"

# ลบ default plugins (ถ้ามี plugin manager)
if [ -d "$PLUGINS_DST" ] && [ "$PLUGINS_DST" = "/var/www/onlyoffice/documentserver/sdkjs-plugins" ]; then
    if [ -x /usr/bin/documentserver-pluginsmanager.sh ]; then
        /usr/bin/documentserver-pluginsmanager.sh \
            --directory="$PLUGINS_DST" \
            --remove="highlight code, speech input, youtube, mendeley, zotero, photo editor, ocr, translator, ai, speech, thesaurus" \
            2>&1 | grep -E "(Remove plugin|OK|Error)" || true
    fi
fi

# Copy plugins ที่เราพัฒนา
if [ -d "/opt/kk-plugins-src" ]; then
    echo "[KK] syncing custom plugins from /opt/kk-plugins-src to $PLUGINS_DST..."
    cp -R /opt/kk-plugins-src/* "$PLUGINS_DST"/
    # ตั้ง permission
    chown -R ds:ds "$PLUGINS_DST"/document-office "$PLUGINS_DST"/dictionary-abbreviation "$PLUGINS_DST"/speech-to-text "$PLUGINS_DST"/thai-spellcheck "$PLUGINS_DST"/thai-autocomplete "$PLUGINS_DST"/comment-bridge 2>/dev/null || true
    chmod -R a+rX "$PLUGINS_DST"/document-office "$PLUGINS_DST"/dictionary-abbreviation "$PLUGINS_DST"/speech-to-text "$PLUGINS_DST"/thai-spellcheck "$PLUGINS_DST"/thai-autocomplete "$PLUGINS_DST"/comment-bridge 2>/dev/null || true
fi

# ============================================
# 4. Example files
# ============================================
EXAMPLE_DST="/var/www/onlyoffice/documentserver-example/example/files"
mkdir -p "$EXAMPLE_DST"
if [ -d "/opt/kk-example-src/files" ]; then
    cp -R /opt/kk-example-src/files/* "$EXAMPLE_DST"/ 2>/dev/null || true
fi

# ============================================
# 5. Start DocumentServer (ถ้ารันจาก init)
# ============================================
if [ "$IN_CONTAINER" = true ] && [ "${1:-}" != "sync-only" ]; then
    echo "[KK] Starting DocumentServer..."
    if [ -x /app/run-document-server.sh ]; then
        exec /app/run-document-server.sh
    elif [ -x /run-document-server.sh ]; then
        exec /run-document-server.sh
    elif command -v run-document-server.sh >/dev/null 2>&1; then
        exec run-document-server.sh
    else
        echo "Cannot find run-document-server.sh" >&2
        exit 1
    fi
fi

echo "[KK] Init script completed"
