# OnlyOffice NBSP Plugin — callCommand Findings

## callCommand ใน system plugin (isSystem:true)

- `callCommand` เรียกได้ (log "lazy inject: callCommand..." ปรากฏ)
- ทำงานใน **Document Builder sandbox** — ไม่ใช่ browser DOM ปกติ
- `document.getElementById("id_target_cursor")` อาจเรียกได้ แต่:
  - `addEventListener("keydown", ...)` **ไม่ persist** หลัง callCommand return
  - sandbox context ถูก destroy เมื่อ callCommand function return
- thai-autocomplete ใช้ callCommand ได้เพราะแค่ `target.focus()` (one-shot, ไม่ต้อง persist)

## สรุป: ไม่สามารถ inject keydown handler ผ่าน callCommand

ทดสอบ 3 ครั้ง (2026-04-06 ~ 2026-04-07):
1. inject ตอน init (delay 500ms) — ไม่ทำงาน
2. lazy inject ตอน onInputHelperInput ครั้งแรก — ไม่ทำงาน  
3. debug marker document.title — ไม่เปลี่ยน

## ทางเดียวที่ทำงานได้: onInputHelperInput + InputText (fast path)

- ~130-170ms/space (reflow 2 ครั้ง)
- Fast path: ลบ+insert 1 char (ไม่ reflow ทั้งคำ)
- Guard 50ms (self-correcting)
- OO อาจ drop ~25% ของ onInputHelperInput events เมื่อ document ใหญ่
