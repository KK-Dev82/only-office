// Dictionary feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

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
    if (!word) return;

    DO.store.dictionary = DO.store.dictionary || [];
    var lw = word.toLowerCase();
    for (var i = 0; i < DO.store.dictionary.length; i++) {
      if (String(DO.store.dictionary[i].word || "").toLowerCase() === lw) {
        DO.debugLog("dict_add_skip_exists", { word: word });
        return;
      }
    }

    DO.store.dictionary.unshift({ id: DO.newId("dict"), word: word, description: desc, scope: "Local" });
    DO.persist.dictionary();
    if (wordEl) wordEl.value = "";
    if (descEl) descEl.value = "";
    renderSaved();
    DO.debugLog("dict_add", { word: word });
  }

  function bind() {
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
      });
    }

    var dictAdd = DO.$("dictAdd");
    if (dictAdd) dictAdd.addEventListener("click", function () { addFromUi(); });
  }

  DO.features.dictionary = {
    bind: bind,
    renderSaved: renderSaved,
    search: doSearch,
  };
})();

