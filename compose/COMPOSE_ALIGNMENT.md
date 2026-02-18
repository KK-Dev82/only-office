# ความสอดคล้องของ Docker Compose (OnlyOffice)

อ้างอิงเวอร์ชันล่าสุด: **developer.docker-compose.yml**

## เปรียบเทียบ 3 ไฟล์

| รายการ | developer.docker-compose.yml | community.docker-compose.yml | FileService/docker-compose.staging.yml |
|--------|------------------------------|------------------------------|----------------------------------------|
| **ที่อยู่** | only-office/compose/ | only-office/compose/ | file-service/FileService/ (deploy repo) |
| **Image** | onlyoffice/documentserver-**de**:latest | onlyoffice/documentserver:latest (CE) | onlyoffice/documentserver-**de**:latest |
| **Plugins (รายการ)** | document-office, dictionary-abbreviation, speech-to-text, thai-spellcheck, thai-autocomplete, comment-bridge | เหมือน developer | เหมือน developer (ผ่าน init-onlyoffice.sh) |
| **Locale (th/en)** | มี (./locale → /opt/kk-locale-src) | มี (sync block เหมือน developer) | มี (./only-office/compose/locale) |
| **Dictionary th_TH** | bind mount + copy fallback | copy เท่านั้น | copy เท่านั้น (ผ่าน init-onlyoffice.sh) |
| **Init logic** | inline ใน command | inline ใน command | **external**: scripts/init-onlyoffice.sh |
| **Path ฐาน** | ../ (เทียบ compose/) | ../ (เทียบ compose/) | ./only-office/ (เทียบตำแหน่ง docker-compose บน server) |
| **Platform** | linux/arm64 (default) | linux/arm64 (default) | ไม่กำหนด |

## สิ่งที่ sync แล้ว

- **รายการ plugins**: ทั้ง 6 ตัว (document-office, dictionary-abbreviation, speech-to-text, thai-spellcheck, thai-autocomplete, comment-bridge) อยู่ใน chown/chmod และใน fallback find ของ developer และ community แล้ว
- **Locale**: community มี volume + sync block แบบเดียวกับ developer แล้ว
- **Staging**: ใช้ init-onlyoffice.sh ซึ่งมีครบทั้ง 6 plugins และ locale อยู่แล้ว

## Staging: อัปเดต Plugin (ไม่ต้อง Rebuild)

บน Staging **ไม่ต้อง rebuild image** OnlyOffice เพราะ plugins ใช้ **bind mount** จากโฟลเดอร์บน server:

- `./only-office/onlyoffice-plugins` → mount เข้า container เป็น `/opt/kk-plugins-src`
- ทุกครั้งที่ **container start** จะรัน `init-onlyoffice.sh` ซึ่ง **copy จาก /opt/kk-plugins-src ไป sdkjs-plugins** (ทับของเดิม)

**ขั้นตอนอัปเดต Plugin บน Staging:**

1. บน server (โฟลเดอร์ที่รัน docker-compose.staging.yml เช่น `~/deploy`): **`git pull`** เพื่ออัปเดต `./only-office/onlyoffice-plugins`
2. **Restart เฉพาะ OnlyOffice container**:  
   `docker restart onlyoffice-documentserver`  
   (หรือ `docker compose restart onlyoffice-documentserver` ถ้าใช้ compose v2)
3. ตอน container ขึ้นใหม่ init script จะ sync plugins จากโฟลเดอร์ที่ pull มาเข้า sdkjs-plugins ให้เอง

**ไม่ต้อง:** `docker compose build` / rebuild image — ใช้ image `onlyoffice/documentserver-de:latest` ตามเดิม

## หมายเหตุ

- **Staging** ใช้ path `./only-office/...` เพราะ docker-compose.staging.yml อยู่ที่โฟลเดอร์ deploy (เช่น ~/deploy) และมี only-office เป็น subfolder
- **Developer/Community** ใช้ path `../` เพราะรันจาก only-office/compose/
- ถ้าแก้ logic init (plugins/dict/locale) แนะนำให้แก้ที่ **developer.docker-compose.yml** ก่อน แล้วค่อย sync ไปที่ init-onlyoffice.sh (สำหรับ staging) และ community.docker-compose.yml
