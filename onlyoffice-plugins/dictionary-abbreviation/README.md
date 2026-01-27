# Dictionary & Abbreviation (ONLYOFFICE Plugin)

ปลั๊กอินนี้ทำ 2 อย่าง:

- **Dictionary**: แนะนำคำ/เติมคำผ่าน UI ของปลั๊กอิน (ผู้ใช้เลือกจาก panel)
- **Abbreviation**: ตรวจคำย่อและ “ขยายคำ” ตามกติกาที่กำหนด

> ไฟล์นี้คือ “ข้อบังคับ/ข้อจำกัด” ก่อนพัฒนาฟีเจอร์ detect เพิ่มเติม เพื่อไม่กลับไปเจอปัญหา UI เพี้ยน/ค้างเวอร์ชัน/จับคีย์ไม่ได้เหมือนที่ผ่านมา

---

## ข้อบังคับ (Hard constraints)

### 1) ห้ามพึ่ง “การจับคีย์จาก Editor” โดยตรง

ณ ตอนนี้ (อ้างอิงเอกสาร ONLYOFFICE ล่าสุดที่เราเช็ค) **ไม่มี Text Document API event ที่เป็น `onKeyDown/onKeyUp` สำหรับจับปุ่มที่กดใน editor โดยตรง**  
ดังนั้น feature ที่ต้อง “กดลูกศร/Enter/Esc ใน editor” เพื่อยืนยันคำแนะนำ **ทำไม่ได้แบบ native** (ยกเว้นผ่าน InputHelper หรือให้ผู้ใช้คลิกใน panel)

- **ทำได้**: จับ event ที่ editor ส่งให้ plugin ตามรายการ Events ที่รองรับ + InputHelper events (`onInputHelper*`)
- **ทำไม่ได้**: intercept keypress ใน editor (เช่น ArrowRight/Enter/Esc) แบบตรง ๆ

อ้างอิง:

- `Events (Text document API)`: `https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/text-document-api/Events/`
- `How to attach events`: `https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/overview/how-to-attach-events/`

> หมายเหตุ: ใน iframe ของ plugin เอง “จับคีย์ได้” (DOM keydown) แต่ **ไม่ใช่คีย์ที่ผู้ใช้พิมพ์ใน editor**

### 2) รูปแบบ plugin ต้องเป็น `panelRight` และ `isViewer=false`

เพื่อให้ host จัด layout/visibility ของ iframe เสถียรเหมือน `document-office`:

- `config.json` ต้องใช้ **`"type": "panelRight"`**
- `config.json` ต้องใช้ **`"isViewer": false`**

อ้างอิง:

- `Plugin types`: `https://api.onlyoffice.com/docs/plugin-and-macros/structure/configuration/types/`

### 3) ห้ามเปิด `ih=1` ใน URL ของ plugin entry

เคยพบว่า `index.html?ih=1...` ทำให้ host/SDK จัดการ iframe ต่างไปและเกิด “panel ว่าง/เพี้ยน” ได้ง่าย  
ดังนั้น `config.json -> variations[0].url` ต้องเป็นรูปแบบ:

- ✅ `index.html?v=<version>`
- ❌ `index.html?ih=1&v=<version>`

### 4) ต้อง sync version 3 จุดเสมอ (เพื่อ cache/JWT/DocEditor)

เพื่อกัน “แก้แล้วแต่ยังโหลดของเก่า”:

- `onlyoffice-plugins/dictionary-abbreviation/config.json` (`version` และ `url` query)
- `onlyoffice-plugins/dictionary-abbreviation/core/ns.js` (`DO.VERSION`)
- `senate-vite/src/components/DocumentOffice/pluginVersions.ts` (`DICT_ABBR_PLUGIN_VERSION`)

---

## พฤติกรรมปัจจุบัน (Current behavior)

### Abbreviation (คำย่อ)

- **โหมดปัจจุบัน**: เมื่อพิมพ์ “คำย่อครบ” (เช่น `สฝฝ`) → **แทนคำทันที** (auto replace)
- **ข้อสังเกต**: โหมดแบบ “lock แล้วให้เลือกด้วยคีย์ใน editor” ยังไม่น่าเชื่อถือ เพราะเราไม่สามารถจับคีย์จาก editor ได้โดยตรง

### Dictionary

- **ต้องมีการเลือกจาก Panel** (หรือ modal/window ของ plugin)  
เหตุผล: ONLYOFFICE ไม่ให้ plugin จับคีย์ใน editor เพื่อ “ยืนยัน/ยกเลิก” การเติมคำได้ตรง ๆ

แนวทาง UX ที่รองรับข้อจำกัด:

- แสดง “รายการคำแนะนำ” ใน panel แล้วผู้ใช้ **คลิกเลือก**
- หรือเปิด “Modal” ใน plugin (เหมือน `document-office` macros) แล้วให้ผู้ใช้เลือก/ยกเลิกใน modal
- การ “cancel” = ผู้ใช้พิมพ์ต่อไปตามปกติ (plugin ต้อง clear suggestion เมื่อ selection/paragraph เปลี่ยน)

---

## Events/Methods ที่ควรใช้ (Recommended API surface)

### Events (ต้องประกาศใน `config.json` และ attach)

ปลั๊กอินนี้ใช้ชุด event เพื่ออ่านสภาพแวดล้อม/การพิมพ์:

- `onTargetPositionChanged`
- `onDocumentContentChanged`
- `onSelectionChanged`
- `onChangeSelection`
- `onInputHelperInput`
- `onInputHelperClear`
- `onInputHelperItemClick`

อ้างอิง:

- `How to attach events`: `https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/overview/how-to-attach-events/`

> หมายเหตุ: `attachEditorEvent` ใช้ได้ตั้งแต่ ONLYOFFICE v8.2+

### Methods

การแก้เอกสารต้องทำผ่าน `executeMethod`/`callCommand` เท่านั้น (ห้ามแก้ DOM ของ editor)

อ้างอิงรวม:

- `Text document API Methods`: `https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/text-document-api/Methods/`

---

## LocalStorage (ข้อจำกัดและการออกแบบ)

### 1) LocalStorage อาจใช้ไม่ได้ใน iframe

บางสภาพแวดล้อม (iframe/cross-origin/private mode) อาจทำให้ `localStorage` โยน error ได้  
ดังนั้น:

- ต้องเช็ค `canUseLocalStorage()` ก่อน
- ถ้าใช้ไม่ได้ ให้ทำงานแบบ “in-memory defaults” และ UI ต้องยังแสดงได้

### 2) Prefix ห้ามชนกับ plugin อื่น

ใช้ key prefix ของตัวเอง:

- `da:v1:*`

---

## UI/Styles

### 1) ใช้ `plugins.css` เพื่อ UI ที่เข้ากับ ONLYOFFICE

อ้างอิง:

- `Plugin styles`: `https://api.onlyoffice.com/docs/plugin-and-macros/structure/styles/`

### 2) ต้องมี “layout lock” กัน host/SDK ซ่อน iframe

`core/styles.css` บังคับ `display/visibility/opacity` ของ `html, body` และให้ `.doRoot` fill panel ด้วย `position: fixed; inset: 0`

---

## หมายเหตุเรื่อง `translations/*`

SDK อาจโหลด `translations/langs.json` และ locale file (เช่น `th-TH.json`) อัตโนมัติ  
การมี/ไม่มี translations ไม่ใช่ “feature translate” ของเรา แต่เป็น pipeline ของ SDK/host ได้

---

## แนวทางพัฒนาต่อ (สำหรับ detect)

## Flow checklist (สเปคก่อนเริ่ม implement)

### A) Abbreviation — auto replace เมื่อ “ครบคำ”

เป้าหมาย: เมื่อพิมพ์คำย่อครบ (เช่น `สฝฝ`) ให้แทนเป็นคำเต็มทันทีแบบเสถียร

- **trigger**: รับ text จาก editor ผ่าน event/bridge ที่มีอยู่ (เช่น paragraph/token update) แล้วค่อย “คำนวณคำย่อที่ครบคำ”
- **detect rule (ขั้นต่ำ)**:
  - token ต้อง “จบคำ” (มี boundary) หรือเทียบ “ท้าย paragraph” แล้วตรง shortForm
  - ถ้ามีคำย่อซ้อน/คล้ายกัน ให้เลือก **longest match ก่อน** (เช่น `สสฝฝ` มาก่อน `สฝฝ`)
- **action**:
  - replace เฉพาะ token ล่าสุด/ช่วงที่เพิ่งพิมพ์ (หลีกเลี่ยง replace ทั้ง paragraph)
  - หลัง replace แล้ว **clear suggestion state** (ไม่ทิ้ง UI ค้าง)
- **cancel**:
  - ในโหมด auto: cancel ไม่มี (เพราะแทนทันที)
  - ถ้าจะมี confirm/cancel ให้ทำผ่าน panel/modal (ไม่ใช้ key ใน editor)

### B) Dictionary — ต้อง “ให้เลือก” ผ่าน Panel/Modal เท่านั้น

เป้าหมาย: เมื่อผู้ใช้พิมพ์ token ที่มีคำแนะนำ (เช่น `กรรม` → `กรรมาธิการ`, `กรรมการ`) ให้ผู้ใช้เลือกจาก UI

- **trigger**: detect token (จาก paragraph/token update) → query แหล่งคำ (localStorage/หรือ API)
- **render**:
  - แสดงรายการคำแนะนำใน panel (`#dictResults` / `#dictSavedList`) แบบ click ได้
  - ต้องมีปุ่ม/ทางเลือก “ยกเลิก” ชัดเจน (เช่น `x`/Cancel) เพราะเรา “จับ Esc ใน editor” ไม่ได้
- **confirm**:
  - ผู้ใช้ **คลิก item** ใน panel เพื่อ insert/replace
  - ถ้าต้องการ UX แบบ modal: ใช้ `Asc.PluginWindow().show(variation)` หรือ `executeMethod("ShowWindow", ...)`
    - ถ้าต้องดัน panel/modal ให้ขึ้นหน้า: ใช้ `executeMethod("ActivateWindow", [frameId])`
    - อ้างอิง: `Windows and panels` `https://api.onlyoffice.com/docs/plugin-and-macros/customization/windows-and-panels/`
- **cancel**:
  - ผู้ใช้พิมพ์ต่อ = ถือว่า cancel โดยนัย (plugin ต้อง clear suggestions เมื่อ token/selection เปลี่ยน)
  - หรือกดปุ่ม Cancel ใน panel/modal
- **key control**:
  - **ห้ามออกแบบให้ต้องกด Up/Down/Enter/Esc “ใน editor”** เพื่อเลือกคำแนะนำ (จับไม่ได้แบบ native)

### สรุป

- **Abbreviation**: auto replace เมื่อครบคำ = baseline ที่เสถียร (confirm/cancel ทำใน panel/modal)
- **Dictionary**: ต้องให้เลือกใน panel/modal เท่านั้น (ห้ามพึ่ง key ใน editor)
