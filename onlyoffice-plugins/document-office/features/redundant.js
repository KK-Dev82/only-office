// Redundant words feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  function renderSaved() {
    var root = DO.$("redundantList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.redundant || [];
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var word = String(w.word || w.Word || w || "").trim();
      if (!word) continue;

      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = word;

      var actions = document.createElement("div");
      actions.className = "doItemActions";
      var btnDel = document.createElement("button");
      btnDel.textContent = "Delete";
      btnDel.addEventListener(
        "click",
        (function (idOrWord) {
          return function () {
            DO.store.redundant = (DO.store.redundant || []).filter(function (x) {
              var xw = String(x.word || x.Word || x || "");
              var xid = x && x.id ? String(x.id) : "";
              return xid ? xid !== String(idOrWord) : xw !== String(idOrWord);
            });
            DO.persist.redundant();
            renderSaved();
            DO.debugLog("redundant_delete", { idOrWord: idOrWord });
          };
        })(w && w.id ? w.id : word)
      );

      actions.appendChild(btnDel);
      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มีคำฟุ่มเฟือย";
      root.appendChild(empty);
    }
  }

  function renderMatches(matches) {
    var root = DO.$("redundantResults");
    if (!root) return;
    root.innerHTML = "";
    matches = matches || [];

    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var div = document.createElement("div");
      div.className = "doItem";
      var row = document.createElement("div");
      row.className = "doItemRow";
      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = m.word + " (" + m.count + ")";
      row.appendChild(text);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!matches.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ไม่พบคำฟุ่มเฟือยในข้อความ";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var el = DO.$("redundantNewWord");
    var word = el ? String(el.value || "").trim() : "";
    if (!word) return;

    DO.store.redundant = DO.store.redundant || [];
    var lw = word.toLowerCase();
    for (var i = 0; i < DO.store.redundant.length; i++) {
      var existing = String(DO.store.redundant[i].word || DO.store.redundant[i].Word || DO.store.redundant[i] || "").toLowerCase();
      if (existing === lw) {
        DO.debugLog("redundant_add_skip_exists", { word: word });
        return;
      }
    }
    DO.store.redundant.unshift({ id: DO.newId("redundant"), word: word, scope: "Local" });
    DO.persist.redundant();
    if (el) el.value = "";
    renderSaved();
    DO.debugLog("redundant_add", { word: word });
  }

  function reload() {
    DO.store.redundant = DO.storageLoad(DO.STORAGE_KEYS.redundant, []);
    renderSaved();
    DO.debugLog("redundantReload", { count: (DO.store.redundant || []).length });
  }

  function checkInCurrentContext() {
    var modeEl = DO.$("checkMode");
    var mode = (modeEl && modeEl.value) || (DO.pluginOptions && DO.pluginOptions.defaultCheckMode) || "paragraph";
    DO.editor.getContext(mode, function (ctx) {
      var text = (ctx && ctx.text) ? String(ctx.text) : "";
      var words = DO.store.redundant || [];
      var matches = [];

      var lowerText = text.toLowerCase();
      for (var i = 0; i < words.length; i++) {
        var w = String(words[i].word || words[i].Word || words[i] || "").trim();
        if (!w) continue;
        var lw = w.toLowerCase();
        var count = 0;
        var pos = 0;
        while (true) {
          var idx = lowerText.indexOf(lw, pos);
          if (idx === -1) break;
          count++;
          pos = idx + lw.length;
          if (count > 200) break;
        }
        if (count > 0) matches.push({ word: w, count: count });
      }

      matches.sort(function (a, b) { return b.count - a.count; });
      renderMatches(matches);
      DO.debugLog("redundant_check", { mode: mode, matches: matches.length });
    });
  }

  function bind() {
    var redundantReload = DO.$("redundantReload");
    if (redundantReload) redundantReload.addEventListener("click", function () { reload(); });

    var redundantCheck = DO.$("redundantCheck");
    if (redundantCheck) redundantCheck.addEventListener("click", function () { checkInCurrentContext(); });

    var redundantAdd = DO.$("redundantAdd");
    if (redundantAdd) redundantAdd.addEventListener("click", function () { addFromUi(); });
  }

  DO.features.redundant = {
    bind: bind,
    renderSaved: renderSaved,
    reload: reload,
  };
})();

