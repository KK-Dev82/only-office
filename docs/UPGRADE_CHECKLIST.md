# OnlyOffice Upgrade Checklist — รายการ customization ที่ต้องตรวจหลังอัปเกรด DS

เอกสารนี้รวม **ทุกอย่างที่เราดัดแปลง/override จาก OnlyOffice DocumentServer ตัว stock** ไว้ที่เดียว
เพื่อใช้เป็น checklist ตอน **อัปเกรด DS version** — เพราะ customization ส่วนใหญ่พึ่งพา
internal API / localStorage key / โครงไฟล์ ที่ OnlyOffice **ไม่การันตีว่าจะเหมือนเดิม** ข้ามเวอร์ชัน

> ใช้คู่กับ [INSTALL.md](INSTALL.md) (วิธีติดตั้ง/verify/rollback) — เอกสารนี้เน้น "เราแก้อะไรไป + ต้องเช็คอะไร"

## เวอร์ชัน DS ที่ทดสอบแล้ว

| Environment | Image |
|---|---|
| Production / Local file-service | `onlyoffice/documentserver-de:9.2.1` |
| Developer compose | `onlyoffice/documentserver-de:latest` (แนะนำ pin เป็น `:9.2.1` ตอน deploy จริง) |

**ก่อนอัปเกรด:** จด version ปัจจุบันไว้ เผื่อ rollback. ทุก customization ด้านล่างทดสอบบน **9.2.1**

---

## สรุปสิ่งที่เราดัดแปลง (customization inventory)

| # | Customization | ไฟล์/กลไก | พึ่งพาอะไร (เปราะตอน upgrade?) | เอกสาร |
|---|---|---|---|---|
| 1 | **ปิด AutoCorrect** (bullet/numbered/hyphen/hyperlink/double-space/capitalize/math) | inject `<script>` set `localStorage` keys | **localStorage key names** (`de-settings-*`) อาจเปลี่ยนชื่อ | [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) |
| 2 | **ฟันหนูโค้ง “ ”** (smart quotes) — *เปิด* | key `de-settings-autoformat-smart-quotes=1` + React paste replace | key name + พฤติกรรม smart-quote ของ DS | [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md), ดูหัวข้อด้านล่าง |
| 3 | **Default language = ไทย** | key `app-settings-recent-langs=th-TH` | key name | [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) |
| 4 | **ซ่อน right settings panel** | key `de-hide-right-settings=1` | key name | [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) |
| 5 | **Tab key → tab char** (ไม่ใช่ indent) | inject hook ใช้ `Asc.editor.asc_AddText` + `#area_id` | **undocumented internal API** + element id — เปราะสูง | [TAB_OVERRIDE.md](TAB_OVERRIDE.md) |
| 6 | **สี Pilcrow (¶) paragraph mark** | inject ใช้ Builder API (`GetDocument`/`GetParagraphMarkTextPr`/`SetColor`) | public-but-undocumented Builder API | [PILCROW_COLOR.md](PILCROW_COLOR.md) |
| 7 | **Trial/license check** | ดูเอกสาร | license mechanism ของ DS | [TRIAL_LICENSE_CHECK.md](TRIAL_LICENSE_CHECK.md) |
| 8 | **Inject ผ่าน index.html + regen .gz** | sed + `gzip -c` (nginx `gzip_static`) | path ของ `documenteditor/main/index.html` + การมีอยู่ของ `.gz` | [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) |

> มี customization ฝั่ง **React host** ด้วย (ไม่ผูกกับ DS version) — paste pipeline ใน
> `senate-vite/src/components/DocumentOffice/` ดู `PASTE_HANDLING.md` ในโฟลเดอร์นั้น

---

## รายละเอียด #2 — ฟันหนูโค้ง “ ” (เพิ่ม 2026-06-04)

### ประเด็นเดิม (ทำไมเคยไม่โค้ง)
OnlyOffice **default คือ smart-quotes เปิด** (พิมพ์ `"` ได้ `“ ”` อยู่แล้ว) — แต่ตอนทำงาน
"ปิด AutoCorrect ทั้งหมด" เรา **เผลอ override ปิดมันไปด้วย** (`smart-quotes=0`) ฟันหนูเลยกลายเป็นตรง

### ตอนนี้ทำ 2 ชั้น (ดู [Replace as you type] + [paste])
1. **OnlyOffice (ตอนพิมพ์)** — `de-settings-autoformat-smart-quotes=1`
   ใน [`scripts/inject-autoformat-disable.sh`](../scripts/inject-autoformat-disable.sh)
   = เปิด feature "Replace straight quotes with smart quotes as you type"
2. **React (ตอน paste)** — `straightToCurlyDoubleQuotes()`
   ใน `senate-vite/src/utils/thaiPasteFormat.ts` เรียกใน `processPasteContentForHost`
   ของ `DocumentOffice.tsx` (แปลงตรง→โค้งตามตำแหน่งเปิด/ปิด)

### หมายเหตุ
- ไทยใช้ Unicode ชุดเดียวกับอังกฤษ: `“` U+201C / `”` U+201D — ไม่มีตัวแยกเฉพาะไทย
- ผลข้างเคียง: หน่วยนิ้ว เช่น `17"` จะกลายเป็นโค้งด้วย. ถ้าไม่ต้องการ ตั้งกลับ `=0`

---

## ขั้นตอนตรวจหลังอัปเกรด DS (verify checklist)

ทำตามลำดับ — แต่ละข้อบอก "ควรเห็นอะไร":

### A. Inject scripts รันสำเร็จ
```bash
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-autoformat-disable.sh
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-tab-as-tabchar.sh
docker exec onlyoffice-documentserver bash /opt/kk-init/inject-pilcrow-color.sh
```
- [ ] เห็น `[KK] AutoFormat-disable injected (N keys): ...`
- [ ] เห็น `[KK] tab-as-tabchar injected: ...`
- [ ] ไม่มี `html=1 gz=0` (= regen .gz ไม่สำเร็จ → ดู INSTALL.md troubleshooting)

> ถ้า inject ไม่เจอ `index.html` หรือ path เปลี่ยน → DS เปลี่ยนโครงไฟล์ ต้องอัปเดต path ในสคริปต์

### B. localStorage keys ยังชื่อเดิม (customization #1–4)
เปิดเอกสาร → DevTools → Application → Local Storage:
- [ ] `de-settings-autoformat-smart-quotes` = `1`
- [ ] `de-settings-autoformat-bulleted` = `0` (และ key ปิดอื่นๆ)
- [ ] `app-settings-recent-langs` = `th-TH`

> ถ้า key หาย/เปลี่ยนชื่อ → หา key ใหม่ตามวิธีใน [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md) §"วิธีหา localStorage key"

### C. ทดสอบพฤติกรรมจริงในเอกสาร
- [ ] **ฟันหนูโค้ง:** พิมพ์ `เขาพูดว่า "สวัสดี"` → ได้ `“สวัสดี”` (เปิด/ปิดถูกตำแหน่ง)
- [ ] **ฟันหนู paste:** copy `"คำ"` มาวาง → กลายเป็นโค้ง
- [ ] **AutoCorrect ปิด:** พิมพ์ `- ` (ขีด+เว้นวรรค) → **ไม่** กลายเป็น bullet / ruler ไม่ขยับ
- [ ] **Tab:** กด Tab → ได้ tab char ไม่ใช่ indent (console เห็น `[KK tab-hook] installed`)
- [ ] **Pilcrow สี:** เปิดแสดง ¶ → สีตามที่ตั้ง (console เห็น `[KK pilcrow] colored N paragraph mark(s)`)

### D. ถ้าข้อใดพัง
- localStorage key เปลี่ยน → [AUTOFORMAT_DISABLE.md](AUTOFORMAT_DISABLE.md)
- Tab/Pilcrow internal API เปลี่ยน → [TAB_OVERRIDE.md](TAB_OVERRIDE.md) / [PILCROW_COLOR.md](PILCROW_COLOR.md) (ทั้งคู่มี fallback + วิธี debug)
- Browser โหลดของเก่า → unregister Service Worker + hard refresh (Cmd+Shift+R)

---

## หลักการกว้างๆ ตอนอัปเกรด

1. **Pin version** ก่อน deploy จริง อย่าใช้ `:latest` บน production
2. **อัปเกรดบน staging/dev ก่อน** แล้วรัน checklist C ให้ครบ
3. **Internal API (Tab/Pilcrow) เปราะสุด** — OnlyOffice rename ได้ทุก major upgrade ให้เทสต์ก่อนเสมอ
4. **localStorage key ใน source code อาจไม่ตรงกับที่ใช้จริง** — verify ที่ browser แม่นกว่า grep
5. ทุกครั้งที่เพิ่ม customization ใหม่ → **เพิ่มแถวใน inventory ด้านบน + ข้อใน checklist C**
