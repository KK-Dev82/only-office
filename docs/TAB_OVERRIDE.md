# Tab Key Override — Explanation

อธิบาย **ทำไมต้อง** บังคับให้ปุ่ม Tab แทรก `\t` เสมอ + **กลไก** ที่ใช้ + **ความเสี่ยง**

> เอกสารนี้เก็บเฉพาะ "เหตุผล + กลไก" — สำหรับ **วิธีติดตั้ง / verify / rollback** ดู [INSTALL.md](INSTALL.md)

## ปัญหาที่แก้

OnlyOffice Document Editor (เหมือน MS Word) มี behavior ชื่อ
**"Set left- and first-indent with tabs"**:

- กด Tab ในย่อหน้าที่ **มีข้อความอยู่แล้ว** + cursor อยู่หน้าตัวอักษร
  → **ปรับ first-line indent ของย่อหน้า** (Ruler ขยับ) แทนแทรก tab character

สำนักงาน สว. **ไม่ต้องการ behavior นี้** — ทำให้ format เอกสารราชการเพี้ยน
ต้องการให้ **Tab แทรก tab character เสมอ** ไม่ว่า cursor จะอยู่ตำแหน่งไหน

## ทำไมต้อง patch — ไม่มี config option ในตัว

- MS Word มี checkbox `File > Options > Proofing > AutoCorrect > AutoFormat
  As You Type > Set left- and first-indent with tabs` — ปิดได้ตรงๆ
- **OnlyOffice ไม่มี toggle นี้** (ตรวจ source code [AutoCorrectDialog.js](https://github.com/ONLYOFFICE/web-apps/blob/master/apps/common/main/lib/view/AutoCorrectDialog.js)
  — มีแค่ 6 toggle: smart-quotes, hyphens, bulleted, numbered, double-space, hyperlink)
- ปิดผ่าน `localStorage` ไม่ได้ → ต้อง patch ด้วย DOM hook

## กลไก

3 เทคนิคซ้อนกัน (รันใน browser context หลัง editor JS โหลด):

1. **Capture-phase keydown listener** — hook `document` ก่อน sdkjs ได้ event
2. **Event suppression** — `preventDefault` + `stopImmediatePropagation` กิน Tab key
3. **Internal API call** — เรียก `Asc.editor.asc_AddText('\t')` แทรก tab โดยตรง

Deploy โดย **Script Injection** (รูปแบบเดียวกับ AutoFormat-disable — ดู [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md)) — ฉีด `<script>` tag เข้า `documenteditor/main/index.html`
ของ Document Server

```text
┌─────────────────────────────────────────────────────────────┐
│ DS Container start                                          │
│   ├─ init-onlyoffice.sh                                     │
│   │    └─ inject-tab-as-tabchar.sh   ← inject <script>      │
│   │         ├─ ใส่ <script>/*kk-tab-as-tabchar*/...</script>│
│   │         └─ regen index.html.gz (nginx gzip_static)      │
│   └─ exec run-document-server.sh                            │
└─────────────────────────────────────────────────────────────┘

Browser โหลด /web-apps/.../documenteditor/main/index.html
   ↓
   editor JS โหลด → Asc.editor พร้อม → script poll จนเจอ → install hook
   ↓
   user กด Tab → handler intercept → preventDefault → asc_AddText('\t') ✅
```

## ขอบเขต — Tab combinations

| Key combo | Behavior |
|---|---|
| **Tab** | แทรก `\t` เสมอ (override) |
| Shift+Tab | ปล่อย default (unindent / backward) |
| Ctrl+Tab, Alt+Tab, Cmd+Tab | ปล่อย default |
| Tab ในตาราง | แทรก `\t` (ไม่ข้าม cell) — per requirement สว. |

## ความเสี่ยง / Maintenance

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| `Asc.editor.asc_AddText` เป็น undocumented internal API | OnlyOffice major upgrade อาจ rename | Test หลังทุก DS upgrade — ดู console log `[KK tab-hook] installed` |
| `#area_id` element name | เปลี่ยนได้ใน sdkjs version ใหม่ | Script มี fallback ที่ `document` level + polling 500ms รอ element |
| `</head>` regex inject | ถ้า OnlyOffice เปลี่ยน HTML structure อาจไม่เจอ | Script log `no </head> in <file>` ให้ดู |
| Service worker cache `index.html` | inject ใหม่แต่ browser โหลด version เก่า | Unregister SW + clear site data |

## เปรียบเทียบกับ Plugin

โปรเจกต์มี OnlyOffice plugins (`onlyoffice-plugins/`) สำหรับ feature อื่นๆ (Thai NBSP, insert-text-bridge, etc.) — ทำไม Tab override ไม่ทำเป็น plugin?

**คำตอบสั้น: Plugin API ของ OnlyOffice ไม่มี keyboard event** (ตรวจ [Plugin Events](https://api.onlyoffice.com/docs/plugin-and-macros/interacting-with-editors/overview/how-to-attach-events/) — มีแค่ contentControl, inputHelper, click, mouse, document events)

Plugin ทำงานใน iframe แยก + ไม่สามารถเข้าถึง `Asc.editor` ของ main window ตรงๆ → ต้อง inject ที่ DS level เท่านั้น

ดูรายละเอียดการแบ่งชั้น (host / plugin / inject) ใน [`senate-vite/.../DocumentOffice/PASTE_HANDLING.md`](../../senate-vite/src/components/DocumentOffice/PASTE_HANDLING.md) section "เกี่ยวข้องกับ Plugin หรือเปล่า?"

## เปรียบเทียบกับ MS Word

| Behavior | MS Word | OnlyOffice (default) | OnlyOffice (หลัง override) |
|---|---|---|---|
| Tab ที่ต้นย่อหน้าเปล่า | แทรก `\t` | แทรก `\t` | แทรก `\t` |
| Tab หน้าตัวอักษร (ย่อหน้ามีข้อความ) | ปรับ first-indent | ปรับ first-indent | **แทรก `\t`** ← เปลี่ยน |
| Tab กลางข้อความ | แทรก `\t` | แทรก `\t` | แทรก `\t` |
| Tab ในตาราง | ข้าม cell | ข้าม cell | **แทรก `\t`** ← เปลี่ยน |

## Bug history

### 2026-05-27: discovery + initial implementation

- User reported: Ruler ขยับเมื่อกด Tab ในย่อหน้าที่มีข้อความ — เอกสารราชการ format เพี้ยน
- ตรวจ OnlyOffice source code — ไม่มี config toggle
- พัฒนาผ่าน Console probe → identify `Asc.editor.asc_AddText('\t')` + `#area_id` keyboard target
- Deploy ผ่าน inject script pattern เดียวกับ AutoFormat-disable

## ที่มาของ requirement

- Trigger: user ของระบบสำนักงาน สว. (เลขาฯ) เคยใช้ MS Word มาก่อน — **ขอเองว่าไม่อยากใช้ auto-indent**
- ความคุ้นเคย: user คาดหวังให้ Tab แทรก tab character เสมอ ตามมาตรฐานเอกสารราชการที่ใช้ tab จัด columns
- Scope: ทุก Tab combinations ที่ไม่มี modifier — เพื่อ predictable behavior

## ติดตั้ง / verify / rollback

ดู [INSTALL.md](INSTALL.md) — รวม steps ของทั้ง 3 environments (dev / local file-service / production)
