/**
 * Thai nbsp Space Plugin
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ปัญหาที่แก้
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   OnlyOffice มองภาษาไทย 1 ประโยค = 1 คำ เมื่อกด Space
 *   → ขึ้นบรรทัดใหม่ทั้งประโยคแทนที่จะตัดที่ space
 *
 *   แก้: แทนที่ Space (U+0020) ด้วย NBSP (U+00A0)
 *        → OO ไม่ใช้ NBSP เป็น word boundary
 *        → ป้องกันการขึ้นบรรทัดใหม่ที่ไม่ต้องการ
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * หลักการ
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   ❶  onInputHelperInput fires ทุกครั้งที่พิมพ์
 *      data.text = accumulated text ของคำปัจจุบัน เช่น:
 *        พิมพ์ "สวัสดี" → text = "สวัสดี"
 *        กด Space      → text = "สวัสดี "  ← ลงท้ายด้วย space
 *        พิมพ์ "ค"     → text = "ค"       ← คำใหม่
 *
 *   ❷  ตรวจ: text ลงท้ายด้วย " " → space เพิ่งถูก insert
 *      → executeMethod("InputText", [NBSP, " "])
 *      → OO ลบ " " ก่อน cursor แล้ว insert NBSP แทน (length-based delete)
 *
 *   ❸  replacing flag ป้องกัน re-entrant loop
 *      (InputText อาจ trigger onInputHelperInput อีกรอบ)
 *      reset หลัง 150ms
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * สถานะปัจจุบัน
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   ✓  Space → NBSP  ทำงานทั้ง typing ทีละตัวและ paste ทั้งก้อน
 *       typing:  data.text = "สวัสดี "        → space ท้าย → replace
 *       paste:   data.text = "สวัสดี ครับ"   → space กลาง → replace ทุกตัว
 *   ✗  Thai word-break (ตัดบรรทัดที่ขอบคำ) — ยังไม่ได้แก้
 *       ZWSP (U+200B) ถูก insert ได้ แต่ OO 9.x ไม่ใช้เป็น line break opportunity
 *       → ต้องหาแนวทางอื่น เช่น callCommand เพื่อ set w:lang="th-TH" บน text run
 */
(function (window) {
  var NBSP = "\u00A0"; // U+00A0: non-breaking space

  var state = {
    replacing: false, // ❸ re-entrancy guard
  };

  // ปิด/เปิด NBSP replacement ได้จาก localStorage: localStorage.setItem("DO_DISABLE_NBSP", "1")
  // ใช้สำหรับทดสอบ performance — ลบด้วย localStorage.removeItem("DO_DISABLE_NBSP")
  function isDisabled() {
    try { return localStorage.getItem("DO_DISABLE_NBSP") === "1"; } catch (e) { return false; }
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    state.replacing = false;
  };

  // ─── แทนที่ space ทุกตัวในข้อความด้วย nbsp ──────────────────────────────
  // oldText = ข้อความเดิม (accumulated text ที่ OO ส่งมา)
  // InputText([newText, oldText]):
  //   1. ลบ oldText.length ตัวอักษรก่อน cursor
  //   2. insert newText แทน
  function replaceSpaces(oldText) {
    if (state.replacing) return;
    state.replacing = true;
    try {
      var newText = oldText.split(" ").join(NBSP);
      window.Asc.plugin.executeMethod("InputText", [newText, oldText]);
    } catch (_e) {}
    setTimeout(function () {
      state.replacing = false;
    }, 150);
  }

  // ─── onInputHelperClear: context cleared, nothing to do ──────────────────
  window.Asc.plugin.event_onInputHelperClear = function () {};

  // ─── onInputHelperInput: ตรวจ space แล้วแทนที่ทั้งหมด ───────────────────
  // typing ทีละตัว: data.text = "สวัสดี "       (space ท้าย)
  // paste ทั้งก้อน: data.text = "สวัสดี ครับ"  (space กลางข้อความ)
  // ทั้งสองกรณีใช้ indexOf(" ") > -1 ตรวจจับแล้วแทนที่ทั้งหมดในครั้งเดียว
  window.Asc.plugin.event_onInputHelperInput = function (data) {
    if (state.replacing) return;
    if (isDisabled()) return;
    try {
      if (!data || typeof data.text !== "string" || data.text.length === 0) return;
      if (data.text.indexOf(" ") !== -1) {
        replaceSpaces(data.text);
      }
    } catch (_e) {
      state.replacing = false;
    }
  };
})(window);
