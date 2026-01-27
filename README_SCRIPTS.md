# Only Office Setup Scripts

## 📁 โครงสร้าง Directory

```
only-office/
├── scripts/
│   ├── setup-onlyoffice.sh              # Wrapper script (เรียก setup-onlyoffice-server.sh)
│   ├── setup-onlyoffice-server.sh       # Script จริงสำหรับ setup
│   ├── check-onlyoffice-status.sh       # Script สำหรับตรวจสอบสถานะ
│   └── README.md
├── dict/
│   └── th_TH/
├── onlyoffice-plugins/
├── THSarabunITBold/
└── ...
```

## 🚀 วิธีใช้งาน

### วิธีที่ 1: ใช้ Wrapper Script (แนะนำ)

```bash
# รันจาก scripts directory
cd ~/deploy/only-office/scripts
./setup-onlyoffice.sh onlyoffice-documentserver
./check-onlyoffice-status.sh onlyoffice-documentserver
```

### วิธีที่ 2: ใช้ Script โดยตรง

```bash
# รันจาก scripts directory
cd ~/deploy/only-office/scripts
./setup-onlyoffice-server.sh onlyoffice-documentserver
./check-onlyoffice-status.sh onlyoffice-documentserver
```

## 📦 การ Deploy Scripts ไปที่ Server

### วิธีที่ 1: Copy ทั้ง directory

```bash
# จาก local machine
scp -r only-office/scripts user@server:~/deploy/only-office/

# ตั้ง permission
ssh user@server "chmod +x ~/deploy/only-office/scripts/*.sh"
```

### วิธีที่ 2: ใช้ Git (ถ้า only-office เป็น git repo)

```bash
# บน server
cd ~/deploy/only-office
git pull
chmod +x scripts/*.sh
```

## ✅ ตรวจสอบว่า Scripts พร้อมใช้งาน

```bash
# ตรวจสอบว่า scripts มีอยู่
ls -la ~/deploy/only-office/scripts/

# ทดสอบรัน script
cd ~/deploy/only-office/scripts
./setup-onlyoffice.sh onlyoffice-documentserver
```

## 🔧 Troubleshooting

### ปัญหา: Script ไม่พบ

```bash
# ตรวจสอบว่า scripts directory มีอยู่
ls -la ~/deploy/only-office/scripts/

# ถ้าไม่มี ให้ copy ไป
mkdir -p ~/deploy/only-office/scripts
# แล้ว copy scripts ไป
```

### ปัญหา: Permission denied

```bash
# ตั้ง permission
chmod +x ~/deploy/only-office/scripts/*.sh
```

## 📝 หมายเหตุ

- Scripts ทั้งหมดอยู่ที่ `only-office/scripts/` directory
- `setup-onlyoffice.sh` เป็น wrapper ที่เรียก `setup-onlyoffice-server.sh`
- Scripts จะหา only-office root directory อัตโนมัติจากตำแหน่ง script (ขึ้นไป 1 level)
- สามารถรันได้จาก scripts directory โดยตรง
