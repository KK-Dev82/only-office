# แนวทาง Version สำหรับ OnlyOffice Plugins (KK)

เพื่อให้การอัปเดตปลั๊กอินเป็นไปด้วยดี และตรวจสอบได้ว่า environment ใดรันเวอร์ชันใด

## กฎที่ใช้ร่วมกัน

1. **แหล่งความจริงเดียว: `config.json`**
   - ใช้ฟิลด์ `version` ในรูปแบบ **SemVer** เช่น `"0.1.71"`, `"0.3.5"`.
   - เมื่ออัปเดตปลั๊กอิน ให้แก้ **เฉพาะที่ config.json** แล้ว sync ไปที่อื่นตามด้านล่าง

2. **แสดง Version ใน UI**
   - **ในเมนู Plugins ของ OnlyOffice**: ใส่เลข version ใน `config.json` → `variations[0].description`  
     ตัวอย่าง: `"description": "Dictionary + Abbreviation (v0.1.71)"`  
     จะทำให้ในรายการ Plugins แสดงชื่อพร้อมเวอร์ชัน
   - **ในหน้า iframe ของปลั๊กอิน (ตัวเลือก)**: แสดงข้อความเล็กๆ เช่น `v0.1.71` ที่ header หรือ footer ของ panel (ใช้ค่าจาก `config.json` หรือ query string `?v=...`)

3. **Cache busting**
   - ใน `config.json` → `variations[0].url` ใช้ query string ให้ตรงกับ version:  
     `"url": "index.html?v=0.1.71"`
   - ใน `index.html` ทุก `<link>` และ `<script src>` ที่ชี้ไปที่ไฟล์ของปลั๊กอิน ให้ใส่ `?v=<version>` เดียวกับ config  
     ตัวอย่าง: `styles.css?v=0.1.71`, `core/ns.js?v=0.1.71`

4. **เมื่อออกเวอร์ชันใหม่**
   - อัปเดต `config.json`: `version`, `description` (ใส่ "(vX.Y.Z)"), `url` (ใส่ `?v=X.Y.Z`)
   - อัปเดตทุก asset ใน `index.html`: ใส่ `?v=X.Y.Z` ให้ตรงกับ version
   - (ถ้ามี) อัปเดตข้อความ version ใน header/footer ของปลั๊กอิน

## สรุป Plugin ปัจจุบัน

| Plugin | config.json version | หมายเหตุ |
|--------|----------------------|----------|
| comment-bridge | 0.0.2 | ใส่ใน description แล้ว |
| dictionary-abbreviation | 0.1.71 | ใส่ใน description แล้ว |
| document-office | 0.1.17 | ใส่ใน description แล้ว |
| speech-to-text | 0.3.5 | ใส่ใน description แล้ว |
| thai-spellcheck | 0.1.0 | ใส่ใน description แล้ว |
| thai-autocomplete | 0.0.1 | ใส่ใน description แล้ว |
