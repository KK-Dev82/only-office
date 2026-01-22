## ONLYOFFICE Local (macOS) — Community / Developer

ชุดนี้มี `docker-compose` 2 แบบ:
- `community.docker-compose.yml` → `onlyoffice/documentserver` (Community)
- `developer.docker-compose.yml` → `onlyoffice/documentserver-de` (Developer)

รองรับทั้ง ARM64 (Mac mini M4) และ AMD64 (staging) ด้วย `DOCKER_PLATFORM`.

### สิ่งที่ติดตั้งอัตโนมัติใน container (ครั้งแรก)
- **Fonts**: `../THSarabunITBold` → `/usr/share/fonts/truetype/th-sarabun`
  - รัน `fc-cache` และ `/usr/bin/documentserver-generate-allfonts.sh`
- **Plugins**: `../onlyoffice-plugins` → copy เข้า `/var/www/onlyoffice/documentserver/sdkjs-plugins`
- **Thai Dictionary (Hunspell)**: `../dict/th_TH/*` → copy เข้า `/var/www/onlyoffice/documentserver/dictionaries/th_TH`
  - สร้าง `th_TH.json` (LCID 1054) ถ้ายังไม่มี
  - รัน `update.py` (best-effort)

> ทำงานแบบ idempotent โดยใช้ marker file: `/var/www/onlyoffice/Data/.kk_init_done`

### วิธีรัน (แนะนำ)
ไปที่โฟลเดอร์ `only-office/compose/`

1) คัดลอกไฟล์ตัวอย่าง env (ชื่อไฟล์นี้ไม่ใช่ `.env` เพื่อไม่ชน ignore ของเครื่องมือ)

```bash
cp env.example env.local
```

2) แก้ `env.local`
- `DOCKER_PLATFORM=linux/arm64` (Mac) หรือ `linux/amd64` (staging)
- `OO_HTTP_PORT=8082`
- `JWT_SECRET=...` (แนะนำให้ตั้งค่าถาวร)

3) รัน Community

```bash
docker compose --env-file env.local -f community.docker-compose.yml up -d
```

หรือรัน Developer

```bash
docker compose --env-file env.local -f developer.docker-compose.yml up -d
```

### ตรวจสอบ
- เปิด `http://localhost:8082` (หรือ port ที่ตั้ง)
- ใน editor เมนู **Plugins** ควรเห็นปลั๊กอินจาก `onlyoffice-plugins`

### หมายเหตุ
- ถ้าต้องการ re-init (เช่น เปลี่ยน fonts/dicts/plugins) ให้ลบ marker:

```bash
docker exec -it onlyoffice-docs-community bash -lc "rm -f /var/www/onlyoffice/Data/.kk_init_done"
docker restart onlyoffice-docs-community
```

ปรับชื่อ container ให้ตรง (community/developer)

