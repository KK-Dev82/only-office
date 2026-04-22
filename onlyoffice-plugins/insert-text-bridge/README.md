# insert-text-bridge

OnlyOffice Document Server plugin ที่เป็น **bridge** ให้ host app (senate-vite) สั่งให้ OnlyOffice editor แทรก/ผนวกข้อความได้โดยไม่ต้องใช้ clipboard API โดยตรง

## ใช้งานที่ไหน

- **S0204** (Detail document) — Transcription Upload Modal → กดปุ่ม "แทรกข้อความ" / "คัดลอกข้อความเต็ม" แล้ว paste
- **C0204** / **Other/O0114** — โฟลว์คล้ายกัน
- Host → Plugin สื่อสารผ่าน `postMessage` bus + `Asc.plugin.executeMethod` / `callCommand`

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `config.json` | plugin manifest (guid, name, permissions, guid) ที่ OnlyOffice DS โหลด |
| `index.html` | hidden iframe host ของ plugin — ไม่มี UI |
| `bus.js` | message bus — รับคำสั่งจาก host window (parent) เช่น `insertText`, `pasteText`, `appendToDocumentEnd` |
| `editor.js` | helper functions ที่เรียก OnlyOffice editor API (`executeMethod`, `callCommand`) — มี `addThaiWordBreaks`, `processPasteContent`, `insertText` ฯลฯ |
| `translations/` | i18n สำหรับ plugin label |

## Flow: Copy → Paste (Transcription)

```text
[TranscriptionModal] กด "คัดลอกข้อความเต็ม"
  → formatThaiForOnlyOfficeCopy()                  (senate-vite/src/utils/thaiPasteFormat.ts)
  → clipboard.write(text/plain + text/html)

[OnlyOffice Document] กด Ctrl+V
  → DocumentOffice paste handler
  → bus.js: pasteText({ text, html, thaiWordBoundary })
  → editor.js: processPasteContent() → insertText()
  → Asc.plugin.callCommand → แทรกเข้า document
```

## Feature Flag: `ZWSP_INSERT_ENABLED`

**Default: `false` (2026-04-22)** — ปิดการแทรก Zero-Width Space (U+200B) ระหว่างคำไทยในทุกโฟลว์

### เหตุผล

- ZWSP ไม่ช่วย line break ใน OnlyOffice DS จริงอย่างที่คาดไว้ (DS ใช้ space เป็น break point หลัก)
- ZWSP ที่ฝังในเอกสารจะแสดงเป็น **สี่เหลี่ยม □** เมื่อเปิด DOCX ใน MS Word (Show Formatting Marks หรือฟอนต์ไม่มี glyph)
- Export docx จาก S0204 → ผู้ใช้ปลายทางเปิดใน Word เห็นสี่เหลี่ยมเต็มไปหมด

### ที่ตั้ง flag (2 repo แยกกัน)

**Repo 1: senate-vite** — ประกาศที่เดียว (single source of truth) แล้ว import ไปใช้

| ไฟล์ | บทบาท |
|---|---|
| `senate-vite/src/utils/thaiPasteFormat.ts` | **Source of truth** — `export const ZWSP_INSERT_ENABLED = false` |
| `senate-vite/src/components/DocumentOffice/DocumentOffice.tsx` | Paste handler ทั่วไป — import flag |
| `senate-vite/src/components/DocumentV3/services/speech-to-text/thaiTokenizer.ts` | Live STT V3 tokenizer — import flag |

**Repo 2: only-office plugin** — flag ของตัวเอง (repo แยก sync ด้วยมือ)

| ไฟล์ | บทบาท |
|---|---|
| `only-office/onlyoffice-plugins/insert-text-bridge/editor.js` | `var ZWSP_INSERT_ENABLED = false` — ใช้ใน `addThaiWordBreaks()` |

> ⚠️ **สำคัญ**: senate-vite ทั้ง 3 ไฟล์ share flag เดียวผ่าน import — แก้ที่ `thaiPasteFormat.ts` จุดเดียว
> Plugin เป็น repo แยก ต้องแก้ให้ตรงกันด้วยมือ

### โฟลว์ที่ครอบคลุม (เมื่อ flag = false)

- ✅ **Transcription Copy → Document Paste** — ไม่มี ZWSP
- ✅ **Paste จากแหล่งอื่น** (Web/Word/Excel → OnlyOffice Document) — ไม่มี ZWSP
- ✅ **Live STT V3** (ไมโครโฟนพูดสด → Document) — ไม่มี ZWSP
- ✅ **Plugin insert-text-bridge** (host → OnlyOffice editor API) — ไม่มี ZWSP

### วิธีเปิดกลับ

1. เปลี่ยน `ZWSP_INSERT_ENABLED = true` ที่:
   - `senate-vite/src/utils/thaiPasteFormat.ts` (ครอบคลุม 3 ไฟล์ senate-vite)
   - `only-office/onlyoffice-plugins/insert-text-bridge/editor.js`
2. Rebuild senate-vite (Vite)
3. Restart OnlyOffice DS container (plugin เป็น static file, DS cache ไว้)
4. Hard refresh browser เพื่อให้ plugin iframe โหลดเวอร์ชันใหม่

### ฟังก์ชันอื่นที่ยังทำงานปกติ

- `addThaiWordBreaksWithSpace()` — ใส่ space ระหว่างคำ (ไม่ใช่ ZWSP) — ยังใช้ได้เมื่อ `thaiWordBoundary: "space"`
- `normalizeText()` — แทนที่ space ด้วย NBSP สำหรับ `insertText` ไทย
- `htmlToPlainText()` — แปลง HTML clipboard เป็น plain text
- `removeZWSP()` ใน thaiTokenizer.ts — util ลบ ZWSP (ใช้กับข้อความเก่าที่มี ZWSP ติดมา)

## การ Deploy

Plugin ถูก mount เข้า OnlyOffice DS container ผ่าน volume (ดู `only-office/docker-compose.yml`) — แก้ไฟล์แล้วต้อง **restart DS container** และ hard-refresh ฝั่ง editor iframe ให้ cache หมด
