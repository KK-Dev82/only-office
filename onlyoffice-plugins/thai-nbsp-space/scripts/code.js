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
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * หลักการ
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   ❶  onInputHelperInput fires ทุกครั้งที่พิมพ์
 *      data.text = accumulated text ของคำปัจจุบัน
 *      กด Space → text ลงท้ายด้วย " "
 *
 *   ❷  Fast path (typing): space ท้ายสุดตัวเดียว
 *        → InputText([NBSP, " "]) → ลบ 1 char, insert 1 char
 *      space กลางข้อความ → skip (มาจาก plugin อื่นเช่น autocomplete)
 *
 *   ❸  Re-entrancy guard (skipUntil 50ms)
 *      OO re-fire event หลัง InputText → text มี NBSP → ข้ามเอง
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Performance (~130-170ms/space)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   นี่คือเร็วที่สุดภายใต้ OO Plugin API
 *   callCommand inject ทดสอบ 3 ครั้ง — ใช้ไม่ได้:
 *   - callCommand sandbox ไม่ persist addEventListener หลัง return
 *   - thai-autocomplete ใช้ callCommand ได้เพราะแค่ focus() (one-shot)
 */
(function (window) {
  var NBSP = "\u00A0";

  var state = {
    skipUntil: 0,
  };

  window.Asc = window.Asc || {};
  window.Asc.plugin = window.Asc.plugin || {};

  window.Asc.plugin.init = function () {
    state.skipUntil = 0;
  };

  function execute(newText, delText) {
    state.skipUntil = Date.now() + 50;
    try {
      window.Asc.plugin.executeMethod("InputText", [newText, delText]);
    } catch (_e) {}
  }

  window.Asc.plugin.event_onInputHelperClear = function () {};

  window.Asc.plugin.event_onInputHelperInput = function (data) {
    try {
      if (!data || typeof data.text !== "string" || data.text.length === 0) return;

      var text = data.text;
      var firstSpace = text.indexOf(" ");

      if (firstSpace === -1) return;
      if (Date.now() < state.skipUntil) return;

      var len = text.length;

      // Only handle space at the very end (user typing).
      // Space in the middle means another plugin (e.g. autocomplete) inserted text —
      // the Full path (replace entire buffer) conflicts with other plugins and
      // can delete/corrupt surrounding text, so we skip it entirely.
      if (firstSpace === len - 1) {
        execute(NBSP, " ");
        return;
      }
    } catch (_e) {}
  };
})(window);
