# OnlyOffice DocumentServer — Senate Setup

ชุดไฟล์สำหรับ deploy + customize OnlyOffice DocumentServer สำหรับระบบ Senate:

- Custom plugins (`onlyoffice-plugins/`) — spellcheck, dictionary, document-office, speech-to-text ฯลฯ
- Thai dictionary (`dict/`)
- Thai fonts (`THSarabun*`)
- License (`license/license.lic`)
- Setup scripts + bulk seed dictionary tool (`scripts/`)
- Docker compose: developer (local) + community (server) (`compose/`)

---

## Quick Start

### Local development (developer compose มี init logic ในตัว)

```bash
cd compose

# 1) Copy env template (ใช้ชื่อ env.local เพื่อไม่ชน .env ของ tools อื่น)
cp env.example env.local

# 2) แก้ env.local
#    DOCKER_PLATFORM=linux/arm64  (Mac M1/M4)  หรือ  linux/amd64  (server)
#    OO_HTTP_PORT=8082
#    JWT_SECRET=<random-secret>

# 3) รัน Developer variant (มี init logic ในตัว)
docker compose --env-file env.local -f developer.docker-compose.yml up -d

# หรือ Community variant
docker compose --env-file env.local -f community.docker-compose.yml up -d

# 4) เปิดทดสอบที่ http://localhost:8082
```

**สิ่งที่ติดตั้งอัตโนมัติครั้งแรก** (idempotent via marker `/var/www/onlyoffice/Data/.kk_init_done`):

- Fonts: `../THSarabunPSK` → `/usr/share/fonts/truetype/th-sarabun` + `fc-cache` + `documentserver-generate-allfonts.sh`
- Plugins: `../onlyoffice-plugins` → `/var/www/onlyoffice/documentserver/sdkjs-plugins`
- Thai dictionary (Hunspell): `../dict/th_TH/*` → `/var/www/onlyoffice/documentserver/dictionaries/th_TH` + สร้าง `th_TH.json` (LCID 1054) + รัน `update.py` (best-effort)

**Re-init** (เปลี่ยน fonts/dicts/plugins แล้วต้องการให้ container apply ใหม่):

```bash
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose --env-file env.local -f developer.docker-compose.yml restart
```

### Server deploy

```bash
docker compose up -d onlyoffice-documentserver

# Setup plugins + dictionary + fonts (ถ้า compose ไม่มี inline init)
cd scripts
./setup-onlyoffice-server.sh

# ตรวจสอบสถานะ
./check-onlyoffice-status.sh
```

---

## Folder Structure

```
only-office/
├── README.md                           # คุณกำลังอ่านอยู่
├── compose/
│   ├── developer.docker-compose.yml   # Local dev (มี inline init)
│   ├── community.docker-compose.yml   # Community variant
│   ├── env.example                    # Template สำหรับ .env
│   └── local.json                     # OnlyOffice local config override
├── onlyoffice-plugins/                # 7 custom plugins
│   ├── document-office/
│   ├── dictionary-abbreviation/
│   ├── speech-to-text/
│   ├── spellcheck-then-v2/            # Spellcheck (v2 — production)
│   ├── thai-autocomplete/
│   ├── thai-nbsp-space/
│   ├── insert-text-bridge/
│   └── comment-bridge/                # disabled by default
├── dict/                              # Thai spellcheck dictionary
├── THSarabunIT/, THSarabunNew-13/,
├── THSarabunNew-135/, THSarabunPSK/   # Thai fonts
├── license/license.lic
├── example/files/sample.docx          # Test document
└── scripts/
    ├── setup-onlyoffice.sh            # Wrapper → setup-onlyoffice-server.sh
    ├── setup-onlyoffice-server.sh     # Setup plugins + dict + fonts
    ├── init-onlyoffice.sh             # Container-side init (mounted at /opt/kk-init/)
    ├── check-onlyoffice-status.sh     # Verify plugins + dict + license
    ├── seed-dictionary.js             # Bulk seed words via backend API
    ├── seed-words.json                # Word list ที่จะ seed
    └── generate-words-json.js         # Helper สำหรับ format seed-words.json
```

---

## Fonts

ปัจจุบันใช้โฟลเดอร์ `THSarabunPSK` (mount ใน docker-compose เป็น `/usr/share/fonts/truetype/th-sarabun`)

> **หมายเหตุ:** Frontend (senate-vite) ใช้ font-family `THSarabunNew` — config อยู่ที่ `senate-vite/src/config/fonts.ts` และ `senate-vite/src/styles/_variables.scss`

**เปลี่ยนชุด font (เช่นจาก PSK เป็น THSarabunNew):**

1. อัปเดต path ใน docker-compose เป็นโฟลเดอร์ font ใหม่ (ไม่ต้อง copy ไฟล์ — แค่ชี้ path)
2. Recreate container: `docker compose up -d --force-recreate`
3. ถ้าฟอนต์ยังไม่ขึ้น — init script รัน `documentserver-generate-allfonts.sh` เฉพาะครั้งแรก (เช็คจาก `.kk_init_done`):
   ```bash
   docker exec <container> rm -f /var/www/onlyoffice/Data/.kk_init_done
   docker compose restart onlyoffice-documentserver
   # หรือรันเองตรงๆ
   docker exec <container> /usr/bin/documentserver-generate-allfonts.sh
   ```

---

## Setup Scripts

### 1. `setup-onlyoffice-server.sh`

Setup plugins, dictionary, fonts หลัง container start

```bash
cd /path/to/only-office/scripts

# Auto-detect container
./setup-onlyoffice-server.sh

# ระบุ container name
./setup-onlyoffice-server.sh onlyoffice-documentserver

# ระบุ only-office root path ด้วย
./setup-onlyoffice-server.sh onlyoffice-documentserver /path/to/only-office
```

สิ่งที่ทำ:
- Copy Thai dictionary → container + update registry
- ลบ default plugins + copy custom plugins
- Copy fonts (ถ้าไม่ได้ mount ผ่าน volume) + rebuild font cache

### 2. `init-onlyoffice.sh` (container-side)

ใช้เมื่อ script ถูก mount ที่ `/opt/kk-init/` ภายใน container (developer.docker-compose ไม่ mount):

```bash
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh

# Sync เฉพาะ (ไม่ start DocumentServer)
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
```

### 3. `check-onlyoffice-status.sh`

ตรวจสอบ plugins + dictionary + license:

```bash
cd scripts
./check-onlyoffice-status.sh                          # auto-detect
./check-onlyoffice-status.sh onlyoffice-documentserver
```

### 4. Inject scripts — override editor behavior

ทั้งคู่ inject `<script>` ลง `index.html` ของ DS ตอน startup (เรียกอัตโนมัติจาก `init-onlyoffice.sh`)

- **`inject-autoformat-disable.sh`** — override `localStorage` ปิด AutoCorrect / ตั้ง default language / ซ่อน right panel
  - คำอธิบาย + วิธีหา localStorage key: [`docs/AUTOFORMAT_DISABLE.md`](docs/AUTOFORMAT_DISABLE.md)
- **`inject-tab-as-tabchar.sh`** — บังคับให้ Tab key แทรก `\t` เสมอ (ไม่ปรับ first-line indent)
  - คำอธิบาย + ความเสี่ยง: [`docs/TAB_OVERRIDE.md`](docs/TAB_OVERRIDE.md)

`restart-ds-dev.sh` — wrapper สำหรับ `developer.docker-compose.yml` (recreate + exec inject ทั้ง 2 ตัว)

**👉 วิธีติดตั้ง/อัปเดต/verify/rollback ทั้งหมด: [`docs/INSTALL.md`](docs/INSTALL.md)**

### Disabled plugins

`comment-bridge` และ `thai-spellcheck` ถูกปิดการโหลด (ไม่ copy เข้า container)
- แก้ได้ที่ตัวแปร `PLUGINS_DISABLED` ใน `init-onlyoffice.sh` และ `setup-onlyoffice-server.sh`

---

## Locale (`compose/locale/`)

โฟลเดอร์ `compose/locale/` ถูก mount เข้า container + copy ไปยัง path ที่ serve locale files ตอน start
เพื่อแก้ปัญหา **404** เมื่อเปิด Editor (ขอ `th.json` / `en.json` ไม่เจอ):

- `en.json` — ภาษาอังกฤษ (จาก [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps/tree/master/apps/documenteditor/main/locale) หรือ stub ขั้นต่ำ)
- `th.json` — ภาษาไทย (ถ้าไม่มีใน upstream → copy จาก en.json หรือสร้างเอง)

ถ้าต้องการ locale เต็มจาก OnlyOffice upstream:

```bash
cd compose/locale
curl -sL -o en.json "https://raw.githubusercontent.com/ONLYOFFICE/web-apps/master/apps/documenteditor/main/locale/en.json"
cp en.json th.json  # ใช้ en.json เป็นฐานสำหรับ th
```

---

## Supervisor — เปิด built-in example + admin panel

(สำหรับ debug หรือ verify config)

```bash
CONTAINER=onlyoffice-documentserver

# เปิด example UI
docker exec $CONTAINER sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-example.conf
docker exec $CONTAINER supervisorctl reread
docker exec $CONTAINER supervisorctl update
docker exec $CONTAINER supervisorctl start ds:example

# เปิด admin panel
docker exec $CONTAINER sed -i 's/autostart=false/autostart=true/' /etc/supervisor/conf.d/ds-adminpanel.conf
docker exec $CONTAINER supervisorctl reread
docker exec $CONTAINER supervisorctl update
docker exec $CONTAINER supervisorctl start ds:adminpanel
```

---

## Bulk Seed Dictionary

`scripts/seed-dictionary.js` ใช้ส่งคำเข้า Spellcheck Dictionary (Global scope) ผ่าน backend API

ใช้ endpoint `POST /api/word-management/spellcheck/add-words`:

- Persist คำเข้า `WordEntry` + `DictionaryWord` (Type=Dictionary, Scope=Global)
- Auto-detect language ต่อคำ (มีอักษรไทย → `thai`, Latin only → `english`)
- Skip duplicates (return ใน `skipped[]`)
- Sync ไป PyThaiNLP สำหรับคำใหม่

### Usage

```bash
cd scripts

# 1) Dry-run ก่อน (แนะนำ — ไม่ POST จริง)
node seed-dictionary.js --server http://localhost:5000 --file seed-words.json --dry-run

# 2) Run จริง
node seed-dictionary.js --server http://localhost:5000 --file seed-words.json

# ปรับ batch size (default 200)
node seed-dictionary.js --server <url> --file <words.json> --batch 50
```

ผลลัพธ์:

```
=== Summary ===
Requested:  99
Added:      87
Skipped:    12  (already in dict)
Failed:     0
```

### Format ของ `seed-words.json`

**แบบ grouped** (แนะนำ — comment-friendly):

```json
{
  "groups": [
    { "name": "ตัวย่อหน่วยงาน", "words": ["กกต", "คสช", "สส"] },
    { "name": "ชื่อบุคคล", "words": ["ภิญญดา", "ปัณณิตา"] }
  ]
}
```

**แบบ flat array**: `["กกต", "คสช", "DSI"]`

**แบบ object**: `{ "words": ["กกต", "คสช"] }`

Script จะ flatten + dedupe (case-insensitive) อัตโนมัติ

### Backend behavior (สำคัญ)

- ใช้ `DictionaryWordExistsAsync` check ก่อน insert
- คำที่อยู่ใน Global scope แล้ว → return ใน `skipped[]`
- **ไม่ overwrite** Phonetic / EnglishWord / FullWord / Variants ที่ M0106 ใส่ไว้
- Personal scope ของ user ไม่ถูกแตะ

| Input | Detected language |
|---|---|
| `"ภิญญดา"` | `thai` |
| `"DSI"` | `english` |
| `"คอมพิวเตอร์"` | `thai` (TH+Latin → primary thai) |
| `"123"` | `thai` (fallback) |

ถ้าต้องการ force language → ส่ง `language: "thai"` หรือ `"english"` ใน request body

### Workflow แนะนำ (production deploy)

1. Backup DB: `./postgresSQL/backup.sh`
2. Dry-run บน staging: `node seed-dictionary.js --server https://staging.example.com --file seed-words.json --dry-run`
3. Run บน staging แล้ว verify ผ่าน M0106 UI หรือ plugin v2
4. Run บน production

### Exit codes

- `0` — ทุก batch สำเร็จ (added หรือ skipped เท่านั้น)
- `1` — File error / parsing error
- `2` — Some words failed to insert (ดูใน `--- Failed ---` section)

---

## Troubleshooting

### ใช้ `developer.docker-compose` แล้ว scripts ไม่ทำงาน

**สาเหตุ:** `compose/developer.docker-compose.yml` มี init logic ในตัว (inline ใน command) — ไม่ต้องใช้ scripts

**แก้:** ไม่ต้องรัน setup scripts — แค่ `docker compose -f compose/developer.docker-compose.yml up` ก็พอ ถ้าจะตรวจสอบสถานะใช้ `./check-onlyoffice-status.sh`

### `init-onlyoffice.sh` รันบน host แล้ว error (`fc-cache: command not found`)

**สาเหตุ:** สคริปต์นี้ออกแบบสำหรับรันภายใน container เท่านั้น

**แก้:** ใช้ผ่าน `docker exec`:
```bash
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh
# หรือ sync เฉพาะ
docker exec onlyoffice-documentserver /opt/kk-init/init-onlyoffice.sh sync-only
```

### `setup-onlyoffice-server.sh` error "mounted volume is marked read-only"

**สาเหตุ:** Dictionary path / sdkjs-plugins เป็น read-only (bind mount `:ro` หรือ image read-only)

**แก้:** ใช้ docker-compose ที่มี `onlyoffice_plugins` volume (writable) + `onlyoffice-init-plugins` init container เพื่อ populate volume แล้ว recreate:
```bash
docker compose up -d --force-recreate onlyoffice-documentserver
```

### Script หา only-office path ไม่เจอ

```bash
./setup-onlyoffice-server.sh onlyoffice-documentserver /absolute/path/to/only-office
```

### Container name มี 2 แบบ (`onlyoffice-docs-developer` vs `onlyoffice-documentserver`)

ตั้งแต่ใช้ container name เดียวกัน (`onlyoffice-documentserver`) ทั้ง local และ server — ถ้ามี container เก่าให้ recreate:
```bash
docker compose -f compose/developer.docker-compose.yml down
docker compose -f compose/developer.docker-compose.yml up -d
```

### Fonts ไม่แสดง

```bash
docker exec onlyoffice-documentserver fc-cache -fv
docker exec onlyoffice-documentserver /usr/bin/documentserver-generate-allfonts.sh
```

### Permission denied (script ไม่ executable)

```bash
chmod +x scripts/*.sh
```

---

## Deploy Scripts ไป Server

```bash
# Copy whole scripts directory
scp -r only-office/scripts user@server:~/deploy/only-office/

# Set permission
ssh user@server "chmod +x ~/deploy/only-office/scripts/*.sh"
```

หรือถ้า server clone repo:
```bash
ssh user@server
cd ~/deploy/only-office
git pull
chmod +x scripts/*.sh
```

---

## เอกสารเพิ่มเติม (external)

- [OnlyOffice Plugin Development](https://api.onlyoffice.com/plugin/basic)
- [OnlyOffice Dictionary Integration](https://api.onlyoffice.com/editing/dictionaries)
