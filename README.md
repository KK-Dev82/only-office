# onlyoffice-plugins

## Fonts (TH Sarabun New)

ใช้โฟลเดอร์ `THSarabunNew` (mount ใน docker-compose เป็น `/usr/share/fonts/truetype/th-sarabun`)

**เมื่อเปลี่ยนชุด font (เช่นจาก THSarabunITBold เป็น THSarabunNew):**
1. อัปเดต path ใน docker-compose เป็นโฟลเดอร์ font ใหม่ (ไม่ต้อง copy ไฟล์ — แค่ชี้ path)
2. Recreate container: `docker compose up -d --force-recreate` (หรือ `docker-compose up -d --force-recreate`) เพื่อให้ volume ใหม่มีผล
3. ถ้าฟอนต์ยังไม่ขึ้นใน editor: init script รัน `documentserver-generate-allfonts.sh` เฉพาะครั้งแรก (เมื่อไม่มี `.kk_init_done`) — ให้ลบ mark แล้ว restart หรือรันเอง:
   - ลบ mark: `docker exec <container> rm -f /var/www/onlyoffice/Data/.kk_init_done` แล้ว restart container
   - หรือรัน: `docker exec <container> /usr/bin/documentserver-generate-allfonts.sh` แล้ว restart DocumentServer

# เปิด example

```
docker exec de23317cd380 sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-example.conf
docker exec de23317cd380 supervisorctl reread
docker exec de23317cd380 supervisorctl update
docker exec de23317cd380 supervisorctl start ds:example
```

# เปิด admin panel

```
docker exec de23317cd380 sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-adminpanel.conf
docker exec de23317cd380 supervisorctl reread
docker exec de23317cd380 supervisorctl update
docker exec de23317cd380 supervisorctl start ds:adminpanel
```
