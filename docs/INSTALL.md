# Install & Deploy — OnlyOffice DocumentServer

วิธีติดตั้ง/อัปเดต/verify ของทุก environment ที่รัน OnlyOffice DocumentServer **ที่เดียว** — ครอบคลุม fonts, plugins, dictionary, inject scripts (AutoFormat-disable + Tab-override) ตาม integration ของระบบสำนักงาน สว.

> เอกสารนี้เก็บ **"วิธีทำ" (How-to)** เท่านั้น
> สำหรับ **"ทำไมต้องทำ" (Explanation)** ของแต่ละ inject script ดู:
> - [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) — ปิด AutoCorrect + default localStorage
> - [TAB_OVERRIDE.md](TAB_OVERRIDE.md) — Tab key → `\t` แทน first-line indent
> - [TRIAL_LICENSE_CHECK.md](TRIAL_LICENSE_CHECK.md) — license verification

## 3 Environments

| Environment | Compose file | Container name | ใช้เมื่อ |
|---|---|---|---|
| **A. only-office dev** | `only-office/compose/developer.docker-compose.yml` | `onlyoffice-documentserver` | พัฒนา OnlyOffice ตรงๆ (แก้ plugin/script) |
| **B. file-service local** | `file-service/FileService/docker-compose.local.yml` | `onlyoffice-documentserver` | รัน stack ครบ (DS + FileService + Word Processor) บน Mac |
| **C. server production** | `file-service/FileService/docker-compose.yml` | `onlyoffice-documentserver` | Production บน server 10.200.22.60 |

ทั้ง 3 environments รัน **scripts ชุดเดียวกัน** ที่ `only-office/scripts/` (mount เข้า container ผ่าน volume) — ไม่ต้อง maintain คนละชุด

---

## First-time setup

### A. Developer (only-office)

```bash
cd only-office/compose
cp env.example env.local            # แก้ค่า DOCKER_PLATFORM, OO_HTTP_PORT, JWT_SECRET
docker compose --env-file env.local -f developer.docker-compose.yml up -d
```

Container start ครั้งแรกจะทำอัตโนมัติ (ผ่าน `init-onlyoffice.sh`):
- Mount fonts (TH Sarabun New) → run `fc-cache` + `documentserver-generate-allfonts.sh`
- Copy plugins จาก `onlyoffice-plugins/` → `sdkjs-plugins/`
- Copy Thai dictionary + register
- Inject AutoFormat-disable + Tab-override scripts

Idempotent marker: `/var/www/onlyoffice/Data/.kk_init_done` (ลบทิ้งเพื่อ re-init)

### B. Local file-service

```bash
cd file-service/FileService
docker compose -f docker-compose.local.yml up -d onlyoffice-documentserver
```

ต้องการ folder structure:
```
your-workspace/
├── file-service/FileService/docker-compose.local.yml    # path ที่อยู่
└── only-office/                                          # ../../only-office/
```

### C. Server production

```bash
ssh user@10.200.22.60
cd ~/deploy                          # คือ folder ที่มี docker-compose.yml + only-office/
docker compose up -d onlyoffice-documentserver
```

ครั้งแรก: ต้อง clone/copy `only-office/` ไป `~/deploy/only-office/` ก่อน (paths ใน YAML เป็น relative `./only-office/`)

---

## Update: เปลี่ยน plugin / inject script

### Update plugins (`onlyoffice-plugins/*/`)

แค่แก้ไฟล์ใน `only-office/onlyoffice-plugins/<plugin>/` → restart container:

```bash
# A. Developer
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose -f only-office/compose/developer.docker-compose.yml restart

# B. Local file-service
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose -f file-service/FileService/docker-compose.local.yml restart onlyoffice-documentserver

# C. Server
ssh user@10.200.22.60
cd ~/deploy
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose restart onlyoffice-documentserver
```

### Update inject scripts (autoformat-disable / tab-as-tabchar)

Scripts mount เป็น volume → file system update ทันที **ไม่ต้อง recreate container** — แค่ run inject อีกครั้ง:

```bash
# A. Developer (มี wrapper)
cd only-office/scripts
./restart-ds-dev.sh --no-restart        # รัน inject ใหม่ (ไม่ recreate)
./restart-ds-dev.sh                     # recreate + inject (ถ้า YAML เปลี่ยน)

# B/C. Local file-service / Server (รัน inject แบบ manual)
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-autoformat-disable.sh
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-tab-as-tabchar.sh
```

หลังรัน inject → **hard refresh browser** (Cmd+Shift+R) เพราะ `index.html` มี cache

### Update fonts

```bash
# แค่อัปเดต path ใน docker-compose.yml → recreate
docker compose up -d --force-recreate onlyoffice-documentserver

# ถ้า font cache ไม่ update — ลบ marker แล้ว restart
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose restart onlyoffice-documentserver
```

---

## Verify การติดตั้ง — 4 ระดับ

### L1. Scripts mount เข้า container

```bash
docker exec onlyoffice-documentserver ls -la /opt/kk-init/
```
ต้องเห็น: `init-onlyoffice.sh`, `inject-autoformat-disable.sh`, `inject-tab-as-tabchar.sh`

### L2 + L3. Inject สำเร็จใน HTML + GZ

```bash
docker exec onlyoffice-documentserver bash -c '
  echo "=== AutoFormat-disable ==="
  find /var/www/onlyoffice/documentserver -name "index.html" -path "*documenteditor/main*" | while read f; do
    html=$(grep -c "kk-autoformat-disable" "$f" 2>/dev/null || echo 0)
    gz="-"
    [ -f "${f}.gz" ] && gz=$(zcat "${f}.gz" | grep -c "kk-autoformat-disable" 2>/dev/null || echo 0)
    echo "  html=$html gz=$gz | $f"
  done
  echo ""
  echo "=== Tab-as-tabchar ==="
  find /var/www/onlyoffice/documentserver -name "index.html" -path "*documenteditor/main*" | while read f; do
    html=$(grep -c "kk-tab-as-tabchar" "$f" 2>/dev/null || echo 0)
    gz="-"
    [ -f "${f}.gz" ] && gz=$(zcat "${f}.gz" | grep -c "kk-tab-as-tabchar" 2>/dev/null || echo 0)
    echo "  html=$html gz=$gz | $f"
  done
'
```
ทุกบรรทัดต้องได้ `html=1 gz=1`

### L4. Browser — feature ทำงานจริง

1. เปิดเอกสารผ่าน senate-vite → **Hard refresh** (Cmd+Shift+R)
2. F12 → Console — ต้องเห็น log:
   ```
   [KK tab-hook] installed (Tab -> \t, no first-indent)
   ```
3. ทดสอบ behavior:

| ทำอะไร | ผลที่ควรเห็น | feature |
|---|---|---|
| พิมพ์ข้อความ → กด Tab | สัญลักษณ์ → แทรก, Ruler **ไม่ขยับ** | Tab override |
| พิมพ์ "- " ต้นบรรทัด | **ไม่กลายเป็น bullet** | AutoFormat-disable |
| พิมพ์ URL | **ไม่ auto-link** | AutoFormat-disable |
| Copy ข้อความที่มี Tab → paste กลับ | Tab อยู่ครบ, ขึ้นบรรทัดถูกต้อง | senate-vite paste handler |

### Log ตอน container start (ถ้าจะ debug)

```bash
docker logs onlyoffice-documentserver 2>&1 | grep "\[KK\]"
```
ต้องเห็น (ลำดับ):
```
[KK] applying AutoFormat-disable defaults...
[KK] AutoFormat-disable injected (11 keys): ...
[KK] applying Tab-as-tabchar override...
[KK] tab-as-tabchar injected: ...
```

---

## Rollback — ถ้าต้องการปิด inject

### ปิดแบบชั่วคราว (จนกว่า container restart ครั้งต่อไป)

```bash
docker exec onlyoffice-documentserver bash -c '
  find /var/www/onlyoffice/documentserver -name "index.html" -path "*documenteditor*" | while read f; do
    perl -i -pe "s|<script>/\*kk-tab-as-tabchar\*/.*?</script>||g" "$f"
    perl -i -pe "s|<script>/\*kk-autoformat-disable\*/.*?</script>||g" "$f"
    [ -f "${f}.gz" ] && gzip -c -f "$f" > "${f}.gz"
  done
'
```
แล้ว hard refresh browser

### ปิดถาวร

Comment out ใน `init-onlyoffice.sh` (section 6.5 และ 6.6) + restart container

---

## Troubleshooting

### Inject script รันสำเร็จ (เห็น `[KK] ... injected`) แต่ browser ไม่ทำงาน

ส่วนใหญ่เป็น **cache** หรือ **service worker**:

1. DevTools → Network tab → reload → ดูว่า `index.html` มี Status `200` (ไม่ใช่ `304/from cache`)
2. DevTools → Application → Service Workers → **Unregister**
3. DevTools → Application → Storage → **Clear site data** → reload

### `html=1 gz=0` (inject เข้า HTML แต่ GZ ยังเก่า)

```bash
# Regen .gz ทั้ง 2 ตัว
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-autoformat-disable.sh
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-tab-as-tabchar.sh
```

### `html=0 gz=0` (ไม่มี inject เลย)

1. Script ไม่ได้ mount → ดู docker-compose volumes
2. `init-onlyoffice.sh` ไม่ได้เรียก → ดู section 6.5/6.6 ใน `init-onlyoffice.sh`
3. รัน inject manual:
   ```bash
   docker exec onlyoffice-documentserver bash /opt/kk-init/inject-tab-as-tabchar.sh
   ```

### `restart-ds-dev.sh` ไม่ทำงาน (`/opt/kk-scripts/inject-... not found`)

`developer.docker-compose.yml` mount scripts ที่ `/opt/kk-scripts/` (path ต่างจาก `/opt/kk-init/` ที่ใช้ใน file-service compose) — ดู YAML ของ compose ที่ใช้ว่า mount path ตรงไหม

### Container start แล้ว plugin ไม่โหลด

```bash
# ลบ idempotent marker → re-init ทุกอย่าง
docker exec onlyoffice-documentserver rm -f /var/www/onlyoffice/Data/.kk_init_done
docker compose restart onlyoffice-documentserver

# Verify plugins อยู่ใน container
docker exec onlyoffice-documentserver ls /var/www/onlyoffice/documentserver/sdkjs-plugins/
```

---

## ภาคผนวก: ไฟล์ scripts

| Script | บทบาท | เรียกจาก |
|---|---|---|
| `setup-onlyoffice-server.sh` | First-time setup (plugins + dict + fonts) — รันจาก host | manual |
| `init-onlyoffice.sh` | Container-side init — รันใน entrypoint | docker-compose |
| `inject-autoformat-disable.sh` | Inject `<script>` ปิด AutoCorrect | `init-onlyoffice.sh` 6.5 |
| `inject-tab-as-tabchar.sh` | Inject `<script>` Tab key override | `init-onlyoffice.sh` 6.6 |
| `restart-ds-dev.sh` | Wrapper สำหรับ developer compose (recreate + run inject) | manual |
| `check-onlyoffice-status.sh` | Verify plugins + dict + license | manual |
| `seed-dictionary.js` | Bulk seed words ผ่าน backend API | manual |
