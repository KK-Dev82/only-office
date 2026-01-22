// Macro Window feature: big textarea + batch create
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";
  var STORAGE_KEY = "do:v1:macroWindowId";

  function expandTokens(text) {
    var t = String(text || "");
    if (!t) return "";
    try {
      t = t.replace(/\[(tab)\]/gi, "\t");
      t = t.replace(/\[(space)\]/gi, " ");
      t = t.replace(/\[(nl|newline|enter)\]/gi, "\n");
    } catch (e) {}
    return t;
  }

  function splitCommaEscaped(input) {
    var s = String(input || "");
    if (!s) return [];
    try {
      s = s.replace(/\r\n/g, "\n").replace(/\n/g, ",");
    } catch (e0) {}
    var out = [];
    var cur = "";
    var esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (esc) {
        cur += ch;
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);

    var cleaned = [];
    for (var j = 0; j < out.length; j++) {
      var part = String(out[j] == null ? "" : out[j]).trim();
      if (!part) continue;
      part = part.replace(/\\,/g, ",");
      cleaned.push(part);
    }
    return cleaned;
  }

  function replaceAllSafe(s, find, rep) {
    try {
      return String(s || "").split(String(find)).join(String(rep));
    } catch (e) {
      return String(s || "");
    }
  }

  function defaultNameFromText(text) {
    try {
      var compact = expandTokens(text).replace(/\s+/g, " ").trim();
      return compact ? compact.slice(0, 24) : "Macro";
    } catch (e) {
      return "Macro";
    }
  }

  function appendToTextArea(el, s) {
    if (!el) return;
    try {
      var insert = String(s || "");
      var start = el.selectionStart != null ? el.selectionStart : el.value.length;
      var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
      var before = el.value.slice(0, start);
      var after = el.value.slice(end);
      el.value = before + insert + after;
      var pos = start + insert.length;
      el.selectionStart = el.selectionEnd = pos;
      el.focus();
    } catch (e) {
      try {
        el.value = String(el.value || "") + String(s || "");
      } catch (e2) {}
    }
  }

  function closeWindow() {
    try {
      // CloseWindow expects windowID (returned from ShowWindow)
      var winId = "";
      try {
        var info = window.Asc && window.Asc.plugin && window.Asc.plugin.info;
        winId = String(
          (info && (info.windowID || info.windowId || info.id)) ||
            localStorage.getItem(STORAGE_KEY) ||
            ""
        );
      } catch (eId) {
        try { winId = String(localStorage.getItem(STORAGE_KEY) || ""); } catch (eId2) { winId = ""; }
      }

      if (winId && window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("CloseWindow", [winId]);
        return;
      }
    } catch (e0) {}
    try {
      window.close();
    } catch (e1) {}
  }

  function save() {
    var itemsEl = DO.$("macroWinItems");

    var itemsRaw = itemsEl ? String(itemsEl.value || "") : "";

    if (!itemsRaw) {
      DO.setStatus("กรอกข้อมูลก่อน");
      setTimeout(function () { DO.setStatus("ready"); }, 900);
      return;
    }

    var items = splitCommaEscaped(itemsRaw);
    if (!items.length) {
      DO.setStatus("ไม่มีรายการที่สร้างได้");
      setTimeout(function () { DO.setStatus("ready"); }, 900);
      return;
    }

    DO.store.macros = DO.storageLoad(DO.STORAGE_KEYS.macros, []);

    var created = 0;
    for (var i = 0; i < items.length; i++) {
      var insertText = String(items[i] || "");
      if (!insertText.trim()) continue;

      // name is optional; derive from text
      var name = defaultNameFromText(insertText);

      DO.store.macros.unshift({
        id: DO.newId("macro"),
        name: name,
        text: insertText,
        source: "local",
        scope: "Local",
        isActive: true
      });
      created++;
    }

    if (!created) {
      DO.setStatus("ไม่มีรายการที่สร้างได้ (ตรวจสอบข้อมูล)");
      setTimeout(function () { DO.setStatus("ready"); }, 900);
      return;
    }

    DO.persist.macros();
    DO.debugLog("macro_window_saved", { created: created });
    DO.setStatus("saved");
    setTimeout(function () { closeWindow(); }, 120);
  }

  function bind() {
    var cancel = DO.$("macroWinCancel");
    if (cancel) cancel.addEventListener("click", function () { closeWindow(); });
    var saveBtn = DO.$("macroWinSave");
    if (saveBtn) saveBtn.addEventListener("click", function () { save(); });

    var textEl = DO.$("macroWinItems");
    if (textEl) {
      // Capture Tab before host steals focus (panelRight/window can intercept)
      textEl.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Tab") {
            e.preventDefault();
            try {
              e.stopPropagation && e.stopPropagation();
              e.stopImmediatePropagation && e.stopImmediatePropagation();
            } catch (eStop) {}
            appendToTextArea(textEl, "\t");
            return;
          }
          if (e && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            save();
            return;
          }
          if (e && e.key === "Escape") {
            e.preventDefault();
            closeWindow();
            return;
          }
        } catch (e0) {}
      }, true);
    }

    var bTab = DO.$("macroWinInsertTab");
    if (bTab) bTab.addEventListener("click", function () { appendToTextArea(textEl, "[tab]"); });
    var bSpace = DO.$("macroWinInsertSpace");
    if (bSpace) bSpace.addEventListener("click", function () { appendToTextArea(textEl, "[space]"); });
    var bNl = DO.$("macroWinInsertNewline");
    if (bNl) bNl.addEventListener("click", function () { appendToTextArea(textEl, "[nl]"); });
    var bColon = DO.$("macroWinInsertColonSpace");
    if (bColon) bColon.addEventListener("click", function () { appendToTextArea(textEl, ": "); });

    try {
      if (textEl) textEl.focus();
    } catch (e) {}
  }

  DO.features.macrosWindow = {
    bind: bind,
    save: save,
    closeWindow: closeWindow
  };
})();

