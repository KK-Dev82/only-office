# Plugin Panel → Editor Focus Return — Explanation

> ## STATUS 2026-06-10: แก้เสร็จ ใช้งานได้ทุก panel
> ทุก plugin ที่ insert คำผ่าน Panel/Balloon (Clipboard / Macros / Dictionary / Abbreviation /
> Thai-autocomplete) เมื่อกดเลือกคำแล้ว **caret กลับมากระพริบในเอกสารเอง** พิมพ์ต่อได้ทันที
> โดยไม่ต้องเอาเมาส์ไปคลิกในเอกสารซ้ำ
>
> กลไก = **โฟกัส `#area_id` (textarea รับคีย์ของ editor) ตรง ๆ ผ่าน DOM แบบ synchronous**
> ในจังหวะคลิก (ทุก frame เป็น same-origin) — ไม่ใช่ `executeMethod("FocusEditor")` ที่ใช้ไม่ได้

อธิบาย **อาการ** + **ทำไมวิธีที่ดูควรจะถูก (executeMethod) ใช้ไม่ได้** + **กลไกที่ใช้ได้จริง** + **กับดักที่เสียเวลา**

> เอกสารนี้เก็บ "เหตุผล + กลไก + กับดัก" — สำหรับวิธีติดตั้ง/verify ดู [INSTALL.md](INSTALL.md)

## ปัญหาที่แก้

Plugin แบบ Panel (clipboard / macros / dictionary) และ Balloon (thai-autocomplete) — เมื่อใช้ **เมาส์คลิกเลือกคำ** แล้วคำถูก insert เข้า editor:

1. **focus ค้างที่ปุ่มใน panel** → กด space/enter ต่อ = ปุ่มทำงานซ้ำ = **insert คำซ้ำ**
2. **caret ไม่กลับเข้าเอกสาร** → ต้องเอาเมาส์ไปคลิกในเอกสารก่อนถึงจะพิมพ์ต่อได้

Requirement: หลัง insert ให้ **cursor กลับมาอยู่หลังคำที่แทรกในเอกสารเอง** พิมพ์ต่อได้เลย

## โครงสร้างที่ต้องเข้าใจก่อน

- editor วาดเอกสารลง **`<canvas id="id_viewer_overlay">`** (canvas โฟกัสรับคีย์ไม่ได้)
- คีย์บอร์ดจริง ๆ เข้าที่ **hidden `<textarea id="area_id">`** ใน frame ของ editor
- Frame hierarchy: **plugin panel iframe → frameEditor (มี `#area_id`) → top (React app)**
- ทุก frame เสิร์ฟจาก **localhost:3010 = same-origin** → เข้าถึง DOM ข้าม frame กันได้

## ทำไม `executeMethod("FocusEditor")` ใช้ไม่ได้ (ทั้งที่เป็น method จริง)

- OnlyOffice 9.2.1 **มี** `pluginMethod_FocusEditor` จริง (`AscCommon.g_inputContext.HtmlArea.focus()`)
  แต่โค้ดเดิมเรียกชื่อผิดเป็น `"SetFocusToEditor"` (ไม่มีจริง → no-op เงียบ ๆ)
- เปลี่ยนเป็นชื่อถูก `"FocusEditor"` แล้ว **ก็ยังไม่ทำงาน** เพราะ:
  - `executeMethod` สั่งผ่าน **postMessage (async)** → กว่าจะถึง editor frame **หลุด user-activation**
  - browser **บล็อกการย้าย keyboard-focus ข้าม iframe** เมื่อไม่มี user-activation สด
- สรุป: ต้องทำ focus **แบบ synchronous ในจังหวะคลิก** (ยังอยู่ใน user-gesture) จะผ่าน postMessage ไม่ได้

## กลไกที่ใช้ได้จริง — โฟกัส `#area_id` ตรง ๆ ผ่าน DOM

ทุก panel insert วิ่งผ่านฟังก์ชันกลาง `DO.editor.insertText` → เรียก `DO.editor.focusEditor()`
ซึ่งทำ 2 อย่าง **synchronous ใน onClick**:

```js
DO.editor.focusEditor = function () {
  // 1) blur ปุ่มที่กด → กด space ไม่ insert ซ้ำ
  var ae = document.activeElement;
  if (ae && ae !== document.body && ae.blur) ae.blur();

  // 2) ไต่ขึ้น parent frames หา #area_id ของ editor แล้วโฟกัสตรง ๆ
  var win = window;
  for (var i = 0; i < 8; i++) {
    var edoc; try { edoc = win.document; } catch (e) { break; } // คนละ origin → หยุด
    var el = edoc.getElementById("area_id");
    if (el && el.focus) {
      win.focus();                          // สลับ frame-focus ไป frameEditor
      el.focus({ preventScroll: true });    // โฟกัส textarea รับคีย์
      break;
    }
    if (!win.parent || win.parent === win) break;
    win = win.parent;
  }
  // 3) fallback (เผื่อ build อื่น)
  Asc.plugin.executeMethod("FocusEditor", []);
};
```

- **Panel plugins** (Clipboard/Macros/Dictionary/Abbreviation): อยู่ใน `*/core/editor.js` ของ
  `document-office`, `dictionary-abbreviation`, `speech-to-text`, `insert-text-bridge`
- **Balloon plugin** (thai-autocomplete): ใช้ InputHelper + `executeMethod("InputText")` ไม่ผ่าน
  editor.js — เลย **ฝังโค้ด `#area_id` focus ชุดเดียวกันใน `scripts/code.js` → `inputHelper_onSelectItem`**

## ⚠️ กับดักที่เสียเวลามากที่สุด (ต้องรู้)

| กับดัก | อาการ | วิธีรับมือ |
|---|---|---|
| **editor.js ค้าง cache** | แก้โค้ดแล้วไม่เห็นผล (ตัวเก่าถูกเสิร์ฟ) | **ต้อง bump `?v=` ของ asset ใน index.html + config.json** ทุกครั้งที่แก้ไฟล์ plugin — `PLUGIN_BUILD_TS` ใน senate-vite bust แค่ `config.json` **ไม่ bust ตัว `editor.js`** |
| **Clipboard เรียก `navigator.clipboard.writeText` แย่ง focus** | Clipboard ตัวเดียว caret ไม่กลับ (Macros/Dictionary ปกติ) | guard "คลิกปุ่มไม่ต้อง copy" เดิมเช็ค `ev.target.tagName==="button"` แต่ปุ่มมี SVG ข้างใน → คลิกโดน SVG → guard พลาด → writeText ทำงาน → แก้เป็น `target.closest("button")` |
| **`document.hasFocus()` ใน DevTools console** | เทสต์ผ่าน console เห็น `false` เสมอ | console กิน focus เอง — **ต้องเทสต์ด้วยการกดปุ่มจริง** ห้ามสรุปจาก console |
| **รัน diagnostic ผิด context** | log บอก "found at parent-level 0" สับสน | ต้องเลือก context เป็น **plugin panel iframe** ไม่ใช่ frameEditor |

## ข้อจำกัดที่ยอมรับ

- พึ่ง **id `area_id`** ของ OnlyOffice (internal DOM) — ถ้า DS เปลี่ยน id ในเวอร์ชันหน้าต้องอัปเดต
  (มี `executeMethod("FocusEditor")` เป็น fallback)
- ต้อง **same-origin** ทุก frame — ถ้าวันหน้าแยก DS ไปคนละ origin จะเข้าถึง `#area_id` ไม่ได้
  ต้องเปลี่ยนไปทาง React host (top window สั่ง `iframe.contentWindow.focus()` — parent→child)

## ไฟล์ที่แก้ + version

| Plugin | ไฟล์ | version (หลังแก้) |
|---|---|---|
| document-office (Clipboard/Macros) | `core/editor.js` (focusEditor), `features/clipboard.js` (guard `closest("button")`) | 0.1.19 → **0.1.21** |
| dictionary-abbreviation (Dictionary/Abbreviation) | `core/editor.js` | 0.1.73 → **0.1.74** (sync asset `?v=` ที่ค้าง 0.1.71) |
| thai-autocomplete (Balloon) | `scripts/code.js` (`inputHelper_onSelectItem`) | 0.0.2 → **0.0.3** |
| speech-to-text | `core/editor.js` | 0.3.5 → **0.3.6** |
| insert-text-bridge | `editor.js` (เพิ่ม `?v=` ที่ไม่เคยมี) | 0.1.7 → **0.1.8** |

> **กฎ:** แก้ไฟล์ plugin ใด ต้อง bump `version` + `description` + `url` ใน `config.json` และทุก `?v=`
> ใน `index.html` ของ plugin นั้น (ดู [PLUGIN_VERSIONING.md](../onlyoffice-plugins/PLUGIN_VERSIONING.md))

## Bug history

### 2026-06-09: เริ่ม — ชื่อ method ผิด

- โค้ดเดิม `exec("SetFocusToEditor")` **ก่อน** insert — ชื่อไม่มีจริง → no-op (ต้นเหตุที่ focus ไม่เคยกลับ)
- ยืนยันจาก container: DS = `onlyoffice/documentserver-de:9.2.1`,
  `pluginMethod_FocusEditor = function(){AscCommon.Dr.JK.focus()}` มีจริง (= `g_inputContext.HtmlArea.focus`)
- ใส่ `executeMethod("FocusEditor")` หลัง insert → **ยังไม่กลับ** (async postMessage หลุด gesture)

### 2026-06-09: แก้อาการ insert ซ้ำได้ก่อน

- พบปุ่ม Insert เป็น `<button>` จริง → กิน focus → กด space = insert ซ้ำ
- เพิ่ม `blur(document.activeElement)` แบบ synchronous → **หยุด insert ซ้ำได้ทันที** (ไม่พึ่ง callback)
- callback ของ `executeMethod("PasteText")` **ไม่ยิง** ใน DS 9.2.1 → ย้าย focus call มาเรียกตรง ๆ

### 2026-06-09: พบ element รับคีย์จริง + วิธี focus ที่ใช้ได้

- editor เป็น canvas (`#id_viewer_overlay`, keyboard-focusable=ไม่ได้) → คีย์เข้า `<textarea id="area_id">`
- ลองโฟกัส `#area_id` ตรง ๆ (synchronous, ไต่ parent frames, same-origin) + `win.focus()` สลับ frame
- **ติดกับดัก:** สรุปผิดว่า "ได้ครั้งเดียวแล้วบล็อก" → จริง ๆ คือ **editor.js ค้าง cache** ที่ `?v=0.1.19`
  (document-office ไม่เคย bump) ทุก edit เลยไม่โหลด — ส่วน Dictionary (`?v=0.1.71`) โหลดใหม่เลยใช้ได้

### 2026-06-10: ปลดล็อกด้วยการ bump version + แก้ Clipboard

- เทียบ log: Dictionary (`editor.js?v=0.1.71`) ใช้ได้ ↔ Clipboard (`editor.js?v=0.1.19`) ไม่ได้ ทั้งที่โค้ดเดียวกัน
  → ยืนยัน **cache ค้าง** → bump document-office 0.1.19 → 0.1.20 → Clipboard/Macros ใช้ได้
- ใส่ `#area_id` focus ใน thai-autocomplete (balloon) + bump 0.0.2 → 0.0.3 → ใช้ได้
- **Clipboard กลับมาพังตัวเดียว:** ปุ่ม Insert มี SVG → guard `tagName==="button"` พลาด →
  row click เรียก `navigator.clipboard.writeText` แย่ง focus → แก้เป็น `closest("button")` + bump → 0.1.21
- **สรุป:** วิธี `#area_id` focus **ใช้ได้จริงและเสถียร** — ที่ก่อนหน้าดูไม่เสถียรเพราะ cache + writeText
  ไม่ใช่เพราะวิธีผิด

## ติดตั้ง / verify

ดู [INSTALL.md](INSTALL.md) และ [PLUGIN_VERSIONING.md](../onlyoffice-plugins/PLUGIN_VERSIONING.md)

Verify (กดจริง ห้ามเชื่อ console):
1. คลิกในเอกสารให้ caret กระพริบ
2. เปิด panel (Clipboard/Macros/Dictionary) → กด Insert → caret กลับมาในเอกสาร พิมพ์ต่อได้
3. thai-autocomplete: พิมพ์ให้ balloon เด้ง → คลิกเลือก → caret กลับมา
