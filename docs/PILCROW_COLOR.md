# Pilcrow Color — Explanation

> ## STATUS 2026-06-09: ใช้ Builder API ต่อ (ยอมรับ tradeoff)
> ลองครบ 3 ทางแล้ว — display-only แท้ **ทำไม่ได้บน OnlyOffice 9.2.1 ตัวสำเร็จรูป**
> (monkey-patch: คลาสไม่ถูก export / engine sed-patch: ไม่มี anchor เพราะ minify ย่อหมด)
> ทีมจึง **ใช้ Builder API ต่อ** ทั้งที่มี side effect ที่ยืนยันแล้ว:
> **ข้อความที่พิมพ์ในย่อหน้าว่าง/ใหม่ จะกลายเป็นสีน้ำเงิน #0070C0** (paragraph-mark inheritance)
> - ทีม **จะแจ้ง tradeoff นี้กับ end-user เอง**
> - แผนถัดไป: **เปิดเรื่องขอฟีเจอร์ display-only กับ OnlyOffice**
> - ทางออก display-only แท้ที่เหลือทางเดียว = build sdkjs จาก source เอง (หนัก/ maintain สูง — ยังไม่ทำ)

อธิบาย **ทำไมต้อง** เปลี่ยนสีสัญลักษณ์ ¶ (pilcrow / paragraph mark — ตำแหน่งกด Enter) + **กลไกที่ใช้ได้จริงบน OnlyOffice 9.2.x** + **ข้อจำกัด/ความเสี่ยง**

> เอกสารนี้เก็บ "เหตุผล + กลไก + ข้อแลกเปลี่ยน" — สำหรับ **วิธีติดตั้ง / verify / rollback** ดู [INSTALL.md](INSTALL.md)

## ปัญหาที่แก้

OnlyOffice แสดง ¶ (เมื่อเปิด "แสดงตัวอักษรที่ไม่พิมพ์") เป็น **สีดำ** เท่ากับสีตัวอักษร แยกยากว่าตำแหน่งไหนคือ Enter จริง

Requirement: ให้ ¶ เป็น **สีน้ำเงิน** (RGB `0,112,192`) เพื่อให้เห็นตำแหน่งจบย่อหน้าชัดขึ้น โดยไม่กระทบสีตัวอักษร

## ทำไมต้อง patch — และทำไมวิธี "monkey-patch" ใช้ไม่ได้บน 9.2.x

- ¶ ถูกวาดลงบน canvas โดย rendering engine (sdkjs) เอง — ไม่ใช่ CSS/DOM, ไม่มี `customization`/localStorage/plugin API ให้ตั้งสี nonprinting marks
- เคยวางแผนใช้ **monkey-patch** `CRunParagraphMark.prototype.Draw` (อ้างอิง sdkjs branch master) — **ใช้กับ 9.2.x ไม่ได้** เพราะ:
  - build เป็น **Closure advanced minify** → ชื่อคลาส/เมธอด/property ภายในถูกย่อหมด
    (`AscWord` มี 276 keys เป็นชื่อแบบ `oqe,zA,bta...` อ่านไม่ออก)
  - คลาส render ของ ¶ **ไม่ถูก export** (`AscWord.CRunParagraphMark`, `ParaEnd`, `ParaRun` = ไม่มี)
  - แม้แต่ `WordControl`, `m_oLogicDocument`, `Content` ก็เป็นชื่อที่ถูกย่อ เกาะตรง ๆ ไม่ได้
  - (พิสูจน์ด้วย probe inject ที่ dump runtime — ดู Bug history)

## กลไกที่ใช้ได้จริง — Document Builder API

สิ่งที่ **ไม่ถูกย่อ** คือ **Document Builder / Macro API** (public surface สำหรับ plugin/macro) → เสถียรข้ามเวอร์ชัน ใช้ตั้งสี ¶ ได้:

```js
var ed  = window.Asc.editor;
var doc = ed.GetDocument();                       // ApiDocument
var n   = doc.GetElementsCount();
for (var i = 0; i < n; i++) {
  var el  = doc.GetElement(i);                     // ApiParagraph (ถ้าเป็นย่อหน้า)
  var tpr = el.GetParagraphMarkTextPr();           // ApiTextPr ของเครื่องหมาย ¶
  tpr.SetColor(0, 112, 192, false);                // (r,g,b,isAuto) -> น้ำเงิน
}
```

เรียกแล้ว editor **วาดใหม่ให้อัตโนมัติ** (ไม่ต้องสั่ง redraw เอง)

Deploy ผ่าน **Script Injection** เข้า `documenteditor/main/index.html` (รูปแบบเดียวกับ [TAB_OVERRIDE.md](TAB_OVERRIDE.md)):
- รอ `Asc.editor.GetDocument()` พร้อม (poll)
- `applyAll()` ตอนเปิดเอกสาร
- reapply (debounce) ตอนกด **Enter** เพื่อให้ย่อหน้าใหม่เป็นน้ำเงินด้วย
- `sameColor()` guard ข้ามย่อหน้าที่เป็นน้ำเงินอยู่แล้ว ลดการแก้ซ้ำ

## ⚠️ ข้อแลกเปลี่ยนสำคัญ (ต้องรู้ก่อน ship)

วิธีนี้แก้ที่ **document model** (ตัวเอกสารจริง) ไม่ใช่แค่ display layer — ต่างจาก Tab override ที่เป็น pure UI hook:

| ประเด็น | ผลกระทบ |
|---|---|
| **ติดไปกับไฟล์ที่ save** | สี ¶ น้ำเงินถูกเขียนลง `.docx` (รวมถึงเปิดด้วย Word ที่อื่นก็น้ำเงิน) — ไม่ใช่ "view-only aid" |
| **ทำให้เอกสาร modified** | การ SetColor ตอนเปิด = เกิด change → เอกสารกลายเป็น "มีการแก้ไข" / อาจไป autosave / กระทบ collaborative edit + undo history |
| **เฉพาะย่อหน้าระดับบนสุด** | ¶ ภายในเซลล์ **ตาราง** ยังไม่ถูกเปลี่ยน (iterate แค่ top-level elements) |
| **ย่อหน้าใหม่** | จัดการด้วย reapply ตอน Enter (debounce) — ถ้าแทรกย่อหน้าด้วยวิธีอื่นอาจหลุด |

> ถ้าต้องการ "display-only จริง ๆ ไม่แตะไฟล์" — ต้อง patch ไฟล์ engine `sdk-all.js` โดยตรง
> ซึ่งโค้ดถูกย่อหมด หา anchor ยากและเปราะมาก (ยังไม่ทำ) ดู Bug history

## วิธีเปลี่ยนสี

แก้ `KK_PILCROW_RGB` ใน `inject-pilcrow-color.sh` (default `0,112,192`) แล้ว run inject ใหม่ (ดู INSTALL.md)
หรือ override ตอน run: `KK_PILCROW_RGB="220,50,50" bash inject-pilcrow-color.sh`

## ความเสี่ยง / Maintenance

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| Builder API (`GetDocument`/`GetElement`/`GetParagraphMarkTextPr`/`SetColor`) | เป็น public API — เสถียรกว่า internal มาก แต่ก็ยัง undocumented บางส่วน | test หลัง DS upgrade — ดู console `[KK pilcrow] colored N paragraph mark(s)` |
| reapply ตอน Enter | ถ้า keyCode/โครงสร้างเปลี่ยน อาจไม่ทำงาน | log `[KK pilcrow] +N new mark(s)` |
| `</head>` regex inject | ถ้า HTML เปลี่ยน structure | script log `no </head>` |
| Service worker cache `index.html` | inject ใหม่แต่ browser โหลดเก่า | **ตัวร้ายที่สุดตอน dev** — ดู INSTALL.md "cache rollout" + หมายเหตุด้านล่าง |

### หมายเหตุ Service Worker (สำคัญตอน dev/test)

OnlyOffice มี service worker (`sdkjs/common/serviceworker/document_editor_service_worker.js`)
ที่ cache `index.html` แบบ cache-first → หลัง inject ใหม่ browser มักยัง serve ตัวเก่า
- ปิด incognito ทุกหน้าต่างก็ยังไม่พอบางครั้ง
- วิธีชัวร์: DevTools → Application → Service Workers → **Unregister** → Clear site data → reload
- **อย่า** แก้/neuter ตัว service worker เอง — เคยลองแล้ว **ทำ editor พัง** (โหลด locale ไม่ได้) ต้อง restore กลับ

## Bug history

### 2026-06-03: discovery + implementation

- เป้าหมาย: ¶ จากดำ → น้ำเงิน
- แผนแรก (monkey-patch `CRunParagraphMark.prototype.Draw` อ้างอิง master) **ล้มเหลว** — 9.2.x ย่อชื่อหมด + ไม่ export คลาส render
- ใช้ **probe inject** dump runtime: ยืนยัน `AscWord` 276 keys ถูกย่อ, คลาส ¶ เข้าถึงไม่ได้, แต่ **Builder API ชื่อไม่ถูกย่อ**
- พบ `ApiParagraph.GetParagraphMarkTextPr().SetColor(r,g,b,isAuto)` ทำงานได้ + วาดใหม่อัตโนมัติ (ทดสอบผ่าน console ใน frame `frameEditor`)
- เก็บเป็น inject script ถาวร (apply ตอนเปิด + reapply ตอน Enter)
- บั๊กที่เจอระหว่างทาง: removal regex แบบทีละบรรทัด match `<script>` หลายบรรทัดไม่ได้ → inject ซ้อนสะสม → แก้เป็น `perl -0777` (slurp ทั้งไฟล์)

### 2026-06-04: พยายามทำ display-only (ไม่แตะไฟล์) — สรุปว่าทำไม่ได้บน 9.2.1

- ต้องการเปลี่ยนเป็น "preview สีเฉย ๆ ไม่ให้ติดในไฟล์ .docx"
- ลอง hook คลาส paragraph ภายใน (`inner.GetParagraphMarkTextPr`) เพื่อ recolor เฉพาะตอนวาด — **ล้มเหลว**:
  - โครงสร้าง text-pr ซ้อนหลายชั้น ชื่อ field ย่อหมด (`s.cb` ctor `gg` มี ~34 fields, สีอยู่ใน field ที่ชื่อย่อ)
  - object ที่เข้าถึงได้คือ "ตัวจริงที่ผูกกับเอกสาร" + **ไม่มี `.Copy`** → แก้สี = เขียนกลับลงไฟล์อยู่ดี (ไม่ใช่ display-only)
  - method สั่งวาดใหม่ที่ถูกคือ `ed.put_ShowParaMarks(bool)` (ไม่ใช่ `asc_setShowParaMarks`) — แต่ไม่ช่วยเพราะ recolor โดยไม่เขียนกลับทำไม่ได้
- สรุป: display-only แท้ทำได้ทางเดียวคือ patch ไฟล์ engine `sdk-all.js` ตรง ๆ (เปราะ/ความพยายามสูง) — **ยังไม่ทำ**
- **การตัดสินใจ (ชั่วคราว):** ทีมเลือก **ยอมรับ Builder API** (สี ¶ ติดในไฟล์ + เอกสารกลายเป็น modified) แลกกับความเสถียร/ทำได้จริง

### 2026-06-09: Builder approach พบว่าทำข้อความเป็นน้ำเงิน → ปิดการใช้งาน

- **อาการ:** ข้อความที่พิมพ์กลายเป็นสีน้ำเงิน **#0070C0 (0,112,192)** — สีเดียวกับ pilcrow ที่เราตั้ง (ยืนยันด้วย Font color), เป็น "บางครั้ง"
- **สาเหตุ (root):** `tpr.SetColor()` บน paragraph mark = แก้ run-properties ของ ¶ → **ข้อความใหม่ที่พิมพ์ในย่อหน้านั้นสืบทอดสีมาด้วย** (paragraph-mark formatting inheritance)
  - "บางครั้ง" = เป็นเฉพาะตอนพิมพ์ในย่อหน้าว่าง/ย่อหน้าใหม่ (สืบทอดจาก ¶) ; พิมพ์แทรกกลางข้อความดำ → ไม่เป็น
  - ผลพลอยได้: #0070C0 ค้างเป็นสีล่าสุดในจานสี (Standard Color)
- **สรุป:** builder แก้ "การแสดงผล ¶" แยกจาก "สีข้อความ" ไม่ได้ — เลี่ยง side effect นี้ไม่ได้
- **การแก้:** ใส่ early-exit (`exit 0`) ที่ต้น `inject-pilcrow-color.sh` → ทุก caller (init 6.7 / dev compose / restart) skip ; ถอด inject ออกจาก container ที่รันอยู่ (`perl -0777 ... s|<script>/*kk-pilcrow-color*/...||`)
- **ทิศทางต่อไป:** display-only แท้ต้อง **patch ไฟล์ engine `sdk-all.js`** (เปลี่ยนวิธี "วาด" ¶ ไม่แตะ document model) — งานยาก/เปราะ (โค้ดถูก minify) แต่ไม่มี side effect กับข้อความ — กำลังดำเนินการ

## ติดตั้ง / verify / rollback

ดู [INSTALL.md](INSTALL.md)
