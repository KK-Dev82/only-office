#!/usr/bin/env bash
# inject-thai-underline.sh
# ปรับตำแหน่งเส้นใต้ (underline) ใน OnlyOffice ให้ชิด baseline แบบ Word
# แทนค่า default ที่เผื่อระยะใต้สระล่างภาษาไทย (ทำให้เส้นตกต่ำผิดจาก Word)
#
# ===== พื้นหลังทางเทคนิค =====
# OnlyOffice คำนวณตำแหน่งเส้นใต้ = Baseline + (TextDescent ของทั้งบรรทัด * 0.4)
#   ต่างจากเส้นขีดฆ่าที่อิงขนาดฟอนต์ → บรรทัดที่มีสระล่าง (ุ ู) TextDescent โต
#   เส้นใต้เลยตกต่ำ. เราลดตัวคูณ 0.4 -> KK_UNDERLINE_FACTOR (default 0.1) ให้เส้นขึ้นชิด
#
# โค้ดที่วาดอยู่ในไฟล์ sdk-all.js (develop bundle, eager) ซึ่ง bootstrap sdk-all-min.js
#   โหลดให้อัตโนมัติ (tBj -> hb(".../sdkjs/word/sdk-all.js")). เราจึงแก้ sdk-all.js
#   ไฟล์เดียว ไม่ต้องแตะ app.js/loader. nginx เสิร์ฟ .gz (gzip_static) จึงต้อง regen .gz
#
# ⚠️ TOKEN เป็นชื่อที่ถูก minify เฉพาะ build นี้ (9.2.x): `.4*sd.O3` (sd.O3 = TextDescent)
#    ถ้าอัป OnlyOffice เวอร์ชันใหม่ ชื่ออาจเปลี่ยน -> สคริปต์จะ "เตือนแล้วข้าม" (editor
#    ยังทำงานปกติแบบ default) ให้ re-derive token ใหม่ตามวิธีใน docs/THAI_UNDERLINE.md
#
# รันทุก boot (ไฟล์ DS อยู่ใน image รีเซ็ตเมื่อ recreate) — idempotent, ปลอดภัยรันซ้ำ
set -uo pipefail

FACTOR="${KK_UNDERLINE_FACTOR:-0.1}"   # ตัวคูณ TextDescent ใหม่ (เดิม 0.4). เล็ก=ชิด baseline
DS="${DS_ROOT:-/var/www/onlyoffice/documentserver}"

echo "[KK] thai-underline: FACTOR=$FACTOR"

patch_one() {
  local f="$1"
  [ -f "$f" ] || return 0

  # already patched?
  if grep -q "${FACTOR}\*sd\.O3" "$f" 2>/dev/null; then
    echo "[KK] thai-underline: already patched -> $f"
    return 0
  fi
  # token present (stock)?
  if ! grep -q "\.4\*sd\.O3" "$f" 2>/dev/null; then
    echo "[KK] thai-underline: WARNING token '.4*sd.O3' NOT found in $f"
    echo "[KK]   -> DS version อาจเปลี่ยนชื่อ minify. ข้ามการ patch (editor ใช้ค่า default)."
    echo "[KK]   -> re-derive token ใหม่ตาม docs/THAI_UNDERLINE.md"
    return 0
  fi

  chmod u+w "$f" 2>/dev/null || true
  sed -i \
    -e "s/\.4\*sd\.O3/${FACTOR}*sd.O3/g" \
    -e "s/\.4\*this\.Vb\[kd\]\.Hh\.O3/${FACTOR}*this.Vb[kd].Hh.O3/g" \
    -e "s/\.4\*r\.Vb\[n\]\.Hh\.O3/${FACTOR}*r.Vb[n].Hh.O3/g" \
    "$f"

  local hit
  hit=$(grep -oc "${FACTOR}\*sd\.O3" "$f" 2>/dev/null || echo 0)
  if [ "$hit" != "1" ]; then
    echo "[KK] thai-underline: ERROR patch verify failed on $f (hit=$hit)"
    return 1
  fi
  # regen gzip (nginx gzip_static เสิร์ฟ .gz)
  if [ -f "$f.gz" ]; then
    chmod u+w "$f.gz" 2>/dev/null || true
    gzip -9 -c "$f" > "$f.gz"
  fi
  echo "[KK] thai-underline: patched -> $f (+.gz)"
}

# ไฟล์หลักที่ browser โหลด (nginx map versioned URL -> path นี้)
patch_one "$DS/sdkjs/word/sdk-all.js"

# เผื่อ build ที่มี sdk-all.js ใต้ versioned dir ด้วย (defensive)
for vdir in "$DS"/[0-9]*; do
  [ -d "$vdir" ] || continue
  patch_one "$vdir/sdkjs/word/sdk-all.js"
done

echo "[KK] thai-underline: done."
