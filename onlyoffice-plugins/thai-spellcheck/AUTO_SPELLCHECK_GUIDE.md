# แนวทางตรวจคำอัตโนมัติ + Highlight แบบ SpellChecker

เอกสารนี้อธิบายแนวทางให้มีการตรวจคำใน **Page / Paragraph ที่กำลังทำงานอัตโนมัติ** และมี **Highlight บอกคำผิด** แบบใกล้เคียง SpellChecker ในตัว

---

## 1. การตรวจอัตโนมัติ (Auto-check)

### 1.1 ใช้ Event `onSelectionChanged`

Plugin รองรับ event **`onSelectionChanged`** อยู่แล้ว (ใน `config.json` มี `"events": ["onSelectionChanged"]`)  
เมื่อเคอร์เซอร์หรือ selection เปลี่ยน จะเรียก `window.Asc.plugin.event_onSelectionChanged()`  

**แนวทาง:**

- ใน `event_onSelectionChanged` ใช้ **debounce** (หน่วง ~500–800 ms) เพื่อไม่ให้ยิง API ทุกครั้งที่กดพิมพ์
- หลัง debounce: ดึงข้อความตาม **โหมด** แล้วส่งไป spellcheck API

### 1.2 โหมดข้อความที่ใช้ได้ (มีอยู่แล้วใน plugin)

| โหมด        | API / วิธีดึงข้อความ | เหมาะกับ auto-check |
|------------|------------------------|----------------------|
| **paragraph** | `GetCurrentParagraph` หรือ callCommand + `doc.GetCurrentParagraph()` | ✅ แนะนำ – ตรวจย่อหน้าที่เคอร์เซอร์อยู่ |
| **sentence**  | `GetCurrentSentence`   | ✅ ได้ – ตรวจแค่ประโยคปัจจุบัน |
| **selection** | `GetSelectedText`      | ⚠️ ได้เมื่อมี selection; ถ้าไม่มี selection อาจได้ข้อความว่าง |

สำหรับ **ตรวจอัตโนมัติแบบ Built-in** แนะนำโหมด **paragraph** หรือ **sentence**  
(ใน plugin มี dropdown `tscMode`: selection / sentence / paragraph อยู่แล้ว)

### 1.3 การดึงข้อความ “ทั้งหน้าปัจจุบัน” (Current Page)

- ONLYOFFICE มี **`GetCurrentPage()`** บน Document – คืนค่าเป็น **เลขหน้า (index)**  
- ไม่มี API ส direct “ให้ข้อความทั้งหน้าที่มองเห็น” ใน plugin  
- **ทางเลือก:**
  - ใช้ **paragraph** = ย่อหน้าที่เคอร์เซอร์อยู่ (มักเป็นสิ่งที่ user กำลังพิมพ์)
  - หรือใช้ **GetContent** / **GetAllParagraphs** แล้วกรองด้วยหน้า (ถ้า Document API รองรับการ map paragraph → page) – ซับซ้อนกว่า

สรุป: สำหรับ “กำลังทำงานอัตโนมัติ” แนะนำ **ย่อหน้าปัจจุบัน (paragraph)** หรือ **ประโยคปัจจุบัน (sentence)** เป็นหลัก

---

## 2. Highlight บอกคำผิดแบบ SpellChecker

SpellChecker ในตัวมักแสดง **เส้นขีดใต้สีแดง (red wavy underline)** ที่คำผิด

### 2.1 แนวทางที่ทำได้ใน Plugin ปัจจุบัน

| แนวทาง | รายละเอียด | ข้อจำกัด |
|--------|------------|----------|
| **A) Highlight ใน Sidebar (รายการคำผิด)** | แสดงรายการคำผิดใน panel ด้านขวา + คลิกคำแล้ว **Jump ไปที่คำในเอกสาร** | ✅ ทำได้แล้ว (jumpToWord + รายการใน `tscResults`) |
| **B) Highlight ในเอกสาร (พื้นหลัง)** | ใช้ **`doc.GetRangeBySelect()`** (แทน `Api.GetSelection()`) หลัง SearchNext → ใส่ `SetFill` สีแดงอ่อนให้ range นั้น | ✅ ทำได้ใน callCommand ถ้า Document API รองรับ GetRangeBySelect + SetFill บน range |
| **B') ยกเลิก Highlight** | เมื่อกด **Replace** (เลือกคำที่ถูก) → เรียก `clearHighlightWord(suggestion)` ลบ fill ที่ตำแหน่งที่แทนที่ | ✅ ทำได้แล้ว |
| **B'') ยกเลิกเมื่อ Ignore (Add word)** | เมื่อกด **Add word** → เรียก `clearHighlightWord(word)` แล้วเอาคำนั้นออกจากรายการ | ✅ ทำได้แล้ว |
| **C) ใช้ Built-in Spell Check ของ ONLYOFFICE** | ถ้า editor มีโหมด custom dictionary / feed รายการคำผิดให้ built-in | ขึ้นกับว่า ONLYOFFICE Document Editor รองรับหรือไม่ (ต้องตรวจจากเอกสาร/เวอร์ชัน) |

### 2.2 สรุปการ Highlight ที่ทำได้จริง

- **Highlight ใน Sidebar (แบบ Built-in ด้านรายการ):**  
  - เปิด **ตรวจอัตโนมัติ (ย่อหน้า/ประโยค)** → ได้รายการคำผิดใน panel  
  - คลิกที่คำในรายการ → **Jump ไปที่คำนั้นในเอกสาร** (เหมือน “ไปที่ error ถัดไป”)  
  - พฤติกรรมใกล้เคียง SpellChecker ด้าน “บอกตำแหน่งคำผิด + เน้นที่รายการ”

- **Highlight ในเอกสาร (เส้นขีด/สีในข้อความ):**  
  - ปัจจุบันฟังก์ชัน `highlightWordInDocument()` ใช้ `Api.GetSelection()` ซึ่ง **ไม่มีใน plugin context**  
  - ถ้าอนาคต ONLYOFFICE เผย API แบบ “ให้ Range จากผล Search” หรือ “ใส่ underline/highlight ที่ range” ได้จาก plugin จะสามารถทำแบบเส้นขีดใต้ในเอกสารได้

---

## 3. สิ่งที่ implement ใน Plugin (สรุป)

1. **เปิดใช้ Auto-check แบบย่อหน้า/ประโยค**
   - ใน `event_onSelectionChanged`: ใช้ **debounce** แล้วเรียก logic เดียวกับปุ่ม “ตรวจคำ” แต่ใช้โหมด **paragraph** (หรือตามค่าจาก `tscMode`)
   - เก็บสถานะ “เปิด/ปิด ตรวจอัตโนมัติ” (เช่น checkbox) และเก็บใน `localStorage` ได้

2. **โหมดที่ใช้กับ Auto-check**
   - ค่าเริ่มต้นแนะนำ: **paragraph** (ย่อหน้าปัจจุบัน)  
   - ถ้าต้องการเบาๆ แค่ประโยคเดียวใช้ **sentence**

3. **Highlight แบบ Built-in ที่ทำได้ตอนนี้**
   - **Sidebar:** รายการคำผิด + คลิกแล้ว Jump ไปที่คำ (ทำแล้ว)
   - **ในเอกสาร:** ยังไม่มี API ที่ใช้ได้สำหรับใส่ wavy underline ใน plugin – ใช้การ Jump ไปที่คำเป็นหลัก

4. **Optional: Toggle เปิด/ปิด Auto-check**
   - เพิ่ม checkbox “ตรวจอัตโนมัติ (ย่อหน้าปัจจุบัน)” ใน UI  
   - อ่าน/เขียนค่าจาก `state` หรือ `localStorage` แล้วใน `event_onSelectionChanged` ถ้าปิดอยู่ก็ไม่ต้องเรียก spellcheck

---

## 4. อ้างอิง API ที่ใช้

- [ONLYOFFICE Plugin – How to call methods](https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/overview/how-to-call-methods/)
- [GetCurrentPage](https://api.onlyoffice.com/docs/office-api/usage-api/text-document-api/ApiDocument/Methods/GetCurrentPage/)
- [GetCurrentParagraph / GetContent](https://api.onlyoffice.com/docs/office-api/usage-api/text-document-api/ApiDocumentContent/) (ผ่าน executeMethod / callCommand)
- Event: `onSelectionChanged` ใน `config.json` → `event_onSelectionChanged` ใน code

---

## 5. Text Highlighter (onlyoffice.github.io) ที่นำมาใช้

Plugin **Text Highlighter** จาก [onlyoffice.github.io/sdkjs-plugins/content/texthighlighter](https://github.com/ONLYOFFICE/onlyoffice.github.io/tree/master/sdkjs-plugins/content/texthighlighter) ใช้ API ดังนี้:

- **ดึง range ปัจจุบัน:** `doc.GetRangeBySelect()`
- **ใส่ highlight:** สร้าง `Api.CreateTextPr()` → `textPr.SetHighlight(สี)` (เช่น `"red"`, `"yellow"`) → `range.SetTextPr(textPr)`
- **ลบ highlight:** `textPr.SetHighlight("none")` แล้ว `range.SetTextPr(textPr)`
- **ค้นหาหลายแห่ง:** `doc.Search(term, caseSens)` คืน array ของ range แล้ววน `result.SetTextPr(textPr)`

ใน thai-spellcheck ใช้แบบเดียวกัน: **SetTextPr + SetHighlight("red")** สำหรับคำผิด และ **SetHighlight("none")** เมื่อ Replace หรือ Ignore word (fallback ยังใช้ SetFill ถ้า SetHighlight ไม่มี)
