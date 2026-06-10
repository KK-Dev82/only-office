// Minimal editor helpers for insertText and appendToDocumentEnd only (no panel)
(function () {
  var ITB = (window.ITB = window.ITB || {});
  ITB.editor = ITB.editor || {};

  // Return keyboard focus to the editor after an insert so the caret stays in the
  // document. Blur any focused control first (defensive), then ask the editor to focus.
  // "FocusEditor" is the real OnlyOffice method (g_inputContext.HtmlArea.focus); the old
  // "SetFocusToEditor" name does not exist and silently did nothing. Deferred so it runs
  // after the insert has finished (plugin message channel free).
  ITB.editor.focusEditor = function () {
    try {
      var ae = document.activeElement;
      if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
    } catch (eB) {}
    // Synchronously focus the editor input element (#area_id) via same-origin DOM, inside
    // the user-activation. The async executeMethod("FocusEditor") does not cross the iframe.
    try {
      var win = window;
      for (var i = 0; i < 8; i++) {
        var edoc = null;
        try { edoc = win.document; } catch (eDoc) { edoc = null; }
        if (edoc) {
          var el = edoc.getElementById("area_id");
          if (el && typeof el.focus === "function") {
            try { if (win.focus) win.focus(); } catch (eWf) {}
            try { el.focus({ preventScroll: true }); } catch (eFc) { try { el.focus(); } catch (eFc2) {} }
            break;
          }
        }
        if (!win.parent || win.parent === win) break;
        win = win.parent;
      }
    } catch (eDom) {}
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("FocusEditor", []);
      }
    } catch (eM) {}
  };

  function exec(name, params, cb) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.executeMethod) {
        window.Asc.plugin.executeMethod(name, params || [], cb);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function canCallCommand() {
    try {
      return Boolean(window.Asc && window.Asc.plugin && typeof window.Asc.plugin.callCommand === "function");
    } catch (e) {
      return false;
    }
  }

  /**
   * Feature flag: เปิด/ปิดการแทรก ZWSP ระหว่างคำไทย
   * - false (default): ไม่แทรก ZWSP — paste ข้อความไทยจาก transcription จะไม่มีสี่เหลี่ยมเล็กๆ ตอน export DOCX
   * - true: แทรก ZWSP ตาม Intl.Segmenter (พฤติกรรมเดิม)
   * เปลี่ยนค่าตรงนี้ถ้าต้องการเปิดใช้ ZWSP กลับมา
   */
  var ZWSP_INSERT_ENABLED = false;

  /** ตรวจว่ามีตัวอักษรไทย */
  function hasThaiCharacter(s) {
    return /[\u0E00-\u0E7F]/.test(String(s || ""));
  }

  /**
   * แปลง HTML จาก clipboard เป็นข้อความธรรมดา
   * @param {string} html - สตริง HTML (จาก getData('text/html'))
   * @param {{ preserveParagraphs: boolean }} opts - preserveParagraphs: true → คงย่อหน้า (\\n\\n), false → รวมเป็นบรรทัดเดียว (block → space)
   */
  function htmlToPlainText(html, opts) {
    if (html == null || typeof html !== "string" || !html.trim()) return "";
    opts = opts || {};
    var preserveParagraphs = opts.preserveParagraphs !== false;
    try {
      var doc = typeof document !== "undefined" && document.createElement("div");
      if (!doc) {
        // fallback: ลบ <style>...</style> และ tag อื่น ๆ ด้วย regex
        return String(html)
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      doc.innerHTML = html;
      // ลบ <style>, <script>, <head>, <meta>, <link>, <title> ก่อน extract text
      // เพื่อป้องกัน CSS/JS text จาก online editor อื่นหลุดเข้ามาเป็นข้อความ
      var unwanted = doc.querySelectorAll("style, script, head, meta, link, title");
      for (var i = 0; i < unwanted.length; i++) unwanted[i].remove();
      var text = doc.innerText || doc.textContent || "";
      text = String(text).trim();
      if (preserveParagraphs) {
        text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
      } else {
        text = text.replace(/\s+/g, " ").trim();
      }
      return text;
    } catch (e) {
      // fallback: ลบ <style>...</style> และ tag อื่น ๆ ด้วย regex
      return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  /**
   * แทรก ZWSP (U+200B) ระหว่างขอบเขตคำภาษาไทย — ให้ editor ตัดบรรทัดได้ดีโดยไม่ต้องใช้ space จริง
   * ใช้ Intl.Segmenter('th', { granularity: 'word' }) ถ้ามี
   */
  function addThaiWordBreaks(str) {
    if (str == null || typeof str !== "string" || !hasThaiCharacter(str)) return String(str || "");
    if (!ZWSP_INSERT_ENABLED) return str;
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        var segmenter = new Intl.Segmenter("th", { granularity: "word" });
        var segments = segmenter.segment(str);
        var out = [];
        for (var it of segments) {
          out.push(it.segment);
          if (it.isWordLike) out.push("\u200B");
        }
        return out.join("");
      }
    } catch (e) {}
    return str;
  }

  /**
   * แยกคำภาษาไทยด้วย Intl.Segmenter แล้วต่อด้วย Space (U+0020) — ให้ OnlyOffice มีจุดตัดบรรทัดชัดเจน (ประโยคเรียงต่อกัน)
   * ใช้เมื่อ ZWSP ทำให้ย่อหน้าดูไม่ต่อเนื่อง
   */
  function addThaiWordBreaksWithSpace(str) {
    if (str == null || typeof str !== "string" || !hasThaiCharacter(str)) return String(str || "");
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        var segmenter = new Intl.Segmenter("th", { granularity: "word" });
        var segments = segmenter.segment(str);
        var out = [];
        for (var it of segments) {
          if (out.length) out.push(" ");
          out.push(it.segment);
        }
        return out.join("");
      }
    } catch (e) {}
    return str;
  }

  /**
   * สำหรับ insertText/appendToDocumentEnd: ขึ้นบรรทัดใหม่เฉพาะที่ \\n
   * ถ้ามีภาษาไทย: แทนที่ space/tab ด้วย non-breaking space
   */
  function normalizeText(str) {
    if (str == null || typeof str !== "string") return "";
    var t = String(str).trim();
    if (!t) return "";
    if (!hasThaiCharacter(t)) return t;
    return t.replace(/ /g, "\u00A0");
  }

  /** สำหรับ bus: เมื่อได้แค่ text (ไม่มี html) ใช้ processPasteContent เหมือนกัน — ZWSP เท่านั้น, ไม่ hard wrap ไม่ NBSP */
  function formatPasteText(raw) {
    return processPasteContent({ text: raw, preserveParagraphs: true, useThaiWordBreaks: true });
  }

  /**
   * ประมวลผลเนื้อที่ paste: ถ้ามี text/html แปลงเป็น plain (คงย่อหน้า)
   * ถ้าเป็นภาษาไทย: แทรก ZWSP หรือ Space ระหว่างคำ (ตาม thaiWordBoundary) — ให้ editor มีจุดตัดบรรทัด
   * @param {{ html?: string, text?: string, preserveParagraphs?: boolean, useThaiWordBreaks?: boolean, thaiWordBoundary?: 'zwsp'|'space' }} opts
   */
  function processPasteContent(opts) {
    opts = opts || {};
    var html = opts.html;
    var text = opts.text;
    var preserveParagraphs = opts.preserveParagraphs !== false;
    var useThaiWordBreaks = opts.useThaiWordBreaks !== false;
    var thaiWordBoundary = opts.thaiWordBoundary === "space" ? "space" : "zwsp";
    var raw = "";
    // ใช้ text/plain ก่อนเสมอ — คง Tab (\t) จากต้นทาง
    if (text != null && String(text).trim()) {
      raw = String(text).trim();
    } else if (html && String(html).trim()) {
      raw = htmlToPlainText(html, { preserveParagraphs: preserveParagraphs });
    }
    if (!raw) return "";
    raw = raw.replace(/\r\n|\r/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
    if (hasThaiCharacter(raw) && useThaiWordBreaks) {
      raw = thaiWordBoundary === "space" ? addThaiWordBreaksWithSpace(raw) : addThaiWordBreaks(raw);
    }
    return raw;
  }

  ITB.editor.insertText = function (text, opts) {
    opts = opts || {};
    var t = opts.skipNormalize ? String(text || "").trim() : normalizeText(text);
    if (!t) return;

    function callCommandInsert() {
      if (!canCallCommand()) return false;
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__itb_insert = t;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var s = Asc.scope.__itb_insert || "";
              var doc = Api.GetDocument();
              if (doc && typeof doc.InsertText === "function") {
                doc.InsertText(s);
                return;
              }
              var p = Api.CreateParagraph();
              p.AddText(s);
              doc.InsertContent([p]);
            } catch (e) {}
          },
          false,
          true
        );
        ITB.editor.focusEditor();
        return true;
      } catch (e1) {
        return false;
      }
    }

    if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
      try {
        exec("PasteText", [t]);
        ITB.editor.focusEditor();
        return;
      } catch (e5) {}
    }
    if (callCommandInsert()) return;
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        exec("InsertText", [t]);
        ITB.editor.focusEditor();
      }
    } catch (e9) {}
  };

  ITB.editor.appendToDocumentEnd = function (text, opts) {
    var t = normalizeText(text);
    if (!t) return;
    opts = opts || {};
    var forceNewParagraph = opts.forceNewParagraph !== false;

    if (canCallCommand()) {
      try {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.__itb_append_text = t;
        window.Asc.scope.__itb_append_newpara = forceNewParagraph ? 1 : 0;
        window.Asc.plugin.callCommand(
          function () {
            try {
              var doc = Api.GetDocument();
              if (!doc) return;
              var body = doc.GetBody ? doc.GetBody() : null;
              if (!body) {
                var p = Api.CreateParagraph();
                p.AddText(Asc.scope.__itb_append_text || "");
                doc.InsertContent([p]);
                return;
              }
              var txt = Asc.scope.__itb_append_text || "";
              var newPara = Asc.scope.__itb_append_newpara ? true : false;
              if (newPara) {
                var p = body.AddParagraph();
                if (p && p.AddText) {
                  p.AddText(txt);
                } else {
                  doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                }
              } else {
                var last = null;
                try {
                  if (body.GetLastParagraph) last = body.GetLastParagraph();
                } catch (e0) {}
                if (last && last.AddText) {
                  last.AddText(txt);
                } else {
                  var p2 = body.AddParagraph();
                  if (p2 && p2.AddText) {
                    p2.AddText(txt);
                  } else {
                    doc.InsertContent([Api.CreateParagraph().AddText(txt)]);
                  }
                }
              }
            } catch (e) {}
          },
          false,
          true
        );
        return;
      } catch (e1) {}
    }
    ITB.editor.insertText(t);
  };

  /**
   * แทนที่ Space ด้วย nbsp (U+00A0) เมื่อ user กด Space
   * ลำดับการลอง: (1) GetCurrentWord + ReplaceCurrentWord ถ้า current word = " "
   *              (2) Undo + PasteText = override (ลบ space ที่เพิ่งกด แล้วใส่ nbsp)
   *              (3) InputText เป็น fallback
   */
  ITB.editor.replaceTrailingSpaceWithNbsp = function (cb) {
    function done(replaced) {
      try { cb && cb(!!replaced); } catch (e) {}
    }
    if (!window.Asc || !window.Asc.plugin || typeof window.Asc.plugin.executeMethod !== "function") {
      done(false);
      return;
    }
    function tryInputText() {
      try {
        exec("InputText", ["\u00A0", " "], function () { done(true); });
        return true;
      } catch (e) { return false; }
    }
    function tryUndoThenPaste() {
      try {
        exec("Undo", [], function () {
          exec("PasteText", ["\u00A0"], function () { done(true); });
        });
        return true;
      } catch (e) { return false; }
    }
    exec("GetCurrentWord", ["entirely"], function (word) {
      var w = String(word || "");
      if (w === " ") {
        exec("ReplaceCurrentWord", ["\u00A0", "entirely"], function () { done(true); });
        return;
      }
      if (w === "" || (w.length <= 1 && /\s/.test(w))) {
        tryUndoThenPaste();
        return;
      }
      tryInputText();
    });
  };

  // ค่าเริ่มต้นสำหรับ paste: คงย่อหน้า (เหมาะกับ มาตรา/เลขข้อ), เปิด ZWSP สำหรับไทย
  var pasteOpts = { preserveParagraphs: true, useThaiWordBreaks: true };

  function onPaste(e) {
    var dt = e.clipboardData;
    if (!dt) return;
    var html = dt.getData("text/html");
    var text = dt.getData("text/plain");
    var processed = processPasteContent({
      html: html || undefined,
      text: text || undefined,
      preserveParagraphs: pasteOpts.preserveParagraphs,
      useThaiWordBreaks: pasteOpts.useThaiWordBreaks,
    });
    if (!processed) return;
    var rawText = (text || "").trim();
    if (processed === rawText && !html) return;
    e.preventDefault();
    e.stopPropagation();
    ITB.editor.insertText(processed);
  }
  try {
    document.addEventListener("paste", onPaste, true);
  } catch (err) {}

  ITB.editor.formatPasteText = formatPasteText;
  ITB.editor.processPasteContent = processPasteContent;
  ITB.editor.htmlToPlainText = htmlToPlainText;
  ITB.editor.addThaiWordBreaks = addThaiWordBreaks;
  ITB.editor.pasteOpts = pasteOpts;
})();
