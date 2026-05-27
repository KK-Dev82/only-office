#!/usr/bin/env bash
# Inject script ลงใน DocumentEditor index.html ของ OnlyOffice DS
# เพื่อบังคับให้ปุ่ม Tab แทรก tab character (\t) เสมอ — ไม่ปรับ first-line indent
#
# Background:
#   OnlyOffice/MS Word มี behavior "Set left- and first-indent with tabs":
#   ถ้า cursor อยู่หน้าข้อความในย่อหน้าที่มีเนื้อหาแล้ว → กด Tab จะปรับ first-line indent
#   (Ruler ขยับ) แทนการแทรก tab character. ผู้ใช้สำนักงาน สว. ขอให้ปิด behavior นี้
#   เพราะใช้แล้ว format เพี้ยน ไม่ตรงตามต้นฉบับเอกสารราชการ.
#
#   OnlyOffice ไม่มี localStorage toggle สำหรับ feature นี้ (เทียบกับ Word ที่มี
#   checkbox ที่ AutoCorrect > AutoFormat As You Type) → ต้อง patch ด้วย DOM hook.
#
# กลไก:
#   1. Capture-phase keydown listener ที่ document — ดักก่อน sdkjs ได้ event
#   2. preventDefault + stopImmediatePropagation — กิน Tab key
#   3. เรียก Asc.editor.asc_AddText('\t') — แทรก tab character ผ่าน internal API
#   4. Shift+Tab / Ctrl+Tab / Alt+Tab → ปล่อย default (ไม่ดัก)
#
# ความเสี่ยง:
#   - `Asc.editor.asc_AddText` เป็น undocumented internal API ของ sdkjs
#     ถ้า OnlyOffice upgrade major version อาจ rename/refactor — ต้อง test ทุก upgrade
#   - ในตาราง: ปกติ Tab = ไป cell ถัดไป แต่ที่นี่จะแทรก \t (per requirement)
#
# Idempotent: ใช้ marker /*kk-tab-as-tabchar*/ — รันซ้ำได้ ไม่ inject ซ้อน
set -uo pipefail

DS_ROOT="${DS_ROOT:-/var/www/onlyoffice/documentserver}"
MARKER="kk-tab-as-tabchar"

# Script ที่จะ inject — ใส่ลง <head> ของ documenteditor/main/index.html
# Loop รอจนกว่า Asc.editor + #area_id โหลดเสร็จ (polling 500ms)
read -r -d '' TAG <<'EOF'
<script>/*kk-tab-as-tabchar*/(function(){
function setup(){
  var area=document.getElementById("area_id");
  var ed=window.Asc&&window.Asc.editor;
  if(!area||!ed||typeof ed.asc_AddText!=="function"){return setTimeout(setup,500);}
  if(window.__kk_tab_hook){return;}
  window.__kk_tab_hook=true;
  function h(e){
    if(e.keyCode!==9||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey){return;}
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    try{ed.asc_AddText("\t");}catch(err){console.error("[KK tab-hook]",err);}
  }
  document.addEventListener("keydown",h,true);
  area.addEventListener("keydown",h,true);
  console.log("[KK tab-hook] installed (Tab -> \\t, no first-indent)");
}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",setup);}
else{setup();}
})();</script>
EOF

injected=0
not_found=0

for f in $(find "$DS_ROOT" -type f -path "*/documenteditor/main/index.html" 2>/dev/null); do
  # ลบ inject เก่า (ถ้ามี) — ให้ re-inject ตัวใหม่
  if grep -q "$MARKER" "$f" 2>/dev/null; then
    if command -v perl >/dev/null 2>&1; then
      perl -i -pe 's|<script>/\*'"$MARKER"'\*/[^<]*(?:<[^/][^<]*)*</script>||g' "$f"
    else
      sed -i "/${MARKER}/d" "$f"
    fi
    echo "[KK] tab-as-tabchar: removed old inject from $f"
  fi

  if ! grep -q "</head>" "$f" 2>/dev/null; then
    not_found=$((not_found+1))
    echo "[KK] tab-as-tabchar: no </head> in $f"
    continue
  fi

  # ใช้ awk แทน sed เพราะ TAG มี newlines (sed ไม่ชอบ multiline replacement)
  if awk -v tag="$TAG" '
    /<\/head>/ && !done { print tag; done=1 }
    { print }
  ' "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"; then
    injected=$((injected+1))
    echo "[KK] tab-as-tabchar injected: $f"

    # Regenerate .gz (nginx ใช้ gzip_static — ถ้า .gz เก่าอยู่จะ serve แทน .html)
    if [ -f "${f}.gz" ]; then
      if gzip -c -f "$f" > "${f}.gz" 2>/dev/null; then
        echo "[KK]   -> regenerated ${f}.gz"
      else
        echo "[KK]   ! failed to regenerate ${f}.gz"
      fi
    fi
  fi
done

echo "[KK] tab-as-tabchar: injected=$injected no-head=$not_found"
