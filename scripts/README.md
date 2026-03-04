# Only Office Setup Scripts

Scripts สำหรับจัดการ Only Office DocumentServer (Plugins, Dictionary, Fonts)

## ⚠️ developer.docker-compose vs Scripts

| ใช้ | Scripts จำเป็นไหม |
|-----|-------------------|
| **`compose/developer.docker-compose.yml`** | **ไม่ต้อง** — มี init ในตัว (inline) ตอน container start แล้ว |
| **docker-compose.staging.yml / production** | ใช้ได้ — สำหรับ setup ที่ไม่มี inline init |

**Container name:** ใช้ `onlyoffice-documentserver` ทั้ง local และ server — scripts รองรับทั้งสองแบบ
- ถ้าไม่ระบุ container name: รัน auto-detect (onlyoffice-documentserver หรือ onlyoffice-docs-developer)

## 📁 ตำแหน่ง Scripts

Scripts อยู่ที่: `only-office/scripts/` (ไม่ใช่ onlyoffice-plugins/scripts)

## 📋 Scripts ที่มี

### 1. `setup-onlyoffice-server.sh`
Script สำหรับ setup Only Office Plugins, Dictionary และ Fonts หลังจาก container start แล้ว

**Usage:**
```bash
# รันจาก scripts directory (แนะนำ)
cd /path/to/only-office/scripts

# ใช้ได้ทั้ง local และ server — auto-detect container ถ้าไม่ระบุ
./setup-onlyoffice-server.sh
./setup-onlyoffice-server.sh onlyoffice-documentserver

# หรือระบุ only-office path
./setup-onlyoffice-server.sh onlyoffice-documentserver /path/to/only-office

# init-onlyoffice.sh: ใช้ได้เมื่อ script ถูก mount ที่ /opt/kk-init/ (developer.docker-compose ไม่ mount)
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
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
cd /path/to/only-office/scripts
./check-onlyoffice-status.sh                    # auto-detect container
./check-onlyoffice-status.sh onlyoffice-documentserver
```

**สิ่งที่ตรวจสอบ:**
- ✅ Dictionary files และ registry
- ✅ Custom Plugins
- ✅ GUID Directories (default plugins)
- ✅ License status

## 🚀 Quick Start

### Setup Only Office (ครั้งแรก) — สำหรับ docker-compose ที่ไม่มี inline init

```bash
# 1. ไปที่ scripts directory
cd /path/to/only-office/scripts

# 2. Setup Only Office (ใช้ container name ตาม docker-compose ของคุณ)
./setup-onlyoffice-server.sh onlyoffice-documentserver

# 3. Restart container เพื่อให้ plugins โหลด
docker-compose restart onlyoffice-documentserver

# 4. ตรวจสอบสถานะ
./check-onlyoffice-status.sh onlyoffice-documentserver
```

### ตรวจสอบสถานะ (ใช้ได้ทั้ง local และ server)

```bash
cd /path/to/only-office/scripts
./check-onlyoffice-status.sh   # auto-detect container
```

## 📝 หมายเหตุ

- **Disabled plugins:** `comment-bridge` และ `thai-spellcheck` ถูกปิดการโหลด (ไม่ copy เข้า container)
  - แก้ไขได้ที่ตัวแปร `PLUGINS_DISABLED` ใน `init-onlyoffice.sh` และ `setup-onlyoffice-server.sh`
- Scripts จะหา only-office root directory อัตโนมัติจากตำแหน่ง script
- ถ้า only-office directory อยู่ที่อื่น ให้ระบุ path เป็น parameter ที่ 2
- Scripts ใช้ `docker cp` และ `docker exec` เพื่อ copy files และตั้ง permission
- Fonts จะถูก copy ถ้าไม่ได้ mount ผ่าน volume

## 🔧 Troubleshooting

### ปัญหา: ใช้ developer.docker-compose แล้ว scripts ไม่ทำงาน / ไม่ต้องรัน

**สาเหตุ:** `compose/developer.docker-compose.yml` มี init logic ในตัว (inline ใน command) ตอน container start — ไม่ต้องใช้ scripts

**แก้ไข:** ไม่ต้องรัน setup scripts — แค่ `docker compose -f compose/developer.docker-compose.yml up` ก็พอ  
ถ้าต้องการตรวจสอบสถานะ: `./check-onlyoffice-status.sh` (auto-detect)

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
# Local (developer.docker-compose)
cd /path/to/only-office
docker compose -f compose/developer.docker-compose.yml up -d

# Server (staging/production)
docker compose up -d onlyoffice-documentserver
```

### หมายเหตุ: เปลี่ยน container name จาก onlyoffice-docs-developer

ตั้งแต่ใช้ container name เดียวกัน (`onlyoffice-documentserver`) ทั้ง local และ server — ถ้ามี container เก่า (`onlyoffice-docs-developer`) ให้ recreate:
```bash
docker compose -f compose/developer.docker-compose.yml down
docker compose -f compose/developer.docker-compose.yml up -d
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
