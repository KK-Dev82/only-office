#!/usr/bin/env bash
# Inject script ลงใน DocumentEditor index.html ของ OnlyOffice DS
# เพื่อตั้ง default localStorage ปิด AutoCorrect ต่างๆ
#
# ทำงานยังไง:
#   1. หาไฟล์ */documenteditor/main/index.html (ไม่เอา .gz)
#   2. ถ้ายังไม่เคยฉีด → sed inject <script> ก่อน </head>
#   3. Regenerate index.html.gz (OnlyOffice nginx ใช้ gzip_static — ถ้าไม่ regen, .gz เก่าจะถูก serve แทน)
#
# Force mode: บังคับเซ็ตทุก page load (ไม่สนใจค่าที่ user เคยตั้ง)
#   - ถ้าอยากให้ user override ได้ ให้เปลี่ยน setItem(...) เป็น
#     if(getItem(...)===null)setItem(...) ในตัว TAG ด้านล่าง
#
# ปรับ keys ที่จะปิดได้ใน DISABLE_KEYS ด้านล่าง
#   - ลบ line ที่ไม่ต้องการปิดออก
#   - ค่า "0" = ปิด, "1" = เปิด (OnlyOffice ใช้ "0"/"1" ไม่ใช่ "false"/"true")
#
# Idempotent: ใช้ marker /*kk-autoformat-disable*/ เช็คว่าฉีดไปแล้วยัง
set -uo pipefail

DS_ROOT="${DS_ROOT:-/var/www/onlyoffice/documentserver}"
MARKER="kk-autoformat-disable"

# =====================================================================
# SETTINGS ที่จะ override — format: "key=value"
# แก้ตรงนี้เพื่อ toggle/เพิ่ม/ลด (ลบ line = ไม่บังคับ)
# =====================================================================
# AutoCorrect disable (ค่า "0" = off)
#   Tab "AutoFormat as you type":
#     - Apply as you type:
#         de-settings-autoformat-bulleted          - "- + space" -> bullet
#         de-settings-autoformat-numbered          - "1. + space" -> numbered list
#     - Replace as you type:
#         de-settings-autoformat-smart-quotes      - " -> smart quotes
#         de-settings-autoformat-hyphens           - -- -> dash
#         de-settings-autoformat-hyperlink         - URL -> hyperlink auto
#         de-settings-autoformat-double-space      - space space -> period
#   Tab "Text AutoCorrect":
#         de-settings-letter-exception-sentence    - capitalize first letter of sentence
#         de-settings-letter-exception-cells       - capitalize first letter of table cells
#   Tab "Math AutoCorrect":
#         de-settings-math-correct-replace-type    - Replace text as you type (math)
# Default language (เก็บเป็น string เช่น "th-TH")
#   app-settings-recent-langs                       - recent languages list
# UI defaults
#   de-hide-right-settings                          - "1" = ซ่อน right-side settings panel
SETTINGS=(
  "de-settings-autoformat-bulleted=0"
  "de-settings-autoformat-numbered=0"
  "de-settings-autoformat-smart-quotes=1"
  "de-settings-autoformat-hyphens=0"
  "de-settings-autoformat-hyperlink=0"
  "de-settings-autoformat-double-space=0"
  "de-settings-letter-exception-sentence=0"
  "de-settings-letter-exception-cells=0"
  "de-settings-math-correct-replace-type=0"
  "app-settings-recent-langs=th-TH"
  "de-hide-right-settings=1"
)

# สร้าง JSON-like pairs สำหรับ JS เช่น ["key1","val1"],["key2","val2"]
JS_PAIRS=""
for kv in "${SETTINGS[@]}"; do
  key="${kv%%=*}"
  val="${kv#*=}"
  # escape double quotes ใน value
  val_escaped="${val//\"/\\\"}"
  if [ -z "$JS_PAIRS" ]; then
    JS_PAIRS="[\"$key\",\"$val_escaped\"]"
  else
    JS_PAIRS="$JS_PAIRS,[\"$key\",\"$val_escaped\"]"
  fi
done

# Script tag ที่จะฉีด (force mode: setItem ทุก reload โดยไม่เช็คค่าเก่า)
TAG="<script>/*${MARKER}*/try{var _s=[${JS_PAIRS}];for(var _i=0;_i<_s.length;_i++){localStorage.setItem(_s[_i][0],_s[_i][1]);}}catch(e){}</script>"

injected=0
skipped=0
not_found=0

for f in $(find "$DS_ROOT" -type f -path "*/documenteditor/main/index.html" 2>/dev/null); do
  if grep -q "$MARKER" "$f" 2>/dev/null; then
    # ถ้ามี marker เก่าอยู่ ลบทิ้งก่อน (เพื่อรอง re-inject ตอนเพิ่ม/ลบ keys)
    # ใช้ approach: remove ทั้ง <script>...marker...</script> tag
    # แต่ sed regex จับ <...> ที่มี < ภายในยาก เลยใช้ perl
    if command -v perl >/dev/null 2>&1; then
      perl -i -pe 's|<script>/\*'"$MARKER"'\*/[^<]*(?:<[^/][^<]*)*</script>||g' "$f"
    else
      # fallback: ลบทั้ง line ที่มี marker (ถ้า inject อยู่ใน head ที่มี </head> บน line เดียวกัน อาจเจ๊ง)
      sed -i "/${MARKER}/d" "$f"
    fi
    echo "[KK] AutoFormat-disable: removed old inject from $f"
  fi

  if ! grep -q "</head>" "$f" 2>/dev/null; then
    not_found=$((not_found+1))
    echo "[KK] AutoFormat-disable: no </head> in $f"
    continue
  fi

  if sed -i "s|</head>|${TAG}</head>|" "$f" 2>/dev/null; then
    injected=$((injected+1))
    echo "[KK] AutoFormat-disable injected (${#SETTINGS[@]} keys): $f"

    # Regenerate .gz ให้ตรงกับ .html ที่เพิ่งแก้
    if [ -f "${f}.gz" ]; then
      if gzip -c -f "$f" > "${f}.gz" 2>/dev/null; then
        echo "[KK]   -> regenerated ${f}.gz"
      else
        echo "[KK]   ! failed to regenerate ${f}.gz"
      fi
    fi
  fi
done

echo "[KK] AutoFormat-disable: injected=$injected skipped=$skipped no-head=$not_found"
echo "[KK] Settings applied:"
for kv in "${SETTINGS[@]}"; do echo "[KK]   $kv"; done
