#!/usr/bin/env bash
# Inject script ลงใน DocumentEditor index.html ของ OnlyOffice DS
# เพื่อเปลี่ยนสีของสัญลักษณ์ ¶ (pilcrow / paragraph mark — ตำแหน่งกด Enter)
# จากสีดำ (default) เป็นสีน้ำเงิน
#
# Background:
#   OnlyOffice วาด ¶ ลงบน canvas เอง + build 9.2.x ถูก minify แบบ Closure advanced
#   → ชื่อคลาส/เมธอดภายใน (CRunParagraphMark, Draw, m_oLogicDocument, Content ฯลฯ)
#     ถูกย่อหมด เกาะด้วยชื่อไม่ได้ และคลาส render ไม่ถูก export
#   → วิธี monkey-patch prototype (อ้างอิง branch master) ใช้กับเวอร์ชันนี้ไม่ได้
#
#   ทางที่ใช้ได้คือ Document Builder API (public macro API — ชื่อเมธอด "ไม่ถูกย่อ"
#   เพราะเป็น public surface สำหรับ plugin/macro จึงเสถียรข้ามเวอร์ชัน):
#     Asc.editor.GetDocument()
#       .GetElement(i).GetParagraphMarkTextPr().SetColor(r,g,b,isAuto)
#   เรียกแล้ว editor วาดใหม่ให้อัตโนมัติ
#
# ⚠️ ข้อแลกเปลี่ยนสำคัญ (ดู docs/PILCROW_COLOR.md):
#   - วิธีนี้แก้ที่ "ตัวเอกสาร" (document model) ไม่ใช่แค่ display
#     → สี ¶ จะ "ติดไปกับไฟล์ที่ save (.docx)" ด้วย และทำให้เอกสารกลายเป็น modified
#   - ครอบเฉพาะย่อหน้าระดับบนสุด — ¶ ภายในเซลล์ตาราง ยังไม่ถูกเปลี่ยน
#   - reapply ตอนกด Enter เพื่อให้ย่อหน้าใหม่เป็นน้ำเงินด้วย (debounce)
#
# วิธีเปลี่ยนสี: แก้ค่า R/G/B ใน KK_PILCROW_RGB ด้านล่าง (default น้ำเงิน 0,112,192)
#
# Idempotent: ใช้ marker /*kk-pilcrow-color*/ — รันซ้ำได้ ไม่ inject ซ้อน
set -uo pipefail

DS_ROOT="${DS_ROOT:-/var/www/onlyoffice/documentserver}"
MARKER="kk-pilcrow-color"

# สี ¶ (R,G,B) — default น้ำเงิน. แก้ตรงนี้ถ้าต้องการสีอื่น
KK_PILCROW_RGB="${KK_PILCROW_RGB:-0,112,192}"

# Script ที่จะ inject — ใส่ลง <head> ของ documenteditor/main/index.html
read -r -d '' TAG <<EOF
<script>/*${MARKER}*/(function(){
var RGB=[${KK_PILCROW_RGB}];
function sameColor(tpr){
  try{var c=tpr.GetColor&&tpr.GetColor();
    if(c&&c.GetR&&c.GetG&&c.GetB) return c.GetR()===RGB[0]&&c.GetG()===RGB[1]&&c.GetB()===RGB[2];
  }catch(e){}
  return false;
}
// applyAll: ครอบ try/catch ทั้งหมด -> ห้าม throw หลุดเด็ดขาด
// คืน -1 = ยังไม่พร้อม (ระหว่างเปิดเอกสาร GetDocument อาจ wrap null -> GetElementsCount throw)
// คืน >=0 = ทำสำเร็จ (จำนวน mark ที่เปลี่ยนสี)
function applyAll(){
  try{
    var ed=window.Asc&&window.Asc.editor;
    if(!ed||typeof ed.GetDocument!=="function") return -1;
    var d=ed.GetDocument();
    if(!d||typeof d.GetElementsCount!=="function") return -1;
    var n=d.GetElementsCount();
    if(!(n>=1)) return -1;
    var done=0;
    for(var i=0;i<n;i++){
      try{
        var el=d.GetElement(i);
        if(el&&typeof el.GetParagraphMarkTextPr==="function"){
          var tpr=el.GetParagraphMarkTextPr();
          if(tpr&&typeof tpr.SetColor==="function"&&!sameColor(tpr)){
            tpr.SetColor(RGB[0],RGB[1],RGB[2],false); done++;
          }
        }
      }catch(e){}
    }
    return done;
  }catch(e){ return -1; }
}
var tries=0, t=null;
function sched(){ if(t)clearTimeout(t); t=setTimeout(function(){ var x=applyAll(); if(x>0){try{console.log("[KK pilcrow] +"+x+" new mark(s)");}catch(e){}} },500); }
function init(){
  var r=applyAll();
  if(r<0){ if(tries++<120){return setTimeout(init,1000);} try{console.warn("[KK pilcrow] gave up waiting for document");}catch(e){} return; }
  try{console.log("[KK pilcrow] colored "+r+" paragraph mark(s) rgb("+RGB.join(",")+")");}catch(e){}
  // ย่อหน้าใหม่จากการกด Enter -> reapply (debounce, capture phase)
  try{document.addEventListener("keydown",function(e){ if(e.keyCode===13){ sched(); } },true);}catch(e){}
}
// หน่วง 1.5s ก่อนเริ่ม เพื่อให้ editor เปิดเอกสารเสร็จก่อน (กันชนช่วง open -> error -82)
setTimeout(init,1500);
})();</script>
EOF

injected=0
not_found=0

for f in $(find "$DS_ROOT" -type f -path "*/documenteditor/main/index.html" 2>/dev/null); do
  # ลบ inject เก่า (ถ้ามี) — ให้ re-inject ตัวใหม่
  # ใช้ perl -0777 (slurp ทั้งไฟล์) เพราะ <script> ที่ฝังมีหลายบรรทัด
  # ถ้าลบแบบทีละบรรทัดจะ match ไม่เจอ → inject ซ้อนสะสม
  if grep -q "$MARKER" "$f" 2>/dev/null; then
    if command -v perl >/dev/null 2>&1; then
      perl -0777 -i -pe 's|<script>/\*'"$MARKER"'\*/.*?</script>||sg' "$f"
    else
      sed -i "/${MARKER}/d" "$f"
    fi
    echo "[KK] pilcrow-color: removed old inject from $f"
  fi

  if ! grep -q "</head>" "$f" 2>/dev/null; then
    not_found=$((not_found+1))
    echo "[KK] pilcrow-color: no </head> in $f"
    continue
  fi

  # ใช้ awk แทน sed เพราะ TAG มี newlines (sed ไม่ชอบ multiline replacement)
  if awk -v tag="$TAG" '
    /<\/head>/ && !done { print tag; done=1 }
    { print }
  ' "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"; then
    injected=$((injected+1))
    echo "[KK] pilcrow-color injected: $f"

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

echo "[KK] pilcrow-color: injected=$injected no-head=$not_found"
