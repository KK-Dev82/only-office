// Dictionary feature (local-first)
// - UI เหลือเฉพาะ: เพิ่มคำ + แสดงรายการ
// - ไม่ใช้ InputHelper / ไม่ใช้ค้นหา
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  DO.features.dictionary = DO.features.dictionary || {};
  DO.state = DO.state || {};
  DO.state._dictUi = DO.state._dictUi || { bound: false };

  function normalizeScope(scope) {
    var s = String(scope || "").trim();
    return s || "Local";
  }

  function isLocalScope(scope) {
    return normalizeScope(scope) === "Local";
  }

  // Defensive no-op hooks (inputhelper.js รุ่นเก่าอาจยังเรียกอยู่)
  DO.features.dictionary.renderInlineSuggestions = DO.features.dictionary.renderInlineSuggestions || function () {};
  DO.features.dictionary.handleLiveToken = DO.features.dictionary.handleLiveToken || function () {};
  DO.features.dictionary.insertWord = DO.features.dictionary.insertWord || function (t) {
    try { if (DO.editor && DO.editor.insertText) DO.editor.insertText(String(t || "")); } catch (e) {}
  };

  function iconSvg(type) {
    // Inline SVG (no external deps)
    if (type === "insert") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M5 20h14v-2H5v2zm7-18c-.55 0-1 .45-1 1v9.17l-3.59-3.58L6 10l6 6 6-6-1.41-1.41L13 12.17V3c0-.55-.45-1-1-1z"/>' +
        "</svg>"
      );
    }
    if (type === "delete") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zm-5 2h16v2H4V6z"/>' +
        "</svg>"
      );
    }
    return "";
  }

  function makeIconButton(opts) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doIconBtn";
    try { btn.setAttribute("aria-label", String(opts.ariaLabel || "")); } catch (e0) {}
    try { btn.title = String(opts.title || opts.ariaLabel || ""); } catch (e1) {}
    btn.innerHTML = String(opts.svg || "");
    if (typeof opts.onClick === "function") btn.addEventListener("click", opts.onClick);
    return btn;
  }

  function renderSaved() {
    var root = DO.$("dictSavedList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.dictionary || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i] || {};
      var word = String(w.word || w.Word || "").trim();
      if (!word) continue;

      var scope = normalizeScope(w.scope || w.Scope);
      var local = isLocalScope(scope);
      if (!local) continue; // แสดงเฉพาะ Local ตาม requirement
      var desc = String(w.description || w.Description || "").trim();

      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = word + (desc ? " — " + desc : "");

      var actions = document.createElement("div");
      actions.className = "doItemActions doItemActionsUnder";
      actions.appendChild(
        makeIconButton({
          ariaLabel: "Insert",
          title: "Insert",
          svg: iconSvg("insert"),
          onClick: (function (t) {
            return function () {
              try { DO.editor.insertText(t); } catch (e0) {}
            };
          })(word),
        })
      );
      actions.appendChild(
        makeIconButton({
          ariaLabel: "Delete",
          title: "Delete",
          svg: iconSvg("delete"),
          onClick: (function (id) {
            return function () {
              DO.store.dictionary = (DO.store.dictionary || []).filter(function (x) {
                return String(x.id) !== String(id);
              });
              DO.persist.dictionary();
              renderSaved();
              try { DO.debugLog && DO.debugLog("dict_delete", { id: id }); } catch (e0) {}
            };
          })(w.id),
        })
      );

      row.appendChild(text);
      div.appendChild(row);
      div.appendChild(actions);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มีคำที่บันทึกไว้";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var wordEl = DO.$("dictNewWord");
    var descEl = DO.$("dictNewDesc");
    var word = wordEl ? String(wordEl.value || "").trim() : "";
    var desc = descEl ? String(descEl.value || "").trim() : "";
    if (!word) {
      try { if (DO.setStatus) DO.setStatus("กรุณากรอกคำศัพท์"); } catch (e0) {}
      try { DO.debugLog && DO.debugLog("dict_add_empty"); } catch (e1) {}
      return;
    }

    DO.store.dictionary = DO.store.dictionary || [];
    var lw = word.toLowerCase();
    for (var i = 0; i < DO.store.dictionary.length; i++) {
      if (String(DO.store.dictionary[i].word || "").trim().toLowerCase() === lw) {
        try { if (DO.setStatus) DO.setStatus('มีคำนี้แล้ว: "' + word + '"'); } catch (e0) {}
        try { DO.debugLog && DO.debugLog("dict_add_skip_exists", { word: word }); } catch (e1) {}
        return;
      }
    }

    DO.store.dictionary.unshift({ id: DO.newId("dict"), word: word, description: desc, scope: "Local" });
    DO.persist.dictionary();
    if (wordEl) wordEl.value = "";
    if (descEl) descEl.value = "";
    renderSaved();
    try { if (DO.setStatus) DO.setStatus('เพิ่มแล้ว: "' + word + '"'); } catch (e0) {}
    try { DO.debugLog && DO.debugLog("dict_add", { word: word }); } catch (e1) {}
    try {
      var card = DO.$("dictAddCard");
      if (card) card.classList.add("doIsHidden");
    } catch (e2) {}
  }

  function bind() {
    try {
      if (DO.state._dictUi && DO.state._dictUi.bound) return;
      DO.state._dictUi = DO.state._dictUi || {};
      DO.state._dictUi.bound = true;
    } catch (e0) {}

    var dictAdd = DO.$("dictAdd");
    if (dictAdd) dictAdd.addEventListener("click", function () { addFromUi(); });

    var dictNewWord = DO.$("dictNewWord");
    if (dictNewWord) {
      dictNewWord.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }
    var dictNewDesc = DO.$("dictNewDesc");
    if (dictNewDesc) {
      dictNewDesc.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }
  }

  DO.features.dictionary.bind = bind;
  DO.features.dictionary.renderSaved = renderSaved;
})();

