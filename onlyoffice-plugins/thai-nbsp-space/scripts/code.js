/**
 * nbsp Space Plugin
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * หลักการ (Principle)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ❶  Intercept ด้วย onInputHelperInput
 *     OnlyOffice Plugin API ไม่มี keydown event ตรงๆ สำหรับ editor
 *     แต่ event ชื่อ onInputHelperInput fires ทุกครั้งที่ผู้ใช้พิมพ์ตัวอักษร
 *
 *     data.add เป็น undefined ใน OO version นี้ — ไม่สามารถใช้ได้
 *     data.text = accumulated text ของคำปัจจุบัน ณ ตำแหน่ง cursor เช่น:
 *       พิมพ์ "สวัสดี" → text = "สวัสดี"
 *       กด Space      → text = "สวัสดี " (ลงท้ายด้วย space)
 *       พิมพ์ "ค"     → text = "ค" (เริ่มคำใหม่)
 *
 *     ดังนั้น: ถ้า data.text ลงท้ายด้วย " " → กด space เพิ่งเกิดขึ้น → แทนที่ด้วย nbsp
 *
 * ❷  แทนที่ด้วย InputText([new, old])
 *     executeMethod("InputText", ["\u00A0", " "]) ทำงานแบบ:
 *       1. ลบ " ".length = 1 ตัวอักษรก่อน cursor (ลบ space ที่เพิ่งใส่ไป)
 *       2. insert "\u00A0" (nbsp) แทน
 *
 * ❹  Re-entrancy Guard (replacing flag)
 *     การ insert nbsp อาจ trigger onInputHelperInput ซ้ำอีกรอบ
 *     ใช้ flag "replacing" ป้องกัน infinite loop:
 *       replacing = true  → เข้า replaceSpace()
 *       replacing = false → reset หลัง 150ms (ปลอดภัยหลัง OO process เสร็จ)
 *
 * ❺  onInputHelperClear
 *     fires เมื่อ context ถูกล้าง (arrow key, enter, space, etc.)
 *     ไม่ทำอะไรในที่นี้ — การตรวจ space ทำใน onInputHelperInput ทั้งหมด
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ผลลัพธ์
 * ══════════════════════════════════════════════════════════════════════════════
 *   Space (\u0020) → nbsp (\u00A0) ทุกครั้ง ไม่ว่าจะพิมพ์ท้ายคำหรือแทรกกลางคำ
 */
(function (window) {
  var NBSP = "\u00A0"; // U+00A0: non-breaking space

  var state = {
    replacing: false, // ❹ re-entrancy guard
  };

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    state.replacing = false;
  };

  // ─── ❷ แทนที่ space ด้วย nbsp ────────────────────────────────────────────
  function replaceSpace() {
    if (state.replacing) return;
    state.replacing = true;

    try {
      // InputText([newText, deleteText])
      // → ลบ " " (1 char) ก่อน cursor แล้ว insert NBSP แทนทันที
      // OO Plugin event fires หลัง document commit แล้ว จึงไม่ต้องการ setTimeout
      window.Asc.plugin.executeMethod("InputText", [NBSP, " "]);
    } catch (e) {}

    setTimeout(function () {
      state.replacing = false; // ❹ คืน guard หลัง 150ms
    }, 150);
  }

  // ─── ❺ onInputHelperClear: ไม่ต้องทำอะไร ──────────────────────────────────
  window.Asc.plugin.event_onInputHelperClear = function () {};

  // ─── ❶ รับ event ทุกตัวอักษรที่พิมพ์ ──────────────────────────────────────
  window.Asc.plugin.event_onInputHelperInput = function (data) {
    if (state.replacing) return; // ❹ ป้องกัน re-entrant

    try {
      if (!data || typeof data.text !== "string" || data.text.length === 0) return;

      // OO ส่ง accumulated text ของคำปัจจุบัน (data.add = undefined ใน version นี้)
      // กด Space → text ลงท้ายด้วย " " เสมอ → แทนที่ด้วย nbsp
      if (data.text[data.text.length - 1] === " ") {
        replaceSpace();
      }
    } catch (e) {
      state.replacing = false;
    }
  };
})(window);
