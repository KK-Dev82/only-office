# SpellCheck TH+EN

Plugin ตรวจคำผิดภาษาไทยและอังกฤษ โดยใช้ **Custom Dict** (Dictionary API) + **Intl.Segmenter** — ไม่ใช้ PyThaiNLP

## สถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────────────┐
│  SpellCheck TH+EN (Client-side Plugin)                           │
│  1. Intl.Segmenter('th') แบ่งคำจากข้อความ                        │
│  2. โหลด Dictionary API: thai + english                          │
│  3. คำที่ไม่อยู่ใน dict = น่าจะผิด                                │
│  4. Fuzzy Match (Levenshtein) สำหรับ suggestions                │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│  Backend API                                                     │
│  - GET api/word-management/dictionary?language=thai              │
│  - GET api/word-management/dictionary?language=english           │
│  - POST api/word-management/spellcheck/add-words (เพิ่มคำ)        │
└─────────────────────────────────────────────────────────────────┘
```

## การทำงาน

### Client-only (ไม่ใช้ Server SpellChecker)

- **ไม่ใช้ PyThaiNLP** — ไม่ต้องเรียก PythaiNLP-WordSuggestion
- **Intl.Segmenter** — แบ่งคำ (รองรับภาษาไทยที่ไม่มีช่องว่าง)
- **Dictionary API** — ดึงคำจาก Database (thai + english) เป็น whitelist
- **คำที่ไม่อยู่ใน whitelist** = แสดงเป็นคำผิด + แนะนำจาก Fuzzy Match

### Server SpellChecker (OnlyOffice)

- OnlyOffice ใช้ Hunspell อยู่แล้ว — dict/th_TH และ dict/en_US
- ใช้สำหรับ underline แดงอัตโนมัติในเอกสาร
- Plugin นี้ทำงานแยก — เป็นเครื่องมือตรวจทานแบบ manual

## ความแตกต่างจาก thai-spellcheck

| ฟีเจอร์ | thai-spellcheck | SpellCheck TH+EN |
|--------|------------------|------------------|
| ภาษา | ไทยเท่านั้น | ไทย + อังกฤษ |
| Engine | PyThaiNLP (Backend) | Dictionary API + Intl.Segmenter |
| Custom Dict | Dictionary API (thai) | Dictionary API (thai + english) |
| การแบ่งคำ | PyThai | Intl.Segmenter |

## การติดตั้ง

1. Copy โฟลเดอร์ `spellcheck-then` ไปที่ plugins ของ OnlyOffice
2. ลงทะเบียน plugin ใน config ของ DocumentServer
3. ตรวจสอบว่า Backend มี Dictionary API ที่รองรับ `language=english`

## การใช้งาน

1. เลือกข้อความ (หรือเลือกโหมด: ประโยค/ย่อหน้า)
2. กด "ตรวจคำ"
3. ดูผลลัพธ์ — คลิกคำเพื่อไปที่ตำแหน่ง, เลือก suggestion เพื่อแทนที่

## หมายเหตุ

- **Intl.Segmenter** — ต้องใช้ browser ที่รองรับ (Chrome 87+, Safari 14.1+, Firefox 125+)
- **Dictionary API** — ต้องมีคำใน Database ก่อนใช้งาน (เพิ่มผ่าน M0106)
