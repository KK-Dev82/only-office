// Clipboard feature (local-first)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};

  function iconSvg(type) {
    // minimal inline svg icons (currentColor)
    if (type === "insert") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M5 20h14v-2H5v2zm7-16l-5 5h3v6h4v-6h3l-5-5z"></path>' +
        "</svg>"
      );
    }
    if (type === "delete") {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"></path>' +
        "</svg>"
      );
    }
    // edit
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"></path>' +
      "</svg>"
    );
  }

  function makeIconButton(opts) {
    var b = document.createElement("button");
    b.className = "doIconBtn";
    try {
      if (opts && opts.ariaLabel) b.setAttribute("aria-label", String(opts.ariaLabel));
      if (opts && opts.title) b.title = String(opts.title);
    } catch (e0) {}
    try {
      b.innerHTML = String((opts && opts.svg) || "");
    } catch (e1) {
      b.textContent = String((opts && opts.fallbackText) || "");
    }
    if (opts && typeof opts.onClick === "function") b.addEventListener("click", opts.onClick);
    return b;
  }

  function copyToClipboard(text) {
    var t = String(text || "");
    if (!t) return Promise.resolve(false);

    // Preferred modern API (works in secure contexts + user gesture)
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard
          .writeText(t)
          .then(function () { return true; })
          .catch(function () { return fallbackCopy(t); });
      }
    } catch (e0) {}

    return fallbackCopy(t);
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = String(text || "");
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = false;
      try {
        ok = document.execCommand && document.execCommand("copy");
      } catch (e1) {
        ok = false;
      }
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function render() {
    var root = DO.$("clipList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.clipboard || [];
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      if (!c || !c.text) continue;

      var isLocal = false;
      try {
        isLocal = String(c.scope || "").toLowerCase() === "local";
      } catch (eLocal) {
        isLocal = false;
      }

      var div = document.createElement("div");
      div.className = "doItem";
      try {
        div.style.cursor = "copy";
        div.title = "คลิกเพื่อคัดลอก (Ctrl+C)";
      } catch (e0) {}
      var row = document.createElement("div");
      row.className = "doItemRow";

      var text = document.createElement("div");
      text.className = "doItemText";
      text.textContent = c.text;

      var actions = document.createElement("div");
      actions.className = "doItemActions";

      // Click item = copy text (like Ctrl+C), then user can Ctrl+V in document.
      // Do not trigger when clicking buttons inside the item.
      div.addEventListener(
        "click",
        (function (textToCopy, itemId) {
          return function (ev) {
            try {
              var target = ev && ev.target ? ev.target : null;
              var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
              if (tag === "button") return;
            } catch (e0) {}
            copyToClipboard(textToCopy).then(function (ok) {
              try {
                DO.debugLog("clip_copy", { id: itemId, ok: ok, textLen: String(textToCopy || "").length });
              } catch (e1) {}
              try {
                if (DO.setStatus) DO.setStatus(ok ? "copied" : "copy failed");
                setTimeout(function () {
                  try { DO.setStatus("ready"); } catch (e0) {}
                }, 800);
              } catch (e2) {}
            });
          };
        })(c.text, c.id)
      );

      actions.appendChild(
        makeIconButton({
          ariaLabel: "Insert",
          title: "Insert",
          svg: iconSvg("insert"),
          onClick: (function (t, id) {
            return function () {
              DO.debugLog("clip_insert", { id: id, textLen: String(t || "").length });
              DO.editor.insertText(t);
            };
          })(c.text, c.id),
        })
      );

      if (isLocal) {
        actions.appendChild(
          makeIconButton({
            ariaLabel: "Edit",
            title: "Edit",
            svg: iconSvg("edit"),
            onClick: (function (id, curText) {
              return function () {
                var next = "";
                try {
                  next = prompt("แก้ไขข้อความ", String(curText || ""));
                } catch (e0) {
                  next = "";
                }
                if (next === null) return; // cancel
                next = String(next || "").trim();
                if (!next) {
                  try {
                    DO.setStatus("ต้องมีข้อความ");
                    setTimeout(function () { DO.setStatus("ready"); }, 800);
                  } catch (e1) {}
                  return;
                }
                DO.store.clipboard = (DO.store.clipboard || []).map(function (x) {
                  if (!x) return x;
                  if (String(x.id) !== String(id)) return x;
                  var copy = {};
                  for (var k in x) copy[k] = x[k];
                  copy.text = next;
                  return copy;
                });
                DO.persist.clipboard();
                render();
                DO.debugLog("clip_edit", { id: id, textLen: next.length });
              };
            })(c.id, c.text),
          })
        );

        actions.appendChild(
          makeIconButton({
            ariaLabel: "Delete",
            title: "Delete",
            svg: iconSvg("delete"),
            onClick: (function (id) {
              return function () {
                DO.store.clipboard = (DO.store.clipboard || []).filter(function (x) {
                  return String(x.id) !== String(id);
                });
                DO.persist.clipboard();
                render();
                DO.debugLog("clip_delete", { id: id });
              };
            })(c.id),
          })
        );
      }

      row.appendChild(text);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มี clipboard";
      root.appendChild(empty);
    }
  }

  function addFromUi() {
    var el = DO.$("clipText");
    var t = el ? String(el.value || "").trim() : "";
    if (!t) {
      DO.debugLog("clipAdd_empty");
      DO.setStatus("กรอกข้อความก่อน");
      setTimeout(function () {
        DO.setStatus("ready");
      }, 800);
      return;
    }

    DO.store.clipboard = DO.store.clipboard || [];
    var id = DO.newId("clip");
    DO.store.clipboard.unshift({ id: id, text: t, scope: "Local" });
    DO.persist.clipboard();
    render();

    if (el) el.value = "";
    DO.debugLog("clipAdd_done", { id: id, count: (DO.store.clipboard || []).length });
  }

  function bind() {
    var clipAdd = DO.$("clipAdd");
    if (clipAdd) {
      clipAdd.addEventListener("click", function (e) {
        try {
          e && e.preventDefault && e.preventDefault();
        } catch (e2) {}
        addFromUi();
      });
    }

    var clipText = DO.$("clipText");
    if (clipText) {
      clipText.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Enter") {
            e.preventDefault();
            addFromUi();
          }
        } catch (e0) {}
      });
    }

    var clipReload = DO.$("clipReload");
    if (clipReload) {
      clipReload.addEventListener("click", function () {
        DO.store.clipboard = DO.storageLoad(DO.STORAGE_KEYS.clipboard, []);
        render();
        DO.debugLog("clipReload", { count: (DO.store.clipboard || []).length });
      });
    }
  }

  DO.features.clipboard = {
    bind: bind,
    render: render,
    addFromUi: addFromUi,
  };
})();

