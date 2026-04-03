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
 *   ❷  ตรวจ: text มี " " อยู่ที่ไหน → แยก 2 path:
 *
 *      Fast path (typing): space อยู่ท้ายสุดตัวเดียว
 *        → InputText([NBSP, " "]) → ลบ 1 char, insert 1 char ← เบามาก
 *
 *      Full path (paste): space อยู่กลางข้อความ
 *        → InputText([fullReplaced, fullOriginal]) → ลบ+insert ทั้งก้อน
 *        → เกิดไม่บ่อย จึงรับได้
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

  // ปิด/เปิด NBSP replacement: พิมพ์ใน Browser Console ของหน้าหลัก:
  //   ปิด: window.DO_DISABLE_NBSP = true
  //   เปิด: window.DO_DISABLE_NBSP = false
  function isDisabled() {
    try {
      // เช็ค window ของ plugin เอง
      if (window.DO_DISABLE_NBSP === true) return true;
      // เช็ค window ของ parent (main page) — plugin อยู่ใน iframe ซ้อน
      if (window.parent && window.parent.DO_DISABLE_NBSP === true) return true;
      if (window.top && window.top.DO_DISABLE_NBSP === true) return true;
    } catch (e) {}
    return false;
  }

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    state.replacing = false;
  };

  // ─── execute: wrapper รอบ InputText + re-entrancy guard ─────────────────
  function execute(newText, delText) {
    if (state.replacing) return;
    state.replacing = true;
    try {
      window.Asc.plugin.executeMethod("InputText", [newText, delText]);
    } catch (_e) {}
    setTimeout(function () {
      state.replacing = false;
    }, 150);
  }

  // ─── onInputHelperClear: context cleared, nothing to do ──────────────────
  window.Asc.plugin.event_onInputHelperClear = function () {};

  // ─── onInputHelperInput: ตรวจ space แล้วแทนที่ ─────────────────────────
  //
  // ⚡ Performance: แยก 2 path ตามตำแหน่ง space
  //
  //   typing (space ท้ายสุดตัวเดียว):
  //     InputText([NBSP, " "]) → ลบ 1 char, insert 1 char → เบามาก
  //
  //   paste (space กลางข้อความ):
  //     InputText([fullReplaced, fullOriginal]) → ลบ+insert ทั้งก้อน → หนักกว่า
  //     แต่เกิดแค่ตอน paste ไม่บ่อย จึงรับได้
  //
  window.Asc.plugin.event_onInputHelperInput = function (data) {
    if (state.replacing) return;
    if (isDisabled()) return;
    try {
      if (!data || typeof data.text !== "string" || data.text.length === 0) return;

      var text = data.text;
      var len = text.length;
      var firstSpace = text.indexOf(" ");

      if (firstSpace === -1) return; // ไม่มี space → ข้าม

      // ── Fast path: space อยู่ท้ายสุดตัวเดียว (typing ปกติ) ──────────────
      // ลบแค่ 1 char แทนที่ 1 char → ไม่ reflow ทั้ง paragraph
      if (firstSpace === len - 1) {
        execute(NBSP, " ");
        return;
      }

      // ── Full path: space อยู่กลางข้อความ (paste / multi-space) ───────────
      // ต้องแทนที่ทั้งก้อน เพราะ InputText ลบจาก cursor ย้อนกลับ
      var replaced = text.split(" ").join(NBSP);
      execute(replaced, text);
    } catch (_e) {
      state.replacing = false;
    }
  };
})(window);
