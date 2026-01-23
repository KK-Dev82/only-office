// Dictionary feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  // Ensure namespace exists before attaching helpers
  DO.features.dictionary = DO.features.dictionary || {};
  DO.state = DO.state || {};
  DO.state._dictUi = DO.state._dictUi || {
    lastToken: "",
    items: [],
    selectedIndex: 0,
    keyBound: false,
  };

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderHighlight(text, prefix) {
    var t = String(text || "");
    var p = String(prefix || "");
    if (!p) return escHtml(t);
    var idx = t.toLowerCase().indexOf(p.toLowerCase());
    if (idx < 0) return escHtml(t);
    return (
      escHtml(t.slice(0, idx)) +
      '<span class="doHL">' +
      escHtml(t.slice(idx, idx + p.length)) +
      "</span>" +
      escHtml(t.slice(idx + p.length))
    );
  }

  function renderResults(items) {
    var root = DO.$("dictResults");
    if (!root) return;
    root.innerHTML = "";
    items = items || [];

    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = w.word || w.Word || "";
      if (!word) continue;

      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      var desc = w.description || w.Description || "";
      text.textContent = word + (desc ? " — " + desc : "");

      var actions = document.createElement("div");
      actions.className = "doItemActions";
      var btn = document.createElement("button");
      btn.textContent = "Insert";
      btn.addEventListener(
        "click",
        (function (t) {
          return function () {
            DO.editor.insertText(t);
          };
        })(word)
      );
      actions.appendChild(btn);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ไม่พบคำ";
      root.appendChild(empty);
    }
  }

  function insertWord(fullWord) {
    try {
      var st = DO.state._dictUi || {};
      var tokenNow = String(st.lastToken || "").trim();
      var full = String(fullWord || "").trim();
      if (!full) return;

      // If selection exists, replace it; else insert suffix (like autocomplete)
      if (DO.editor && typeof DO.editor.getSelectedText === "function") {
        DO.editor.getSelectedText(function (sel) {
          try {
            var selected = String(sel || "").trim();
            if (selected) {
              DO.editor.replaceSelectionText(full);
              try {
                // Clear suggestions after successful insert/replace
                DO.features.dictionary.renderInlineSuggestions("", [], 0);
              } catch (e0) {}
              return;
            }
            if (tokenNow && full.toLowerCase().indexOf(tokenNow.toLowerCase()) === 0) {
              var suffix = full.slice(tokenNow.length);
              if (suffix) DO.editor.insertText(suffix);
              try {
                DO.features.dictionary.renderInlineSuggestions("", [], 0);
              } catch (e1) {}
              return;
            }
            DO.editor.insertText(full);
            try {
              DO.features.dictionary.renderInlineSuggestions("", [], 0);
            } catch (e2) {}
          } catch (e0) {}
        });
        return;
      }

      if (tokenNow && full.toLowerCase().indexOf(tokenNow.toLowerCase()) === 0) {
        var suffix2 = full.slice(tokenNow.length);
        if (suffix2) DO.editor.insertText(suffix2);
      } else {
        DO.editor.insertText(full);
      }
      try {
        DO.features.dictionary.renderInlineSuggestions("", [], 0);
      } catch (e3) {}
    } catch (e) {}
  }

  function bindSuggestionKeysOnce() {
    try {
      if (DO.state._dictUi.keyBound) return;
      DO.state._dictUi.keyBound = true;

      document.addEventListener(
        "keydown",
        function (e) {
          try {
            var st = DO.state._dictUi || {};
            var items = st.items || [];
            var key = e && e.key ? String(e.key) : "";

            // ESC should cancel suggestions even if list is empty (safe no-op)
            if (key === "Escape") {
              try {
                st.selectedIndex = 0;
                st.items = [];
                st.lastToken = "";
              } catch (e0) {}
              try {
                DO.features.dictionary.renderInlineSuggestions("", [], 0);
              } catch (e1) {}
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            if (!items.length) return;

            // Only handle when focus is inside plugin iframe (panel)
            var ae = document.activeElement;
            if (!ae) return;

            if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Tab") return;

            // Prevent default tab navigation when suggestions active
            e.preventDefault();
            e.stopPropagation();

            if (key === "ArrowDown" || key === "Tab") {
              st.selectedIndex = (Number(st.selectedIndex || 0) + 1) % items.length;
              DO.features.dictionary.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "ArrowUp") {
              st.selectedIndex = (Number(st.selectedIndex || 0) - 1 + items.length) % items.length;
              DO.features.dictionary.renderInlineSuggestions(st.lastToken, items, st.selectedIndex);
              return;
            }
            if (key === "Enter") {
              var pick = items[Number(st.selectedIndex || 0)] || "";
              insertWord(pick);
              return;
            }
          } catch (e0) {}
        },
        true
      );
    } catch (e) {}
  }

  // Render "inline hints" into dictResults (no InputHelper)
  // token: current prefix, items: array of matched full words
  function renderInlineSuggestions(token, items, selectedIndex) {
    try {
      var root = DO.$("dictResults");
      if (!root) return;

      token = String(token || "").trim();
      items = items || [];

      var st = DO.state._dictUi || (DO.state._dictUi = {});
      var hadItems = Boolean(st.items && st.items.length);
      var prevToken = String(st.lastToken || "");
      st.lastToken = token;
      st.items = items.slice(0);
      if (selectedIndex === undefined || selectedIndex === null) selectedIndex = st.selectedIndex || 0;
      st.selectedIndex = Math.max(0, Math.min(Number(selectedIndex || 0), Math.max(0, items.length - 1)));

      root.innerHTML = "";

      if (!token || token.length < 2) {
        var hint = document.createElement("div");
        hint.className = "doMuted";
        hint.textContent = "พิมพ์คำในเอกสาร แล้วดูคำแนะนำที่นี่ (กด ↑/↓/Tab เพื่อเลือก, Enter เพื่อ Insert)";
        root.appendChild(hint);
        return;
      }

      if (!items.length) {
        var empty = document.createElement("div");
        empty.className = "doMuted";
        empty.textContent = "ไม่พบคำแนะนำสำหรับ: " + token;
        root.appendChild(empty);
        return;
      }

      // Build tip via DOM (avoid innerHTML quoting/encoding issues in some builds)
      var tip = document.createElement("div");
      tip.className = "doMuted";
      tip.appendChild(document.createTextNode('คำแนะนำสำหรับ "'));
      var sp = document.createElement("span");
      sp.className = "doHL";
      sp.textContent = token;
      tip.appendChild(sp);
      tip.appendChild(document.createTextNode('" - กด Up/Down/Tab เลือก, Enter เพื่อ Insert'));
      root.appendChild(tip);

      for (var i = 0; i < items.length; i++) {
        var word = String(items[i] || "");
        if (!word) continue;

        var div = document.createElement("div");
        div.className = "doItem doSuggestItem" + (i === st.selectedIndex ? " doIsSelected" : "");

        var row = document.createElement("div");
        row.className = "doItemRow";

        var text = document.createElement("div");
        text.className = "doItemText";
        text.innerHTML = renderHighlight(word, token);

        var actions = document.createElement("div");
        actions.className = "doItemActions";

        var btn = document.createElement("button");
        btn.textContent = "Insert";
        btn.addEventListener(
          "click",
          (function (t) {
            return function () {
              try {
                st.selectedIndex = i;
              } catch (e0) {}
              insertWord(t);
            };
          })(word)
        );

        actions.appendChild(btn);
        row.appendChild(text);
        row.appendChild(actions);
        div.appendChild(row);

        // click row selects item
        div.addEventListener(
          "click",
          (function (idx) {
            return function () {
              try {
                st.selectedIndex = idx;
                DO.features.dictionary.renderInlineSuggestions(st.lastToken, st.items, st.selectedIndex);
              } catch (e0) {}
            };
          })(i)
        );

        root.appendChild(div);
      }

      bindSuggestionKeysOnce();

      // Best-effort auto-focus (so user can use Arrow/Tab/Enter without clicking panel)
      // Note: browser/host may block focus stealing; this is safe and will no-op if denied.
      try {
        var shouldFocus = (!hadItems && items.length) || (prevToken !== token && items.length);
        if (shouldFocus) {
          try {
            var p = window.Asc && window.Asc.plugin;
            if (p && typeof p.executeMethod === "function") {
              // Some builds support this; ignore failures.
              try { p.executeMethod("SetFocusToPlugin", []); } catch (e0) {}
            }
          } catch (e1) {}
          try { window.focus(); } catch (e2) {}
          try {
            var trap = document.getElementById("doFocusTrap");
            if (trap && trap.focus) trap.focus({ preventScroll: true });
          } catch (e3) {}
        }
      } catch (e4) {}
    } catch (e1) {}
  }

  DO.features.dictionary.renderInlineSuggestions = renderInlineSuggestions;

  function renderSaved() {
    var root = DO.$("dictSavedList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.dictionary || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = w.word || w.Word || "";
      if (!word) continue;

      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = word + ((w.description || w.Description) ? " — " + (w.description || w.Description) : "");

      var actions = document.createElement("div");
      actions.className = "doItemActions";
      var btnInsert = document.createElement("button");
      btnInsert.textContent = "Insert";
      btnInsert.addEventListener(
        "click",
        (function (t) {
          return function () {
            DO.editor.insertText(t);
          };
        })(word)
      );

      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener(
        "click",
        (function (id) {
          return function () {
            DO.store.dictionary = (DO.store.dictionary || []).filter(function (x) {
              return String(x.id) !== String(id);
            });
            DO.persist.dictionary();
            renderSaved();
            DO.debugLog("dict_delete", { id: id });
          };
        })(w.id)
      );

      actions.appendChild(btnInsert);
      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มีคำที่บันทึกไว้";
      root.appendChild(empty);
    }
  }

  function doSearch() {
    var qEl = DO.$("dictQuery");
    var q = qEl ? String(qEl.value || "").trim() : "";
    if (!q) return;

    var items = (DO.store.dictionary || [])
      .filter(function (w) {
        var word = String(w.word || w.Word || "").toLowerCase();
        return word.indexOf(q.toLowerCase()) >= 0;
      })
      .slice(0, 20)
      .map(function (w) {
        return { word: w.word || w.Word || "", description: w.description || w.Description || "" };
      });

    renderResults(items);
    DO.debugLog("dict_search", { q: q, results: items.length });
  }

  function addFromUi() {
    var wordEl = DO.$("dictNewWord");
    var descEl = DO.$("dictNewDesc");
    var word = wordEl ? String(wordEl.value || "").trim() : "";
    var desc = descEl ? String(descEl.value || "").trim() : "";
    if (!word) {
      try {
        DO.debugLog("dict_add_empty");
        if (DO.setStatus) DO.setStatus("กรุณากรอกคำศัพท์");
      } catch (e0) {}
      return;
    }

    DO.store.dictionary = DO.store.dictionary || [];
    var lw = word.toLowerCase();
    for (var i = 0; i < DO.store.dictionary.length; i++) {
      if (String(DO.store.dictionary[i].word || "").toLowerCase() === lw) {
        DO.debugLog("dict_add_skip_exists", { word: word });
        try {
          if (DO.setStatus) DO.setStatus('มีคำนี้แล้ว: "' + word + '"');
        } catch (e0) {}
        return;
      }
    }

    DO.store.dictionary.unshift({ id: DO.newId("dict"), word: word, description: desc, scope: "Local" });
    DO.persist.dictionary();
    if (wordEl) wordEl.value = "";
    if (descEl) descEl.value = "";
    renderSaved();
    DO.debugLog("dict_add", { word: word });
    try {
      if (DO.setStatus) DO.setStatus('เพิ่มแล้ว: "' + word + '"');
    } catch (e1) {}
    try {
      // close card after add
      var card = DO.$("dictAddCard");
      if (card) card.classList.add("doIsHidden");
    } catch (e2) {}
  }

  function bind() {
    try {
      if (DO.state._dictUi && DO.state._dictUi.bound) return;
      if (DO.state._dictUi) DO.state._dictUi.bound = true;
    } catch (e0) {}

    var dictSearch = DO.$("dictSearch");
    if (dictSearch) dictSearch.addEventListener("click", function () { doSearch(); });

    var dictQuery = DO.$("dictQuery");
    if (dictQuery) {
      dictQuery.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            doSearch();
          }
        } catch (e0) {}
      });
    }

    var dictToggleAdd = DO.$("dictToggleAdd");
    if (dictToggleAdd) {
      dictToggleAdd.addEventListener("click", function () {
        var card = DO.$("dictAddCard");
        if (!card) return;
        if (card.classList.contains("doIsHidden")) card.classList.remove("doIsHidden");
        else card.classList.add("doIsHidden");
        DO.debugLog("dict_toggle_add", { open: !card.classList.contains("doIsHidden") });
        try {
          if (!card.classList.contains("doIsHidden")) {
            var w = DO.$("dictNewWord");
            if (w && w.focus) w.focus();
          }
        } catch (e0) {}
      });
    }

    var dictAdd = DO.$("dictAdd");
    if (dictAdd) dictAdd.addEventListener("click", function () { addFromUi(); });

    // Enter in word/desc triggers add
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

  // Do not replace the whole object (other modules may attach to it)
  DO.features.dictionary.bind = bind;
  DO.features.dictionary.renderSaved = renderSaved;
  DO.features.dictionary.search = doSearch;
})();

