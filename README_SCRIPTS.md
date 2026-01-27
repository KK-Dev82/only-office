# Only Office Setup Scripts

## 📁 โครงสร้าง Directory

```
only-office/
├── setup-onlyoffice.sh              # Wrapper script (เรียกจาก root)
├── check-onlyoffice-status.sh       # Wrapper script (เรียกจาก root)
├── onlyoffice-plugins/
│   └── scripts/
│       ├── setup-onlyoffice-server.sh  # Script จริง
│       ├── check-onlyoffice-status.sh  # Script จริง
│       └── README.md
├── dict/
│   └── th_TH/
├── THSarabunITBold/
└── ...
```

## 🚀 วิธีใช้งาน

### วิธีที่ 1: ใช้ Wrapper Scripts (แนะนำ)

```bash
# รันจาก only-office root directory
cd ~/deploy/only-office
./setup-onlyoffice.sh onlyoffice-documentserver
./check-onlyoffice-status.sh onlyoffice-documentserver
```

### วิธีที่ 2: ใช้ Scripts โดยตรง

```bash
# รันจาก scripts directory
cd ~/deploy/only-office/onlyoffice-plugins/scripts
./setup-onlyoffice-server.sh onlyoffice-documentserver
./check-onlyoffice-status.sh onlyoffice-documentserver
```

## 📦 การ Deploy Scripts ไปที่ Server

### วิธีที่ 1: Copy ทั้ง directory

```bash
# จาก local machine
scp -r only-office/onlyoffice-plugins/scripts user@server:~/deploy/only-office/onlyoffice-plugins/

# Copy wrapper scripts
scp only-office/setup-onlyoffice.sh user@server:~/deploy/only-office/
scp only-office/check-onlyoffice-status.sh user@server:~/deploy/only-office/

# ตั้ง permission
ssh user@server "chmod +x ~/deploy/only-office/*.sh ~/deploy/only-office/onlyoffice-plugins/scripts/*.sh"
```

### วิธีที่ 2: ใช้ Git (ถ้า only-office เป็น git repo)

```bash
# บน server
cd ~/deploy/only-office
git pull
chmod +x setup-onlyoffice.sh check-onlyoffice-status.sh
chmod +x onlyoffice-plugins/scripts/*.sh
```

## ✅ ตรวจสอบว่า Scripts พร้อมใช้งาน

```bash
# ตรวจสอบว่า scripts มีอยู่
ls -la ~/deploy/only-office/setup-onlyoffice.sh
ls -la ~/deploy/only-office/check-onlyoffice-status.sh
ls -la ~/deploy/only-office/onlyoffice-plugins/scripts/

# ทดสอบรัน script
cd ~/deploy/only-office
./setup-onlyoffice.sh onlyoffice-documentserver
```

## 🔧 Troubleshooting

### ปัญหา: Script ไม่พบ

```bash
# ตรวจสอบว่า scripts directory มีอยู่
ls -la ~/deploy/only-office/onlyoffice-plugins/scripts/

# ถ้าไม่มี ให้ copy ไป
mkdir -p ~/deploy/only-office/onlyoffice-plugins/scripts
# แล้ว copy scripts ไป
```

### ปัญหา: Permission denied

```bash
# ตั้ง permission
chmod +x ~/deploy/only-office/*.sh
chmod +x ~/deploy/only-office/onlyoffice-plugins/scripts/*.sh
```

## 📝 หมายเหตุ

- Wrapper scripts (`setup-onlyoffice.sh`, `check-onlyoffice-status.sh`) อยู่ที่ root ของ only-office
- Scripts จริงอยู่ที่ `onlyoffice-plugins/scripts/`
- Wrapper scripts จะหาและเรียก scripts จริงอัตโนมัติ
- Scripts จะหา only-office root directory อัตโนมัติจากตำแหน่ง script
