# Locale สำหรับ Document Editor (web-apps/apps/documenteditor/main/locale)

โฟลเดอร์นี้ถูก mount เข้า OnlyOffice container และถูก copy ไปยัง path ที่ serve ไฟล์ locale ตอนเริ่ม container เพื่อแก้ปัญหา **404** เมื่อเปิด Editor (ขอ `th.json` / `en.json` ไม่เจอ)

- **en.json** – ภาษาอังกฤษ (ใช้จาก [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps/tree/master/apps/documenteditor/main/locale) หรือ stub ขั้นต่ำ)
- **th.json** – ภาษาไทย (ถ้าไม่มีใน upstream ให้ copy จาก en.json หรือใช้ stub)

ถ้าต้องการ locale เต็มจาก OnlyOffice:

```bash
cd only-office/compose/locale
curl -sL -o en.json "https://raw.githubusercontent.com/ONLYOFFICE/web-apps/master/apps/documenteditor/main/locale/en.json"
# th.json อาจไม่มีใน repo หลัก — ใช้ en.json เป็นฐานหรือสร้างเอง
cp en.json th.json
```
