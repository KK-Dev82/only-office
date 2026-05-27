# Tab Key Override — บังคับให้ Tab แทรก `\t` เสมอ

## ปัญหาที่แก้

OnlyOffice Document Editor (เหมือน MS Word) มี behavior ชื่อ
**"Set left- and first-indent with tabs"**:
- กด Tab ในย่อหน้าที่ **มีข้อความอยู่แล้ว** + cursor อยู่หน้าตัวอักษร
  → **ปรับ first-line indent ของย่อหน้า** (Ruler ขยับ) แทนแทรก tab character

สำนักงาน สว. ไม่ต้องการ behavior นี้ — ทำให้ format เอกสารราชการเพี้ยน
ต้องการให้ **Tab แทรก tab character เสมอ** ไม่ว่า cursor จะอยู่ตำแหน่งไหน

## ทำไมต้อง patch — ไม่มี config option ในตัว

- MS Word มี checkbox `File > Options > Proofing > AutoCorrect > AutoFormat As You Type
  > Set left- and first-indent with tabs` — ปิดได้ตรงๆ
- **OnlyOffice ไม่มี toggle นี้** (ตรวจ source code [AutoCorrectDialog.js](https://github.com/ONLYOFFICE/web-apps/blob/master/apps/common/main/lib/view/AutoCorrectDialog.js)
  — มีแค่ 6 toggle: smart-quotes, hyphens, bulleted, numbered, double-space, hyperlink)
- ปิดผ่าน `localStorage` ไม่ได้ → ต้อง patch ด้วย DOM hook

## วิธีการ (สรุปสั้น)

3 เทคนิคซ้อนกัน:

1. **Capture-phase keydown listener** — hook `document` ก่อน sdkjs ได้ event
2. **Event suppression** — `preventDefault` + `stopImmediatePropagation` กิน Tab key
3. **Internal API call** — เรียก `Asc.editor.asc_AddText('\t')` แทรก tab โดยตรง

Deploy โดย **Script Injection** — ฉีด `<script>` tag เข้า `documenteditor/main/index.html`
ของ Document Server (pattern เดียวกับ `inject-autoformat-disable.sh`)

## ขอบเขต

| Key combo | Behavior |
|---|---|
| **Tab** | แทรก `\t` เสมอ (override) |
| Shift+Tab | ปล่อย default (unindent / backward) |
| Ctrl+Tab, Alt+Tab | ปล่อย default |
| Tab ในตาราง | แทรก `\t` (ไม่ข้าม cell) — per requirement สว. |

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| `inject-tab-as-tabchar.sh` | Script หลัก — inject `<script>` ลง `index.html` + regen `.gz` |
| `init-onlyoffice.sh` (section 6.6) | เรียก inject script ตอน container init (production) |
| `restart-ds-dev.sh` | เรียก inject script หลัง dev container restart |
| `compose/developer.docker-compose.yml` | command block ที่รัน inject ตอน container เริ่ม |

## วิธีใช้

### Dev environment
```bash
./scripts/restart-ds-dev.sh             # restart container + inject ทั้ง autoformat-disable + tab-as-tabchar
./scripts/restart-ds-dev.sh --no-restart  # แค่ inject ใหม่ (container ทำงานอยู่)
```

หลัง inject ต้อง **hard refresh browser** (Cmd+Shift+R) เพราะ `index.html` มี cache

### Production
ทำงานอัตโนมัติผ่าน `init-onlyoffice.sh` ตอน container start

### ตรวจสอบว่าทำงานไหม
1. เปิดเอกสารใน OnlyOffice
2. F12 → Console — จะเห็น log `[KK tab-hook] installed (Tab -> \t, no first-indent)`
3. พิมพ์ข้อความใน paragraph → กด Tab → ต้องเห็นสัญลักษณ์ `→` แทรกเข้าไป Ruler **ไม่ขยับ**

## วิธีปิด (rollback)

ลบ inject ออกจาก `index.html`:
```bash
docker exec onlyoffice-documentserver bash -c '
  find /var/www/onlyoffice/documentserver -name index.html -path "*documenteditor*" |
  while read f; do
    perl -i -pe "s|<script>/\*kk-tab-as-tabchar\*/.*?</script>||g" "$f"
    [ -f "${f}.gz" ] && gzip -c -f "$f" > "${f}.gz"
  done
'
```
แล้ว hard refresh browser

หรือถ้าจะปิดถาวร: comment out section 6.6 ใน `init-onlyoffice.sh` + command block ใน
`developer.docker-compose.yml`

## ความเสี่ยง / Maintenance

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| `Asc.editor.asc_AddText` เป็น undocumented internal API | OnlyOffice major upgrade อาจ rename | Test หลังทุก DS upgrade — ดู console log `[KK tab-hook] installed` |
| `#area_id` element name | เปลี่ยนได้ใน sdkjs version ใหม่ | ใน script มี polling 500ms รอ element + fallback ที่ `document` level |
| `</head>` regex inject | ถ้า OnlyOffice เปลี่ยน HTML structure อาจไม่เจอ | Script จะ log `no </head> in <file>` ให้ดู |

## ทดสอบผ่าน DevTools (ก่อน deploy)

ถ้าจะ verify approach ใน browser ก่อน inject ลง DS:

```js
const area = document.getElementById('area_id');
const editor = Asc.editor;
window.__tabHookCleanup?.();
window.__tabHookCleanup = (() => {
  const handler = (e) => {
    if (e.keyCode === 9 && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      editor.asc_AddText('\t');
    }
  };
  area.addEventListener('keydown', handler, true);
  document.addEventListener('keydown', handler, true);
  return () => {
    area.removeEventListener('keydown', handler, true);
    document.removeEventListener('keydown', handler, true);
  };
})();
```

Cleanup: `window.__tabHookCleanup()` แล้ว refresh
