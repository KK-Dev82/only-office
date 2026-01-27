# Thai SpellChecker (OnlyOffice Plugin)

ปลั๊กอินตรวจคำภาษาไทยสำหรับ OnlyOffice โดยเรียก API ภายนอก (แนะนำให้ใช้ service `PythaiNLP-WordSuggestion` ที่อยู่ใน workspace นี้)

## วิธีใช้งาน

1. เปิดเอกสารใน OnlyOffice แล้วไปที่เมนู Plugins
2. เปิด **Thai SpellChecker**
3. ตั้งค่า **Spellcheck API URL**
   - ตัวอย่างตอนรัน service ที่เครื่องเดียวกัน: `http://localhost:8000`
4. เลือกโหมดตรวจ
   - **ตรวจเฉพาะข้อความที่เลือก**
   - **ตรวจประโยคปัจจุบัน**
   - **ตรวจกำลังย่อหน้าปัจจุบัน**
5. กด **ตรวจคำ**

## การแก้คำ

- คลิกเลือกคำแนะนำ (suggestion) เพื่อ “เลือกคำที่ต้องการใช้”
- กด **Replace next**: ไปยังคำถัดไปจากตำแหน่งเคอร์เซอร์แล้วแทนที่ 1 ครั้ง
- กด **Replace all**: แทนที่ทั้งเอกสาร (Undo ได้ด้วย Ctrl+Z)
- กด **Add word**: เพิ่มคำเข้า database ของ service (ลด false positive ครั้งถัดไป)

## API ที่ต้องมี

ปลั๊กอินเรียก:

- `POST /spellcheck` body: `{ "text": "..." }` → response: `{ "issues": [{ "word": "...", "suggestions": ["..."] }] }`
- `POST /add-words` body: `{ "words": ["คำ1","คำ2"] }`

