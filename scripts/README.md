# Only Office Setup Scripts

Scripts สำหรับจัดการ Only Office DocumentServer (Plugins, Dictionary, Fonts)

## 📁 ตำแหน่ง Scripts

Scripts อยู่ที่: `onlyoffice-plugins/scripts/`

## 📋 Scripts ที่มี

### 1. `setup-onlyoffice-server.sh`
Script สำหรับ setup Only Office Plugins, Dictionary และ Fonts หลังจาก container start แล้ว

**Usage:**
```bash
# รันจาก scripts directory (แนะนำ)
cd /path/to/only-office/onlyoffice-plugins/scripts
./setup-onlyoffice-server.sh onlyoffice-documentserver

# หรือระบุ only-office path
./setup-onlyoffice-server.sh onlyoffice-documentserver /path/to/only-office

# หรือใช้งานโดยตรงที่ Docker รัน sync ด้วยตัวเอง 
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
# เช็คว่า init script ถูก mount ไหม
docker exec onlyoffice-documentserver ls -la /opt/kk-init/
```

**สิ่งที่ทำ:**
- ✅ Copy Dictionary (Thai) เข้า container
- ✅ Update Dictionary Registry
- ✅ ลบ Default Plugins
- ✅ Copy Custom Plugins
- ✅ Setup Fonts (TH Sarabun)
- ✅ Rebuild Font Cache

### 2. `check-onlyoffice-status.sh`
Script สำหรับตรวจสอบสถานะ Only Office Plugins และ Dictionary

**Usage:**
```bash
cd /path/to/only-office/onlyoffice-plugins/scripts
./check-onlyoffice-status.sh onlyoffice-documentserver
```

**สิ่งที่ตรวจสอบ:**
- ✅ Dictionary files และ registry
- ✅ Custom Plugins
- ✅ GUID Directories (default plugins)
- ✅ License status

## 🚀 Quick Start

### Setup Only Office (ครั้งแรก)

```bash
# 1. ไปที่ scripts directory
cd /path/to/only-office/onlyoffice-plugins/scripts

# 2. Setup Only Office
./setup-onlyoffice-server.sh onlyoffice-documentserver

# 3. Restart container เพื่อให้ plugins โหลด
docker-compose restart onlyoffice-documentserver

# 4. ตรวจสอบสถานะ
./check-onlyoffice-status.sh onlyoffice-documentserver
```

### ตรวจสอบสถานะ

```bash
cd /path/to/only-office/onlyoffice-plugins/scripts
./check-onlyoffice-status.sh onlyoffice-documentserver
```

## 📝 หมายเหตุ

- **Disabled plugins:** `comment-bridge` และ `thai-spellcheck` ถูกปิดการโหลด (ไม่ copy เข้า container)
  - แก้ไขได้ที่ตัวแปร `PLUGINS_DISABLED` ใน `init-onlyoffice.sh` และ `setup-onlyoffice-server.sh`
- Scripts จะหา only-office root directory อัตโนมัติจากตำแหน่ง script
- ถ้า only-office directory อยู่ที่อื่น ให้ระบุ path เป็น parameter ที่ 2
- Scripts ใช้ `docker cp` และ `docker exec` เพื่อ copy files และตั้ง permission
- Fonts จะถูก copy ถ้าไม่ได้ mount ผ่าน volume

## 🔧 Troubleshooting

### ปัญหา: init-onlyoffice.sh รันบน host แล้ว error (fc-cache: command not found)

**สาเหตุ:** สคริปต์ `init-onlyoffice.sh` ออกแบบมาสำหรับรันภายใน container เท่านั้น

**แก้ไข:** ใช้คำสั่งนี้แทน
```bash
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh
# หรือ sync เฉพาะ (ไม่ start DocumentServer):
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
```

### ปัญหา: setup-onlyoffice-server.sh error "mounted volume is marked read-only"

**สาเหตุ:** Dictionary path และ/หรือ sdkjs-plugins เป็น read-only (bind mount :ro หรือ image read-only)

**แก้ไข:** ใช้ `docker-compose.staging.yml` ล่าสุดที่มี:
- `onlyoffice_plugins` volume สำหรับ sdkjs-plugins (writable)
- `onlyoffice-init-plugins` init container เพื่อ populate volume

จากนั้น recreate container:
```bash
docker compose -f docker-compose.staging.yml up -d --force-recreate onlyoffice-documentserver
```

### ปัญหา: Script หา only-office path ไม่เจอ

**แก้ไข:**
```bash
# ระบุ path เอง
./setup-onlyoffice-server.sh onlyoffice-documentserver /absolute/path/to/only-office
```

### ปัญหา: Container ไม่รัน

**แก้ไข:**
```bash
# เริ่ม container ก่อน
docker-compose up -d onlyoffice-documentserver
```

### ปัญหา: Fonts ไม่แสดง

**แก้ไข:**
```bash
# Rebuild font cache
docker exec onlyoffice-documentserver fc-cache -fv
docker exec onlyoffice-documentserver /usr/bin/documentserver-generate-allfonts.sh
```

## 📚 เอกสารเพิ่มเติม

- [Only Office Plugin Development](https://api.onlyoffice.com/plugin/basic)
- [Only Office Dictionary Integration](https://api.onlyoffice.com/editing/dictionaries)
