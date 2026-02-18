# วิธีตรวจสอบ OnlyOffice Document Server (Developer Edition) Trial เหลือกี่วัน

Developer Edition (DE) มีโหมด Trial ใช้ได้ประมาณ **30 วัน** หลังจากนั้นต้องใส่ไฟล์ `license.lic` เพื่อเปิดใช้งานเต็มรูปแบบ

## วิธีที่ 1: ผ่าน Command Service API (แนะนำ)

OnlyOffice รองรับคำสั่ง `license` ผ่าน Command Service จะคืนค่าวันหมดอายุและสถานะ Trial

1. **เปิดเอกสารใน Document Editor** (ต้องมีเอกสารเปิดอยู่)
2. ในเบราว์เซอร์เปิด **Developer Tools (F12)** → แท็บ **Console**
3. รันคำสั่ง (หรือเรียกจากแอปที่เชื่อมต่อกับ Document Editor):

```javascript
// ส่ง command ไปที่ Document Server
// (ในที่นี้ต้องเรียกผ่าน DocEditor API ที่แอปใช้อยู่)
// ตัวอย่างถ้ามีการเชื่อมต่อกับ editor:
// Asc.editor.executeCommand("license", null);
```

**จากฝั่ง backend / script** ถ้ามีการ integrate กับ Document Server API สามารถส่ง request ที่มี body เป็น:

```json
{"c":"license"}
```

Response จะมีรูปแบบประมาณนี้ (อ้างอิงจาก OnlyOffice API):

- **`license.end_date`** – วันที่หมดอายุ (ISO format เช่น `"2025-03-15T23:59:59.000Z"`)
- **`license.trial`** – `true` ถ้าเป็น Trial
- **`server.resultType`**:
  - **3** = license ใช้งานได้
  - **6** = Trial หมดอายุ
  - **2** = License หมดอายุ

จาก `license.end_date` นำมาคำนวณว่าเหลือกี่วันได้

## วิธีที่ 2: ดูจาก Admin / หน้าเว็บ

- หลังติดตั้ง DE แบบ Trial บางเวอร์ชันจะแสดงข้อความหรือ banner เกี่ยวกับ Trial/วันหมดอายุในหน้าแอดมินหรือหน้าแรกของ Document Server
- ดูที่ URL ของ Document Server (เช่น `http://your-server:8082`) ว่ามีข้อความเกี่ยวกับ license หรือไม่

## วิธีที่ 3: ตรวจสอบจาก Log ของ Document Server (Docker)

OnlyOffice จะ log ข้อความเตือนเมื่อ license ใกล้หมดอายุหรือหมดอายุแล้ว

```bash
docker exec -it onlyoffice-documentserver bash -lc "grep -Rni 'about to expire\\|expire on\\|License expired' /var/log/onlyoffice/documentserver/docservice/out.log* | tail -n 30"
```

ตัวอย่าง output เมื่อ license ใกล้หมดอายุ:

```
/var/log/onlyoffice/documentserver/docservice/out.log-20260217:12:[2026-02-17T03:23:18.557] [WARN] [localhost] [docId] [userId] nodeJS - Attention! Your license is about to expire on February 27, 2026.
```

### ตรวจสอบว่ามีไฟล์ license.lic หรือไม่

```bash
docker exec -it onlyoffice-documentserver bash -lc "ls -la /var/www/onlyoffice/Data 2>/dev/null; find /var/www/onlyoffice -maxdepth 3 -type f -iname '*license*' 2>/dev/null"
```

หมายเหตุ: โฟลเดอร์ `/var/www/onlyoffice/Data` คือที่เก็บ `license.lic` (ถ้ามี) ส่วนไฟล์ใน `/var/www/onlyoffice/documentserver/license/` เป็น license ของ third-party libraries (jQuery, Bootstrap ฯลฯ) ไม่ใช่ commercial license ของ OnlyOffice

## วิธีที่ 4: ใส่ license.lic (หลัง Trial หมด)

เมื่อ Trial หมดอายุ ให้วางไฟล์ **license.lic** ที่ได้รับจากการซื้อ:

- **Docker**: mount โฟลเดอร์ที่เก็บ `license.lic` เข้า container แล้ววางไฟล์ใน path ที่ OnlyOffice อ่าน เช่น  
  `/var/www/onlyoffice/Data/license.lic`  
  (ใน staging ใช้ volume `onlyoffice_data` → ต้อง copy ไฟล์เข้า volume หรือ mount โฟลเดอร์ที่มี license.lic)

ตัวอย่างการ copy เข้า container:

```bash
docker cp license.lic onlyoffice-documentserver:/var/www/onlyoffice/Data/license.lic
# หรือถ้าใช้ชื่อ container อื่น: onlyoffice-docs-developer
docker restart onlyoffice-documentserver
```

จากนั้น restart Document Server แล้วตรวจสอบอีกครั้งด้วย Command `license` หรือจาก UI ว่าสถานะเปลี่ยนเป็น licensed แล้ว

## สรุป

- **ตรวจว่า Trial เหลือกี่วัน**: ใช้ Command Service ส่ง `{"c":"license"}` แล้วดู `license.end_date` และ `license.trial`
- **ตรวจจาก log (Docker)**: `grep -Rni 'about to expire\|expire on\|License expired' /var/log/onlyoffice/documentserver/docservice/out.log*`
- **อ้างอิง**: [ONLYOFFICE API - license command](https://api.onlyoffice.com/editors/command/license), [Trial FAQ](https://guides.onlyoffice.com/faq/trial.aspx)
