# AutoFormat / AutoCorrect Override — Explanation

อธิบาย **ทำไมต้อง** บังคับตั้งค่า default ของ Document Editor (DE) ผ่านการ inject `<script>` + **กลไก** + **วิธีเพิ่ม setting**

> เอกสารนี้เก็บเฉพาะ "เหตุผล + กลไก + วิธีเพิ่ม setting ใหม่" — สำหรับ **วิธีติดตั้ง / verify / rollback** ดู [INSTALL.md](INSTALL.md)

ใช้ทำอะไรได้บ้าง:

- ปิด AutoCorrect ทุก feature (bullet/numbered/smart-quotes/hyphens/hyperlink/double-space/capitalize/math)
- ตั้ง default language (`app-settings-recent-langs`)
- ซ่อน right settings panel (`de-hide-right-settings`)
- ตั้งค่า DS preference อื่นที่ OnlyOffice เก็บใน `localStorage` (ตามรูปแบบ key/value ที่ OnlyOffice ใช้)

---

## ที่มา (ทำไมต้อง hack)

OnlyOffice DocsAPI ไม่เปิดให้ตั้ง default ของ AutoCorrect ผ่าน `editorConfig.customization` (ทีม OnlyOffice ยืนยันใน [community forum](https://forum.onlyoffice.com/t/set-default-spelling-language-and-turn-autocorrect-off/3151)) — ทำได้แค่ให้ user กด File → Advanced Settings → AutoCorrect Options เอง แต่ค่าจะ apply per user / per browser เท่านั้น

วิธี hack คือไป **inject JavaScript เข้าใน `index.html`** ของ Document Editor ที่ DS serve ออกมา ให้ทุก user ที่เปิด editor มี default ตามต้องการ — โดยไม่ต้องแตะ image หรือ build เอง

---

## ภาพรวมการทำงาน

```text
┌─────────────────────────────────────────────────────────────┐
│ DS Container start                                          │
│   ├─ init-onlyoffice.sh                                     │
│   │    ├─ sync dictionaries / plugins / locale              │
│   │    └─ run inject-autoformat-disable.sh   ← จุดที่ inject │
│   │         ├─ sed: เพิ่ม <script> ก่อน </head>             │
│   │         └─ gzip -c: regen index.html.gz                 │
│   └─ exec run-document-server.sh (start DS)                 │
└─────────────────────────────────────────────────────────────┘

Browser โหลด /web-apps/.../documenteditor/main/index.html
   ↓ (.gz ถูก serve จาก nginx gzip_static)
   <head>
     <script>/*kk-autoformat-disable*/...</script>  ← รันก่อน editor JS
     ...
   </head>
   ↓
   editor JS อ่าน localStorage → ค่าที่เราเซ็ตไว้ → AutoCorrect ปิด ✅
```

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| [`scripts/inject-autoformat-disable.sh`](../scripts/inject-autoformat-disable.sh) | logic หลัก — แก้ list keys ที่ override ที่นี่ที่เดียว |
| [`scripts/init-onlyoffice.sh`](../scripts/init-onlyoffice.sh) | init script ที่เรียก inject ตอน startup (production/local file-service compose) |
| [`scripts/restart-ds-dev.sh`](../scripts/restart-ds-dev.sh) | wrapper สำหรับ developer compose (recreate + exec inject) |
| [`compose/developer.docker-compose.yml`](../compose/developer.docker-compose.yml) | dev: ใช้ inline command + wrapper script |
| `file-service/FileService/docker-compose.yml` | production: entrypoint → init-onlyoffice.sh |
| `file-service/FileService/docker-compose.local.yml` | local: command → init-onlyoffice.sh |

---

## รายการ Settings ที่บังคับ (ปัจจุบัน 11 keys)

ดูในไฟล์ [`inject-autoformat-disable.sh`](../scripts/inject-autoformat-disable.sh) — array `SETTINGS`:

```bash
SETTINGS=(
  # AutoCorrect off (Tab "AutoFormat as you type")
  "de-settings-autoformat-bulleted=0"          # "- + space" → bullet
  "de-settings-autoformat-numbered=0"          # "1. + space" → numbered list
  "de-settings-autoformat-smart-quotes=0"      # " → smart quotes
  "de-settings-autoformat-hyphens=0"           # -- → dash
  "de-settings-autoformat-hyperlink=0"         # URL → hyperlink
  "de-settings-autoformat-double-space=0"      # space space → period

  # AutoCorrect off (Tab "Text AutoCorrect")
  "de-settings-letter-exception-sentence=0"    # capitalize first letter of sentence
  "de-settings-letter-exception-cells=0"       # capitalize first letter of table cells

  # AutoCorrect off (Tab "Math AutoCorrect")
  "de-settings-math-correct-replace-type=0"    # Replace text as you type (math)

  # Default language
  "app-settings-recent-langs=th-TH"            # ภาษาไทยเป็น default

  # UI defaults
  "de-hide-right-settings=1"                   # ซ่อน right-side settings panel
)
```

หลักการเขียน:

- รูปแบบ `"key=value"` ต่อ 1 line
- ค่า `"0"` = ปิด, `"1"` = เปิด (OnlyOffice ใช้ string `0/1` ไม่ใช่ `false/true`)
- ลบ line / ใส่ `#` ข้างหน้า = ไม่ override (ปล่อยให้ user เลือกเอง)
- script ทำ **force mode** = override ทุก page load (user override ไม่ได้)

หากอยากให้ user override ได้ เปลี่ยน `localStorage.setItem(_s[_i][0],_s[_i][1])` ใน `TAG` variable ของ script เป็น
`if(localStorage.getItem(_s[_i][0])===null)localStorage.setItem(_s[_i][0],_s[_i][1])`

---

## วิธีหา localStorage key name ของ OnlyOffice

ถ้าจะเพิ่ม setting ใหม่ ต้องรู้ key name ของ OnlyOffice ก่อน — มี 2 วิธี:

### วิธีที่ 1: ทดสอบใน browser (แนะนำ — แม่นยำสุด)

1. เปิดเอกสาร → DevTools (F12) → Application → Local Storage → ของ origin DS
2. ใน editor: เปิด dialog (เช่น File → Advanced Settings → ..) → toggle setting → กด Apply
3. กลับมา Local Storage → ดูว่า key อะไรเปลี่ยน/เพิ่มเข้ามา + ค่าเป็นอะไร
4. เอา key + value นั้นมาใส่ใน `SETTINGS` array

### วิธีที่ 2: Grep ใน DS source

```bash
docker exec onlyoffice-documentserver bash -c \
  'grep -rho "de-settings-[a-zA-Z0-9_-]*" /var/www/onlyoffice/documentserver/web-apps 2>/dev/null | sort -u'
```

หรือกรองเฉพาะหัวข้อ:

```bash
# autoformat-related
grep -rho "de-settings-[a-zA-Z0-9_-]*" .../web-apps | grep -i auto

# math-correct-related
grep -rho "de-settings-math[a-zA-Z0-9_-]*" .../web-apps | sort -u
```

ระวัง: key ที่ grep เจอบางตัวอาจไม่ตรงกับที่ใช้จริง (เช่น `de-settings-autoformat-fl-sentence` มีใน source แต่จริงๆ ใช้ `de-settings-letter-exception-sentence` แทน) — ใช้วิธีที่ 1 verify ดีกว่า

---

## ติดตั้ง / verify / rollback

ดู [INSTALL.md](INSTALL.md) — รวม steps ของทั้ง 3 environments (dev / local file-service / production)

---

## ข้อจำกัด / ข้อควรระวัง

- **ผูกกับ DS version** — ถ้า upgrade `onlyoffice/documentserver` ต้อง verify ว่าชื่อ key/format ยังเหมือนเดิม (ใช้วิธีหา key ด้านบน)
- **`gzip_static` ใน DS nginx** — ต้อง regen `.html.gz` หลัง sed ไม่งั้น browser โหลด `.gz` เก่าและไม่เห็น inject (script handle อยู่แล้ว แต่ถ้า image อนาคตเปลี่ยน path ต้องเช็ค)
- **Force mode** — user เปิด AutoCorrect ใน dialog แล้วกด Apply ค่าจะอยู่แค่ session เดียว page refresh = reset เป็น override
- **OnlyOffice เก็บ boolean เป็น `"0"`/`"1"`** ไม่ใช่ `"false"`/`"true"` — ระวังตอนเพิ่ม key ใหม่
- **Idempotent ผ่าน marker `/*kk-autoformat-disable*/`** — รันซ้ำได้ ถ้ามี inject อยู่จะถูก auto-remove แล้วใส่ใหม่
- **เปลี่ยน SETTINGS แล้วต้อง re-inject** — รัน wrapper หรือ recreate container อีกครั้ง

---

## รายชื่อปัญหาที่เจอตอนพัฒนา (lesson learned)

1. **OnlyOffice ใช้ `0`/`1` ไม่ใช่ `false`/`true`** — เซ็ต `false` แล้วไม่มีผล (เสียเวลา debug ไป 4-5 รอบ)
2. **`gzip_static on` ใน DS nginx** — แก้แค่ `.html` ไม่พอ ต้อง regen `.gz` ด้วย
3. **YAML inline `command:` ใน docker-compose ไม่เสถียร** — ใช้ external script file + mount แทนจะ debug ง่ายกว่า
4. **`docker compose restart` ไม่ re-apply `command:` ใน YAML** — ต้องใช้ `up -d --force-recreate`
5. **localStorage key ใน source code อาจไม่ตรงกับที่ใช้จริง** — verify ที่ browser แม่นกว่า grep
6. **sed regex `[^<]*` หยุดที่ `<` ใน `i<k.length`** — ใช้ Perl `-pe` หรือเขียน JS เลี่ยง `<` แทน

---

## ต้นกำเนิดการพัฒนา

- Thread พัฒนา: 2026-05-25 ถึง 2026-05-26
- Trigger: ลูกค้าเจอปัญหา "พิมพ์ `-` + space แล้ว Ruler ขยับเหมือน Increase Indent" (= AutoFormat bullet)
- Scope ขยาย: "ปิด AutoCorrect ทั้งหมด" + default language ไทย + ซ่อน right panel
- Approach ที่ลองและ pivot: plugin (timing ไม่ดี) → DS init script inject (วิธีปัจจุบัน)
