#!/usr/bin/env bash
# inject-nobreak-hyphen.sh
# ทำให้ขีดกลาง "-" ที่พิมพ์สด/วางในเอกสาร "ไม่เป็นจุดตัดบรรทัด"
#
# ===== ปัญหา =====
# ตามมาตรฐานตัดบรรทัดสากล (UAX #14) ขีดกลางคือ "จุดที่ตัดบรรทัดได้"
# เอกสารของสำนักงานฯ แปลงทุกเคาะเป็น NBSP ไปแล้ว + ตัววาดตัดคำไทยไม่ได้
#   → ขีดกลางกลายเป็นจุดตัดจุดเดียวที่เหลือทั้งบรรทัด
#   → เลขช่วง "๑-๕" ถูกหักเป็น "๑-" / "๕" คนละบรรทัดเสมอ
#
# ฝั่ง backend (ThaiNumeralPagePatcher) แก้ให้แล้วตอน "เปิดไฟล์" โดยแปลงเป็น
# <w:noBreakHyphen/> แต่ครอบไม่ถึงขีดที่ผู้ใช้ "พิมพ์สด" ในหน้าจอ — สคริปต์นี้ปิดช่องว่างนั้น
#
# ===== พื้นหลังทางเทคนิค =====
# ตัวอักษร 1 ตัวใน OnlyOffice = object ParaText มีธง "ตัดบรรทัดหลังตัวนี้ได้ไหม"
# ตั้งค่าตอนสร้าง object จากฟังก์ชันเดียว (UZg ใน build นี้):
#
#   e.prototype.UZg = function(){ return 45===this.ma||8212===this.ma ? !0 : ... }
#                                  ^^ 45 = "-"  → true = ตัดได้
#   e.prototype.iCd = function(d){ this.eh = d ? this.eh|8 : this.eh&-9 }   // เขียนธง
#   AscWord.Jjc = function(){ var d=new e(45); d.iCd(!1); return d }        // = Ctrl+Shift+ขีด
#
# กด Ctrl+Shift+ขีด กับอ่าน <w:noBreakHyphen/> จากไฟล์ เรียก AscWord.Jjc() ตัวเดียวกัน
# → ขีดห้ามตัดบรรทัด "คือ" ParaText(45) ที่ธงนี้เป็น false เท่านั้นเอง
# สคริปต์นี้จึงแค่ทำให้ 45 คืน false ตั้งแต่ต้นทาง → ขีดทุกตัวห้ามตัดบรรทัดโดยอัตโนมัติ
#   (ทั้งพิมพ์สด, วาง, และไฟล์ที่ยังไม่ผ่าน patcher) โดยไม่ต้องมี plugin คอยดักทีละ keystroke
#
# ต้อง patch 2 จุด เพราะธงนี้มี "ทางเข้า" 2 ทาง:
#   [1] UZg — ตอนสร้างตัวอักษรใหม่ (พิมพ์สด / วาง / อ่านจากไฟล์ docx)
#   [2] tc  — ตอนอ่านกลับจากรูปแบบภายในของ Document Server (แคชเอกสารที่เปิดค้าง + ประวัติแก้ไข)
#             จุดนี้ "อ่านธงที่เคยบันทึกไว้" มาทับ ไม่ได้คำนวณใหม่ → ถ้าไม่ patch ข้อความเดิม
#             ที่พิมพ์ไว้ก่อนหน้าจะยังตัดบรรทัดอยู่ แม้ patch [1] แล้วก็ตาม
#             (ยังต้องอ่านค่าจาก stream ตามเดิมเสมอ ไม่งั้นตำแหน่งอ่านเพี้ยนทั้งไฟล์)
#
# ผลข้างเคียงที่ตั้งใจ: ตอนเซฟ ตัวเขียนไฟล์เห็นธงนี้เป็น false จึงเขียนกลับเป็น
#   <w:noBreakHyphen/> ให้เอง → เปิดใน MS Word ก็ไม่ตัดเหมือนกัน (สอดคล้องกับฝั่ง backend)
# ขีดยาว "—" (em dash, 8212) คงเดิม = ยังตัดบรรทัดได้ตามปกติ
#
# โค้ดอยู่ในไฟล์ sdk-all.js (develop bundle) ซึ่ง sdk-all-min.js bootstrap โหลดให้เอง
#   → แก้ไฟล์เดียว ไม่ต้องแตะ app.js/loader. nginx เสิร์ฟ .gz (gzip_static) จึงต้อง regen .gz
#
# ⚠️ TOKEN เป็นชื่อที่ถูก minify เฉพาะ build นี้ (9.2.x): `45===this.ma||8212===this.ma?!0`
#    ถ้าอัป OnlyOffice เวอร์ชันใหม่ ชื่ออาจเปลี่ยน -> สคริปต์จะ "เตือนแล้วข้าม" (editor
#    ยังทำงานปกติแบบ default — ขีดที่มาจากไฟล์ยังไม่ตัดอยู่ เพราะ backend patch ให้แล้ว)
#    วิธี re-derive: grep หา `8212===` ใน sdk-all.js แล้วดูฟังก์ชันที่ constructor เรียกคู่กับ iCd
#
# ปิดการ patch ได้ด้วย KK_NOBREAK_HYPHEN_ENABLED=0
# รันทุก boot (ไฟล์ DS อยู่ใน image รีเซ็ตเมื่อ recreate) — idempotent, ปลอดภัยรันซ้ำ
set -uo pipefail

ENABLED="${KK_NOBREAK_HYPHEN_ENABLED:-1}"
DS="${DS_ROOT:-/var/www/onlyoffice/documentserver}"

# [1] ตอนสร้างตัวอักษรใหม่ — ของเดิม (stock): 45 หรือ 8212 -> ตัดบรรทัดได้
STOCK_NEW='45===this.ma||8212===this.ma?!0:'
# ของใหม่: 45 -> ห้ามตัด, 8212 -> เหมือนเดิม, นอกนั้นตกไปเงื่อนไขเดิมท้ายสุด
PATCHED_NEW='45===this.ma?!1:8212===this.ma?!0:'

# [2] ตอนอ่านกลับจากรูปแบบภายใน — ของเดิมเอาธงที่บันทึกไว้มาทับเสมอ
STOCK_READ='e.prototype.tc=function(d){this.FYf(d.Ya());this.iCd(d.fb())}'
# ของใหม่: ยังอ่านค่าจาก stream ทุกครั้ง (ห้ามข้าม) แต่ไม่เอามาทับถ้าเป็นขีดกลาง
PATCHED_READ='e.prototype.tc=function(d){this.FYf(d.Ya());var kkFlag=d.fb();45!==this.ma&&this.iCd(kkFlag)}'

if [ "$ENABLED" != "1" ]; then
  echo "[KK] nobreak-hyphen: disabled (KK_NOBREAK_HYPHEN_ENABLED=$ENABLED) — skip"
  exit 0
fi

echo "[KK] nobreak-hyphen: enabled"

# แทนที่ token แบบ literal 1 คู่ — คืน 0 = แก้แล้ว, 1 = ข้าม (patch ไปแล้ว/ไม่เจอ), 2 = error
replace_token() {
  local f="$1" label="$2" stock="$3" patched="$4"

  if grep -qF "$patched" "$f" 2>/dev/null; then
    echo "[KK] nobreak-hyphen: [$label] already patched"
    return 1
  fi
  if ! grep -qF "$stock" "$f" 2>/dev/null; then
    echo "[KK] nobreak-hyphen: [$label] WARNING token NOT found"
    echo "[KK]   -> DS version อาจเปลี่ยนชื่อ minify. ข้ามการ patch (editor ใช้ค่า default)."
    echo "[KK]   -> re-derive token ใหม่ตามหมายเหตุหัวไฟล์นี้"
    return 1
  fi

  local hits
  hits=$(grep -oF "$stock" "$f" | wc -l | tr -d ' ')
  if [ "$hits" != "1" ]; then
    echo "[KK] nobreak-hyphen: [$label] ERROR token พบ $hits จุด (คาดว่า 1) — ข้ามเพื่อความปลอดภัย"
    return 2
  fi

  # ใช้ python แทน sed: token มี | ? { } ที่ต้อง escape เยอะ เสี่ยงผิดพลาด — แทนที่แบบ literal ตรงๆ
  if ! python3 - "$f" "$stock" "$patched" <<'PY'
import sys
path, stock, patched = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8", errors="surrogateescape") as fh:
    s = fh.read()
if s.count(stock) != 1:
    sys.exit(2)
with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
    fh.write(s.replace(stock, patched))
PY
  then
    echo "[KK] nobreak-hyphen: [$label] ERROR replace failed"
    return 2
  fi

  if ! grep -qF "$patched" "$f" 2>/dev/null; then
    echo "[KK] nobreak-hyphen: [$label] ERROR patch verify failed"
    return 2
  fi

  echo "[KK] nobreak-hyphen: [$label] patched"
  return 0
}

patch_one() {
  local f="$1"
  [ -f "$f" ] || return 0

  chmod u+w "$f" 2>/dev/null || true

  local changed=0 rc
  replace_token "$f" "new-char" "$STOCK_NEW" "$PATCHED_NEW"; rc=$?
  [ "$rc" = "2" ] && return 1
  [ "$rc" = "0" ] && changed=1

  replace_token "$f" "read-back" "$STOCK_READ" "$PATCHED_READ"; rc=$?
  [ "$rc" = "2" ] && return 1
  [ "$rc" = "0" ] && changed=1

  if [ "$changed" = "0" ]; then
    echo "[KK] nobreak-hyphen: no change -> $f"
    return 0
  fi

  # regen gzip (nginx gzip_static เสิร์ฟ .gz)
  if [ -f "$f.gz" ]; then
    chmod u+w "$f.gz" 2>/dev/null || true
    gzip -9 -c "$f" > "$f.gz"
  fi
  echo "[KK] nobreak-hyphen: done -> $f (+.gz)"
}

# ไฟล์หลักที่ browser โหลด (nginx map versioned URL -> path นี้)
patch_one "$DS/sdkjs/word/sdk-all.js"

# เผื่อ build ที่มี sdk-all.js ใต้ versioned dir ด้วย (defensive)
for vdir in "$DS"/[0-9]*; do
  [ -d "$vdir" ] || continue
  patch_one "$vdir/sdkjs/word/sdk-all.js"
done

echo "[KK] nobreak-hyphen: done."
