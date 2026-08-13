#!/usr/bin/env bash
# Verify which TH Sarabun New build the running DocumentServer actually uses.
#
# TH Sarabun New 1.3 and 1.35 share the same family name ("TH Sarabun New"),
# so a .docx cannot tell them apart. Only the file itself can. This script
# compares the fonts inside the container against the local source folders.
#
#   ./verify-thai-font.sh [container-name]

set -uo pipefail

CONTAINER="${1:-onlyoffice-documentserver}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOUNT="/usr/share/fonts/truetype/th-sarabun"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "container '$CONTAINER' is not running"
  echo "start it first, then re-run this script"
  exit 1
fi

echo "=============================================================="
echo "1. Reference checksums of the local source folders"
echo "=============================================================="
for d in THSarabunNew-13 THSarabunNew-135 THSarabunPSK THSarabunIT; do
  [ -d "$HERE/$d" ] || continue
  echo "--- $d"
  find "$HERE/$d" -name '*.ttf' -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 \
    | sed "s|$HERE/||"
done

echo
echo "=============================================================="
echo "2. Font files actually present inside the container"
echo "=============================================================="
echo "(v1.3 filenames have a space before the style: 'THSarabunNew Bold.ttf')"
echo "(v1.35 filenames do not:                       'THSarabunNewBold.ttf')"
docker exec "$CONTAINER" ls -la "$MOUNT" 2>/dev/null || echo "mount $MOUNT not found"

echo
echo "--- their checksums (compare against section 1) ---"
docker exec "$CONTAINER" sh -c "find $MOUNT -name '*.ttf' | sort | xargs sha256sum" 2>/dev/null

echo
echo "=============================================================="
echo "3. Version string recorded inside each font file"
echo "=============================================================="
docker exec "$CONTAINER" sh -c \
  "for f in $MOUNT/*.ttf; do printf '%-40s ' \"\$(basename \"\$f\")\"; strings \"\$f\" | grep -m1 -E '^Version [0-9]' || echo '(not found)'; done" 2>/dev/null

echo
echo "=============================================================="
echo "4. What fontconfig resolves 'TH Sarabun New' to"
echo "=============================================================="
docker exec "$CONTAINER" fc-match -v "TH Sarabun New" 2>/dev/null \
  | grep -E '^\s+(file|family|fontversion|fullname):' || echo "fc-match unavailable"

echo
echo "--- every Sarabun face fontconfig can see ---"
docker exec "$CONTAINER" fc-list 2>/dev/null | grep -i sarabun | sort

echo
echo "=============================================================="
echo "5. DocumentServer's own generated font cache"
echo "=============================================================="
echo "DS does not read /usr/share/fonts at render time. It renders from a cache"
echo "built by documentserver-generate-allfonts.sh. If that cache is older than"
echo "the mount, DS may still be using a previously mounted font build."
echo
DSFONTS=/var/www/onlyoffice/documentserver-example/public/fonts
for p in /var/www/onlyoffice/documentserver/fonts \
         /var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js \
         /var/www/onlyoffice/documentserver/fonts/font_selection.bin; do
  docker exec "$CONTAINER" sh -c "[ -e '$p' ] && ls -la '$p' | head -20" 2>/dev/null
done

echo
echo "--- is 'TH Sarabun New' registered in the DS font list? ---"
docker exec "$CONTAINER" sh -c \
  "grep -ao 'TH Sarabun New' /var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js 2>/dev/null | head -3; \
   grep -ac 'TH Sarabun New' /var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js 2>/dev/null" \
  || echo "AllFonts.js not readable"

echo
echo "=============================================================="
echo "VERDICT"
echo "=============================================================="
echo "The font DocumentServer used to produce the screenshot is the one whose"
echo "sha256 in section 2 matches a folder in section 1 - provided the cache in"
echo "section 5 is NEWER than the mount. If it is older, regenerate it:"
echo
echo "  docker exec $CONTAINER fc-cache -fv"
echo "  docker exec $CONTAINER documentserver-generate-allfonts.sh"
echo "  docker restart $CONTAINER"
echo
echo "then re-open the document and confirm the rendering is unchanged."
