#!/bin/bash
# Init script สำหรับ Only Office DocumentServer
# Script นี้รันภายใน container เท่านั้น
# Usage:
#   - จาก container init (entrypoint): /opt/kk-init/init-onlyoffice.sh
#   - sync ซ้ำ (manual): docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
#   - patch nginx เท่านั้น: docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh patch-nginx
#
# NOTE: ถ้า image ใช้ ENTRYPOINT แทน CMD ให้ใช้ entrypoint ใน docker-compose
#       หรือรัน setup-onlyoffice-server.sh จาก host แทน (แนะนำ)

# ไม่ใช้ set -e เพราะ non-critical failure ไม่ควรหยุด DS จาก start
set -uo pipefail

KK_ERRORS=0
kk_warn() { echo "[KK] WARNING: $*" >&2; KK_ERRORS=$((KK_ERRORS + 1)); }

# ตรวจสอบว่าเราอยู่ใน container หรือไม่
IN_CONTAINER=${IN_CONTAINER:-false}
if [ -f "/.dockerenv" ] || [ -n "${DOCKER_CONTAINER:-}" ] || [ -f "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" ]; then
    IN_CONTAINER=true
fi

MODE="${1:-full}"

echo "[KK] Only Office Init Script (mode=$MODE)"
echo "[KK] Running in container: $IN_CONTAINER"
echo ""

if [ "$IN_CONTAINER" != true ]; then
    echo "[KK] ERROR: สคริปต์นี้ต้องรันภายใน container"
    echo "[KK] Usage:"
    echo "[KK]   docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh"
    echo "[KK]   docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only"
    echo "[KK]   docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh patch-nginx"
    echo "[KK]"
    echo "[KK] หรือใช้ setup-onlyoffice-server.sh จาก host แทน (แนะนำ)"
    exit 1
fi

# ============================================
# Nginx patch function (reusable)
# ============================================
# Image ใหม่: ds.conf ใช้ include /etc/nginx/includes/ds-*.conf;
#   → ds-example.conf มีอยู่แล้วแต่ว่างเปล่า → เขียน location block เข้าไป
# Example files: /var/www/onlyoffice/Data/example-files/ (named volume, writable)
#   → ห้ามใช้ /documentserver-example/example/ เพราะเป็น binary file
patch_ds_nginx() {
    local EXAMPLE_DST="/var/www/onlyoffice/Data/example-files"
    local DS_EXAMPLE_CONF="/etc/nginx/includes/ds-example.conf"

    # Copy example files ไปที่ writable path
    mkdir -p "$EXAMPLE_DST" 2>/dev/null || true
    if [ -d "/opt/kk-example-src/files" ]; then
        cp -R /opt/kk-example-src/files/* "$EXAMPLE_DST"/ 2>/dev/null || true
        echo "[KK] Example files copied to $EXAMPLE_DST"
    else
        kk_warn "/opt/kk-example-src/files not found — check volume mount"
    fi
    chown -R ds:ds "$EXAMPLE_DST" 2>/dev/null || true
    chmod -R a+r "$EXAMPLE_DST" 2>/dev/null || true

    # เขียน nginx config เข้า ds-example.conf
    if [ -f "$DS_EXAMPLE_CONF" ]; then
        cat > "$DS_EXAMPLE_CONF" << 'NGINX_EOF'
# KK: serve example files (sample.docx) statically
# เพราะ Example App (Node.js) ไม่รัน เนื่องจาก DS_EXAMPLE=false
location ^~ /example/files/ {
    alias /var/www/onlyoffice/Data/example-files/;
    autoindex off;
}
NGINX_EOF

        if grep -q 'example-files' "$DS_EXAMPLE_CONF" 2>/dev/null; then
            echo "[KK] DS Nginx: ds-example.conf updated OK."
        else
            kk_warn "Failed to write ds-example.conf"
            return 1
        fi
    else
        kk_warn "$DS_EXAMPLE_CONF not found — image อาจใช้โครงสร้างอื่น"
        return 1
    fi

    # ถ้า Nginx กำลังรันอยู่ → reload
    if pgrep -x nginx >/dev/null 2>&1; then
        if nginx -t 2>&1 | grep -q "successful"; then
            nginx -s reload 2>/dev/null && echo "[KK] DS Nginx: reload OK." || kk_warn "nginx reload failed"
        else
            kk_warn "nginx config test failed — not reloading"
            nginx -t 2>&1 | head -5
        fi
    fi
    return 0
}

# ============================================
# patch-nginx mode: เฉพาะ Nginx patch + reload
# ============================================
if [ "$MODE" = "patch-nginx" ]; then
    echo "[KK] Running patch-nginx only..."
    patch_ds_nginx
    echo "[KK] patch-nginx done (errors=$KK_ERRORS)."
    # Verify
    sleep 1
    curl -s -o /dev/null -w "[KK] Verify /example/files/sample.docx → HTTP %{http_code}\n" \
        --max-time 5 http://localhost/example/files/sample.docx 2>/dev/null || true
    exit $KK_ERRORS
fi

# ============================================
# 1. Initial Setup (ครั้งแรกเท่านั้น)
# ============================================
INIT_MARK="/var/www/onlyoffice/Data/.kk_init_done"

if [ ! -f "$INIT_MARK" ]; then
    echo "[KK] init: installing fonts/plugins/dicts (first time)..."
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

# ตรวจสอบว่า destination เป็น bind mount read-only หรือไม่
DICS_READONLY=false
if ! touch "$DICS_DST/.write_test" 2>/dev/null; then
    DICS_READONLY=true
fi
rm -f "$DICS_DST/.write_test" 2>/dev/null || true

if [ "$DICS_READONLY" = true ]; then
    echo "[KK] Dictionary path เป็น bind mount (read-only) — ไฟล์จาก host มีอยู่แล้ว"
    for f in th_TH.dic th_TH.aff th_TH.json; do
        [ -f "$DICS_DST/$f" ] && echo "[KK]   ✅ $f" || kk_warn "$f not found in bind mount"
    done
elif [ -d "/opt/kk-dict-src/th_TH" ]; then
    mkdir -p "$DICS_DST" 2>/dev/null || true
    for f in th_TH.dic th_TH.aff th_TH.json hyph_th_TH.dic; do
        if [ -f "/opt/kk-dict-src/th_TH/$f" ]; then
            cp "/opt/kk-dict-src/th_TH/$f" "$DICS_DST/$f" 2>/dev/null && echo "[KK] Copied $f" || kk_warn "Failed to copy $f"
        fi
    done
    if [ ! -f "$DICS_DST/th_TH.json" ]; then
        printf '{ "codes": [1054] }\n' > "$DICS_DST/th_TH.json" 2>/dev/null || true
    fi
    chown -R ds:ds "$DICS_DST" 2>/dev/null || true
    chmod -R a+r "$DICS_DST"/* 2>/dev/null || true
else
    kk_warn "/opt/kk-dict-src not found, skipping dictionary sync"
fi

# Update dictionary registry
if [ -x "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" ]; then
    (python3 "/var/www/onlyoffice/documentserver/server/dictionaries/update.py" || true)
elif [ -x "/usr/bin/documentserver-dictionaries-update.sh" ]; then
    (/usr/bin/documentserver-dictionaries-update.sh || true)
else
    REGISTRY_DIR="/var/www/onlyoffice/documentserver/server/dictionaries"
    REGISTRY_FILE="$REGISTRY_DIR/dictionaries.json"
    if [ ! -f "$REGISTRY_FILE" ]; then
        mkdir -p "$REGISTRY_DIR" 2>/dev/null || true
        printf '[{"name":"Thai (Thailand)","code":"th_TH","codes":[1054],"file":"th_TH.dic"}]\n' > "$REGISTRY_FILE" 2>/dev/null || true
        chown ds:ds "$REGISTRY_FILE" 2>/dev/null || true
    fi
fi

# ============================================
# 3. Sync Plugins (ทุกครั้งที่ start)
# ============================================
PLUGINS_DISABLED="comment-bridge thai-spellcheck"

echo "[KK] syncing plugins..."
echo "[KK] Disabled plugins (ไม่ copy): $PLUGINS_DISABLED"
PLUGINS_DST="/var/www/onlyoffice/documentserver/sdkjs-plugins"
mkdir -p "$PLUGINS_DST"
chmod -R u+w "$PLUGINS_DST" 2>/dev/null || true

if [ -d "$PLUGINS_DST" ] && [ "$PLUGINS_DST" = "/var/www/onlyoffice/documentserver/sdkjs-plugins" ]; then
    if [ -x /usr/bin/documentserver-pluginsmanager.sh ]; then
        echo "[KK] Removing default plugins using documentserver-pluginsmanager.sh..."
        /usr/bin/documentserver-pluginsmanager.sh \
            --directory="$PLUGINS_DST" \
            --remove="highlight code, speech input, youtube, mendeley, zotero, photo editor, ocr, translator, ai, speech, thesaurus" \
            2>&1 | grep -E "(Remove plugin|OK|Error)" || true
    fi
    echo "[KK] Cleaning non-custom plugin folders + disabled plugins..."
    for item in "$PLUGINS_DST"/*; do
        [ -e "$item" ] || continue
        case "$(basename "$item")" in
            document-office|dictionary-abbreviation|speech-to-text|spellcheck-then|thai-autocomplete|insert-text-bridge)
                ;;
            pluginBase.js|pluginBase.js.gz|plugin-list-default.json|plugin-list-default.json.gz|plugins.css|plugins.css.gz|marketplace|v1)
                ;;
            comment-bridge|thai-spellcheck)
                [ -d "$item" ] && { chmod -R u+w "$item" 2>/dev/null || true; rm -rf "$item" 2>/dev/null || true; echo "[KK] Removed disabled: $(basename "$item")"; }
                ;;
            *)
                [ -d "$item" ] && { chmod -R u+w "$item" 2>/dev/null || true; rm -rf "$item" 2>/dev/null || true; }
                [ -f "$item" ] && { chmod u+w "$item" 2>/dev/null || true; rm -f "$item" 2>/dev/null || true; }
                ;;
        esac
    done
fi

if [ -d "/opt/kk-plugins-src" ]; then
    echo "[KK] syncing custom plugins from /opt/kk-plugins-src to $PLUGINS_DST (excluding disabled)..."
    for p in /opt/kk-plugins-src/*; do
        [ -d "$p" ] || continue
        name=$(basename "$p")
        case " $PLUGINS_DISABLED " in
            *" $name "*) echo "[KK] Skipping disabled: $name"; continue ;;
        esac
        cp -R "$p" "$PLUGINS_DST/" || { kk_warn "cp $name failed"; }
        echo "[KK] Copied $name"
    done
    for p in document-office dictionary-abbreviation speech-to-text spellcheck-then thai-autocomplete insert-text-bridge; do
        [ -d "$PLUGINS_DST/$p" ] && chown -R ds:ds "$PLUGINS_DST/$p" 2>/dev/null || true
        [ -d "$PLUGINS_DST/$p" ] && chmod -R a+rX "$PLUGINS_DST/$p" 2>/dev/null || true
    done
    echo "[KK] checking plugins..."
    for plugin in document-office dictionary-abbreviation speech-to-text spellcheck-then thai-autocomplete insert-text-bridge; do
        if [ -d "$PLUGINS_DST/$plugin" ] && [ -f "$PLUGINS_DST/$plugin/config.json" ]; then
            echo "[KK]   ✅ $plugin"
        else
            echo "[KK]   ⚠️  $plugin not found or missing config.json"
        fi
    done
    for d in $PLUGINS_DISABLED; do
        echo "[KK]   ⊘ $d (disabled)"
    done
else
    kk_warn "/opt/kk-plugins-src not found - check volume mount ./only-office/onlyoffice-plugins"
fi

# ============================================
# 4. Write local.json (JWT browser token + optional siteUrl)
# ============================================
# แก้ 403 บน /cache/files/data/.../Editor.bin
# สาเหตุ: OnlyOffice 9.x ต้องการ JWT token จาก browser สำหรับ cache requests
#         ต้อง set token.enable.browser=true เพื่อให้ SDK attach JWT ให้อัตโนมัติ
#
# ONLYOFFICE_SITE_URL (optional):
#   - ถ้า OO ใช้กับ domain เดียว → ตั้งค่า (เช่น https://bmsh.senate.go.th)
#   - ถ้า OO ใช้ร่วมกันหลาย domain (production + staging) → ไม่ต้องตั้ง
#     OO จะใช้ Host header จาก request แทน ทำให้รองรับทุก domain อัตโนมัติ
LOCAL_JSON_PATH="/etc/onlyoffice/documentserver/local.json"
if [ -f "$LOCAL_JSON_PATH" ] && grep -q '"browser"' "$LOCAL_JSON_PATH" 2>/dev/null; then
    echo "[KK] local.json already configured (mounted or from image) — skipping write."
else
    mkdir -p "$(dirname "$LOCAL_JSON_PATH")" 2>/dev/null || true

    # build siteUrl block เฉพาะเมื่อมี ONLYOFFICE_SITE_URL
    if [ -n "${ONLYOFFICE_SITE_URL:-}" ]; then
        echo "[KK] Writing local.json (siteUrl=${ONLYOFFICE_SITE_URL}, browser JWT=true)..."
        SITE_URL_BLOCK="\"server\": { \"siteUrl\": \"${ONLYOFFICE_SITE_URL}\" },"
    else
        echo "[KK] Writing local.json (browser JWT=true, no siteUrl — multi-domain mode)..."
        SITE_URL_BLOCK=""
    fi

    cat > "$LOCAL_JSON_PATH" << LOCALJSON_EOF
{
  "services": {
    "CoAuthoring": {
      ${SITE_URL_BLOCK}
      "token": {
        "enable": {
          "request": { "inbox": true, "outbox": true },
          "browser": true
        },
        "inbox": { "header": "Authorization" },
        "outbox": { "header": "Authorization" }
      }
    }
  }
}
LOCALJSON_EOF
    echo "[KK] local.json written OK."
fi

# ============================================
# 5. Example files + DS Nginx (ds-example.conf)
# ============================================
patch_ds_nginx

# ============================================
# 6. Locale: sync en.json / th.json → documenteditor/main/locale (แก้ 404 ภาษาไทย)
# ============================================
if [ -d "/opt/kk-locale-src" ]; then
    echo "[KK] syncing locale (documenteditor/main/locale)..."
    sync_locale_to() {
        local d="$1"
        [ -n "$d" ] || return 0
        mkdir -p "$d"
        for f in /opt/kk-locale-src/*.json; do
            [ -f "$f" ] && cp "$f" "$d/" 2>/dev/null || true
        done
    }
    for LOCALE_DST in $(find /var/www/onlyoffice/documentserver -type d -path "*/documenteditor/main/locale" 2>/dev/null); do
        sync_locale_to "$LOCALE_DST"
    done
    for vdir in /var/www/onlyoffice/documentserver/[0-9]*; do
        [ -d "$vdir" ] || continue
        sync_locale_to "$vdir/web-apps/apps/documenteditor/main/locale"
    done
    sync_locale_to "/var/www/onlyoffice/documentserver/web-apps/apps/documenteditor/main/locale"
    echo "[KK] Locale (documenteditor/main/locale) synced."
fi

# ============================================
# Summary
# ============================================
if [ "$KK_ERRORS" -gt 0 ]; then
    echo ""
    echo "[KK] ⚠️  Completed with $KK_ERRORS warning(s). DS will still start."
else
    echo ""
    echo "[KK] ✅ All init steps completed successfully."
fi

# ============================================
# 7. Start DocumentServer (ถ้ารันจาก entrypoint)
# ============================================
if [ "$MODE" != "sync-only" ] && [ "$MODE" != "patch-nginx" ]; then
    echo "[KK] Starting DocumentServer..."
    # Image ใหม่: /app/ds/run-document-server.sh (ไม่ใช่ /app/run-document-server.sh)
    for run_script in /app/ds/run-document-server.sh /app/run-document-server.sh /run-document-server.sh; do
        if [ -x "$run_script" ]; then
            echo "[KK] Using: $run_script"
            exec "$run_script"
        fi
    done
    # Fallback: ลอง PATH
    if command -v run-document-server.sh >/dev/null 2>&1; then
        exec run-document-server.sh
    fi
    echo "[KK] ERROR: Cannot find run-document-server.sh" >&2
    exit 1
fi

echo "[KK] Init script completed (mode=$MODE)"
