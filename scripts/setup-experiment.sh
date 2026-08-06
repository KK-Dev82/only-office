#!/usr/bin/env bash
# setup-experiment.sh — เตรียม container ทดลอง (onlyoffice-ds-exp) ให้เหมือน dev ตัวจริง
#
# ทำไมต้องมีสคริปต์นี้:
#   image ของ OnlyOffice ตั้ง ENTRYPOINT เป็น run-document-server.sh ไว้แล้ว
#   → บล็อก `command:` ใน docker-compose "ไม่ถูกรัน" (เป็นแค่ args ที่ถูกละเลย)
#   ดังนั้น plugins / dictionary registry / locale / inject scripts ต้องสั่งจากข้างนอกเอง
#   (ตัว dev ตัวจริงก็ใช้วิธีนี้ — ดู restart-ds-dev.sh)
#
# Usage:
#   bash scripts/setup-experiment.sh                 # ใช้ container ชื่อ onlyoffice-ds-exp
#   CONTAINER=ชื่ออื่น bash scripts/setup-experiment.sh
set -uo pipefail

CONTAINER="${CONTAINER:-onlyoffice-ds-exp}"
JWT_SECRET_VAL="${JWT_SECRET:-change_me_super_secret}"

echo "==> container: $CONTAINER"
docker inspect -f '    image={{.Config.Image}} status={{.State.Status}}' "$CONTAINER" || exit 1

# ---------- 1) Plugins: ลบ default + copy ของเรา ----------
echo "==> [1/6] plugins"
docker exec -u root "$CONTAINER" bash -c '
set -u
DST=/var/www/onlyoffice/documentserver/sdkjs-plugins
KEEP="document-office dictionary-abbreviation speech-to-text spellcheck-then-v2 thai-autocomplete insert-text-bridge"
if [ -x /usr/bin/documentserver-pluginsmanager.sh ]; then
  /usr/bin/documentserver-pluginsmanager.sh --directory="$DST" \
    --remove="highlight code, speech input, youtube, mendeley, zotero, photo editor, ocr, translator, ai, speech, thesaurus, typograf, doc2md, languagetool, deepl, draw.io, jitsi, telegram, wordpress, send" \
    2>&1 | grep -E "(Remove plugin|Error)" || true
else
  echo "    WARNING: documentserver-pluginsmanager.sh ไม่มีในเวอร์ชันนี้"
fi
if [ -d /opt/kk-plugins-src ]; then
  cp -R /opt/kk-plugins-src/* "$DST"/ 2>/dev/null || true
  DISABLED="spellcheck-then comment-bridge thai-spellcheck tab-first-line-indent"
  for d in $DISABLED; do
    [ -d "$DST/$d" ] && { chmod -R u+w "$DST/$d" 2>/dev/null; rm -rf "$DST/$d" 2>/dev/null; }
  done
  for d in $KEEP; do
    [ -d "$DST/$d" ] && { chown -R ds:ds "$DST/$d" 2>/dev/null; chmod -R a+rX "$DST/$d" 2>/dev/null; }
  done
fi
echo -n "    installed: "; ls "$DST" | grep -vE "^\{|^v1$|^marketplace$|\.(js|gz|json|css)$" | tr "\n" " "; echo
'

# ---------- 2) Dictionary registry (ไทย/อังกฤษ) ----------
echo "==> [2/6] dictionaries"
docker exec -u root "$CONTAINER" bash -c '
python3 /var/www/onlyoffice/documentserver/server/dictionaries/update.py >/dev/null 2>&1 || true
echo -n "    th_TH files: "; ls /var/www/onlyoffice/documentserver/dictionaries/th_TH 2>/dev/null | tr "\n" " "; echo
'

# ---------- 3) Locale ไทย (แก้ 404 th.json) ----------
echo "==> [3/6] locale"
docker exec -u root "$CONTAINER" bash -c '
[ -d /opt/kk-locale-src ] || { echo "    (ไม่มี /opt/kk-locale-src)"; exit 0; }
n=0
for d in $(find /var/www/onlyoffice/documentserver -type d -path "*/documenteditor/main/locale" 2>/dev/null); do
  cp /opt/kk-locale-src/*.json "$d"/ 2>/dev/null && n=$((n+1))
done
for vdir in /var/www/onlyoffice/documentserver/[0-9]*; do
  [ -d "$vdir/web-apps/apps/documenteditor/main/locale" ] || continue
  cp /opt/kk-locale-src/*.json "$vdir/web-apps/apps/documenteditor/main/locale"/ 2>/dev/null && n=$((n+1))
done
echo "    locale dirs updated: $n"
'

# ---------- 4) Inject scripts (ตัวชี้วัดว่า customization ยังใช้ได้ไหม) ----------
echo "==> [4/6] inject scripts"
for s in inject-autoformat-disable.sh inject-tab-as-tabchar.sh inject-pilcrow-color.sh inject-thai-underline.sh; do
  echo "    --- $s"
  docker exec -u root "$CONTAINER" bash "/opt/kk-scripts/$s" 2>&1 | sed 's/^/        /'
done

# ---------- 5) หน้า /example/ (ไว้เปิดเอกสารเปล่าทดสอบเร็วๆ) ----------
# หมายเหตุสำคัญ: siteUrl ตัวเดียวถูกใช้ 2 บทบาท
#   (ก) ฝัง <script src=...api.js> ให้ browser โหลด  → ต้องเป็น URL ที่ "เครื่องเรา" เข้าถึงได้
#   (ข) ให้ตัว example (อยู่ใน container) fetch meta/config → ต้องเป็น URL ที่ "ใน container" เข้าถึงได้
# จึงสั่ง nginx ให้ listen พอร์ตเดียวกับที่ publish ออกมา แล้วใช้ http://localhost:<port>/ ทั้งคู่
EXPPORT="${OO_EXP_HTTP_PORT:-8092}"
echo "==> [5/6] example page (port $EXPPORT)"
docker exec -u root "$CONTAINER" bash -c "
if ! grep -q 'listen 0.0.0.0:$EXPPORT;' /etc/nginx/conf.d/ds.conf; then
  sed -i '0,/listen 0.0.0.0:80;/s//listen 0.0.0.0:80;\n  listen 0.0.0.0:$EXPPORT;/' /etc/nginx/conf.d/ds.conf
  nginx -s reload 2>/dev/null || service nginx reload >/dev/null 2>&1
fi
cat > /etc/onlyoffice/documentserver-example/local.json <<JSON
{
  \"server\": {
    \"siteUrl\": \"http://localhost:$EXPPORT/\",
    \"token\": {
      \"enable\": true,
      \"secret\": \"$JWT_SECRET_VAL\",
      \"authorizationHeader\": \"Authorization\"
    }
  }
}
JSON
chown ds:ds /etc/onlyoffice/documentserver-example/local.json
sed -i 's/^autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-example.conf 2>/dev/null || true
supervisorctl reread >/dev/null 2>&1; supervisorctl update >/dev/null 2>&1
supervisorctl restart ds:example >/dev/null 2>&1 || supervisorctl start ds:example >/dev/null 2>&1
"

# ---------- 6) สรุปผล ----------
echo "==> [6/6] verify"
PORT="$EXPPORT"
sleep 6
echo "    healthcheck: $(curl -s http://localhost:$PORT/healthcheck)"
echo "    /example/  : HTTP $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/example/)"
echo ""
echo "เปิดทดสอบที่:  http://localhost:$PORT/example/   (กดปุ่ม docx = เอกสารเปล่า)"
