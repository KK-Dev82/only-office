// Macros feature (local-first; optional API sync)
(function () {
  var DO = (window.DO = window.DO || {});
  DO.features = DO.features || {};
  DO.state = DO.state || {};
  var PLUGIN_GUID = "asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}";

  function iconSvg(type) {
    // minimal inline svg icons (currentColor)
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

  function normalizeBaseUrl(url) {
    url = String(url || "").trim();
    if (!url) return "";
    // Keep relative base ("/") as-is, just ensure trailing slash
    try {
      return url.replace(/\/+$/, "") + "/";
    } catch (e) {
      return url;
    }
  }

  function pickArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.Data)) return data.Data;
    if (Array.isArray(data.items)) return data.items;
    return [];
  }

  function toInt(v, fallback) {
    var n = parseInt(String(v == null ? "" : v), 10);
    return isFinite(n) ? n : fallback;
  }

  function stepText(step) {
    if (!step || !step.action) return "";
    var action = String(step.action || "").toLowerCase();
    var value = step.value != null ? String(step.value) : "";

    // Match `TextMacroService` actions (senate-vite)
    if (action === "insert_text") return value;
    if (action === "insert_newline") return "\n";
    if (action === "insert_tab") return "\t";
    if (action === "insert_space") return " ";

    if (action === "insert_tab_multiple") {
      var tCount = toInt(value, 0);
      if (tCount <= 0) tCount = toInt(step.count, 0); // defensive
      if (tCount <= 0) tCount = 2; // reasonable default
      return new Array(tCount + 1).join("\t");
    }

    if (action === "insert_space_multiple") {
      var sCount = toInt(value, 0);
      if (sCount <= 0) sCount = toInt(step.count, 0);
      if (sCount <= 0) sCount = 1;
      return new Array(sCount + 1).join(" ");
    }

    if (action === "insert_date") {
      try {
        return new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
      } catch (e) {
        return "";
      }
    }
    if (action === "insert_time") {
      try {
        return new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      } catch (e2) {
        return "";
      }
    }
    if (action === "insert_datetime") {
      try {
        return new Date().toLocaleString("th-TH");
      } catch (e3) {
        return "";
      }
    }

    // Formatting/custom steps are not representable as plain text insertion here
    return "";
  }

  function compileMacroText(m) {
    if (!m) return "";
    // legacy fields
    if (m.text != null) return expandTokens(String(m.text || ""));
    if (m.value != null) return String(m.value || "");

    // new: steps[]
    var steps = m.steps;
    if (Array.isArray(steps) && steps.length) {
      var out = "";
      for (var i = 0; i < steps.length; i++) out += stepText(steps[i]);
      return out;
    }

    // fallback to name
    return String(m.name || "");
  }

  function expandTokens(text) {
    // Allow user to type tokens like [tab] / [space] / [nl] in textarea
    // We convert them to real characters on insert.
    var t = String(text || "");
    if (!t) return "";
    try {
      t = t.replace(/\[(tab)\]/gi, "\t");
      t = t.replace(/\[(space)\]/gi, " ");
      t = t.replace(/\[(nl|newline|enter)\]/gi, "\n");
    } catch (e) {}
    return t;
  }

  function hide(el) {
    try {
      if (el) el.classList.add("doIsHidden");
    } catch (e) {}
  }

  function show(el) {
    try {
      if (el) el.classList.remove("doIsHidden");
    } catch (e) {}
  }

  function isOpen(el) {
    try {
      return el && !el.classList.contains("doIsHidden");
    } catch (e) {
      return false;
    }
  }

  function splitCommaEscaped(input) {
    // split by commas, but allow "\," to mean literal comma
    var s = String(input || "");
    if (!s) return [];
    // allow newlines as separators too
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

    // trim + unescape "\," -> ","
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
      var compact = expandTokens(text)
        .replace(/\s+/g, " ")
        .trim();
      return compact ? compact.slice(0, 24) : "Macro";
    } catch (e) {
      return "Macro";
    }
  }

  function appendToTextAreaById(id, s) {
    var textEl = DO.$(id);
    if (!textEl) return;
    try {
      var el = textEl;
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
        textEl.value = String(textEl.value || "") + String(s || "");
      } catch (e2) {}
    }
  }

  function macroLabel(m) {
    if (!m) return "";
    var name = String(m.name || "");
    return name || "-";
  }

  function isGlobalMacro(m) {
    try {
      var scope = String((m && (m.scope || m.Scope)) || "").toLowerCase();
      if (scope === "global") return true;
      // Some API shapes: ownerUserId null => global
      if (m && (m.ownerUserId === null || m.OwnerUserId === null)) return true;
    } catch (e) {}
    return false;
  }

  function openAddModal() {
    var modal = DO.$("macroAddModal");
    if (!modal) return;
    DO.state.macroModalOpen = true;
    show(modal);
    try {
      var textEl = DO.$("macroModalText");
      if (textEl) textEl.focus();
    } catch (e) {}
  }

  function closeAddModal() {
    var modal = DO.$("macroAddModal");
    if (!modal) return;
    DO.state.macroModalOpen = false;
    hide(modal);
  }

  function openAddWindow() {
    // Preferred: open real ONLYOFFICE modal window (outside RightPanel)
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        // IMPORTANT: variation.url must be absolute (or plugin-base), otherwise ONLYOFFICE may resolve it
        // relative to DocumentServer editor path (e.g. /web-apps/apps/documenteditor/main/) and 404.
        var href = "";
        try {
          href = String(window.location && window.location.href ? window.location.href : "");
        } catch (eHref) {}
        var base = href;
        try {
          base = base.split("#")[0].split("?")[0];
          base = base.slice(0, base.lastIndexOf("/") + 1);
        } catch (eBase) {}
        // Fallback: relative (may 404 on some builds) — but keep for safety
        var winUrl = (base ? base : "") + "macro_window.html?v=" + encodeURIComponent(String(DO.VERSION || "0.1.14"));

        // IMPORTANT:
        // Use a dedicated frame id for the macro window.
        // Reusing "iframe_asc.{PLUGIN_GUID}" can collide with the panelRight iframe and cause the panel to close/blank.
        var frameId = "iframe_" + PLUGIN_GUID + "_macroWindow";

        var variation = {
          url: winUrl,
          description: "Add Macros",
          isVisual: true,
          isModal: true,
          EditorsSupport: ["word"],
          size: [900, 680],
          // Provide at least one built-in button (always clickable even if iframe events fail)
          buttons: [{ text: "Close", primary: false }]
        };
        window.Asc.plugin.executeMethod("ShowWindow", [frameId, variation], function (windowID) {
          try {
            // Save last window id so the window iframe can close itself if needed
            if (DO && DO.STORAGE_PREFIX) {
              localStorage.setItem(DO.STORAGE_PREFIX + "macroWindowId", String(windowID || ""));
            }
          } catch (e0) {}
          DO.debugLog("macro_open_window", { via: "ShowWindow", url: winUrl, frameId: frameId, windowID: windowID });
        });
        return;
      }
    } catch (e0) {
      try { DO.debugLog("macro_open_window_failed", { error: String(e0) }); } catch (e1) {}
    }
    // Fallback: in-panel overlay
    openAddModal();
  }

  function clearAddModal() {
    try {
      var nameEl = DO.$("macroModalName");
      var textEl = DO.$("macroModalText");
      var itemsEl = DO.$("macroModalItems");
      if (nameEl) nameEl.value = "";
      if (textEl) textEl.value = "";
      if (itemsEl) itemsEl.value = "";
    } catch (e) {}
  }

  function apiUrl(path, params) {
    var base = normalizeBaseUrl(DO.pluginOptions && DO.pluginOptions.apiBaseUrl);
    var p = String(path || "").replace(/^\/+/, "");
    var url = base ? base + p : "/" + p;
    var q = [];
    if (params) {
      for (var k in params) {
        if (params[k] === undefined || params[k] === null || params[k] === "") continue;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
      }
    }
    if (q.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
    return url;
  }

  async function fetchMacrosFromApi() {
    var base = String((DO.pluginOptions && DO.pluginOptions.apiBaseUrl) || "").trim();
    if (!base) return null;

    var params = { includeGlobal: true };
    // optionally include userId if provided (same idea as textMacroService.fetchMacros)
    if (DO.pluginOptions && DO.pluginOptions.userId != null) params.ownerUserId = DO.pluginOptions.userId;

    var url = apiUrl("api/word-management/macros", params);
    var headers = { "Content-Type": "application/json" };
    if (DO.pluginOptions && DO.pluginOptions.accessToken) {
      headers["Authorization"] = "Bearer " + String(DO.pluginOptions.accessToken);
    }

    var res = await fetch(url, { method: "GET", headers: headers });
    if (!res.ok) {
      var txt = "";
      try {
        txt = await res.text();
      } catch (e0) {}
      throw new Error("GET " + url + " failed: " + res.status + " " + txt);
    }
    var json = null;
    try {
      json = await res.json();
    } catch (e1) {
      json = null;
    }
    var arr = pickArray(json);
    return arr;
  }

  function normalizeMacroApiItem(m) {
    // Be tolerant to PascalCase / different shapes
    var id = String((m && (m.id || m.Id)) || DO.newId("macro"));
    var name = String((m && (m.name || m.Name)) || "");
    var description = m ? (m.description != null ? m.description : m.Description) : "";
    var shortcut = m ? (m.shortcut != null ? m.shortcut : m.Shortcut) : "";
    var trigger = m ? (m.trigger != null ? m.trigger : m.Trigger) : "";
    var isActive = true;
    if (m && m.isActive !== undefined) isActive = !!m.isActive;
    else if (m && m.IsActive !== undefined) isActive = !!m.IsActive;

    var scope = "";
    try {
      scope = String((m && (m.scope || m.Scope)) || "");
    } catch (eScope) {
      scope = "";
    }
    var ownerUserId = m ? (m.ownerUserId !== undefined ? m.ownerUserId : m.OwnerUserId) : undefined;

    var rawSteps = (m && (m.steps || m.Steps)) || [];
    var steps = [];
    if (Array.isArray(rawSteps)) {
      for (var i = 0; i < rawSteps.length; i++) {
        var s = rawSteps[i] || {};
        steps.push({
          action: String(s.action || s.Action || "insert_text"),
          value: s.value != null ? s.value : s.Value,
          delay: s.delay != null ? s.delay : s.Delay
        });
      }
    }

    return {
      id: id,
      name: name,
      description: description || "",
      shortcut: shortcut || "",
      trigger: trigger || "",
      isActive: isActive,
      steps: steps,
      scope: scope || (ownerUserId === null ? "Global" : ""),
      ownerUserId: ownerUserId
    };
  }

  function render() {
    var root = DO.$("macroList");
    if (!root) return;
    root.innerHTML = "";

    var items = DO.store.macros || [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      if (!m) continue;

      // Hide inactive macros if present
      try {
        if (m.isActive === false) continue;
      } catch (e0) {}

      var label = macroLabel(m);
      var insertValue = compileMacroText(m);
      if (!insertValue) continue;

      // Delete/Edit only for non-API macros
      // - API macros (source: "api") should not be edited/deleted from plugin UI
      // - Local macros (including older ones without `source`) can be edited/deleted
      var isApi = false;
      try {
        isApi = String(m.source || "").toLowerCase() === "api";
      } catch (eLocal) {}
      var isLocal = !isApi;

      var div = document.createElement("div");
      div.className = "doItem";
      try {
        div.style.cursor = "pointer";
        div.title = "คลิกเพื่อแทรก (Insert)";
      } catch (eCur) {}
      var row = document.createElement("div");
      row.className = "doItemRow";
      var textWrap = document.createElement("div");
      textWrap.className = "doItemText doItemTextPre";

      var titleLine = document.createElement("div");
      titleLine.className = "doItemTitleLine";
      var title = document.createElement("span");
      title.className = "doItemTitle";
      title.textContent = label;
      titleLine.appendChild(title);

      if (isGlobalMacro(m)) {
        var badge = document.createElement("span");
        badge.className = "doBadge doBadgeSmall";
        badge.textContent = "global";
        titleLine.appendChild(badge);
      }

      var previewEl = document.createElement("div");
      previewEl.className = "doItemPreview";
      var preview = insertValue;
      try {
        preview = preview.replace(/\t/g, "[tab]").replace(/\n/g, "[nl]");
      } catch (e1) {}
      previewEl.textContent = preview;

      textWrap.appendChild(titleLine);
      textWrap.appendChild(previewEl);

      var actions = document.createElement("div");
      actions.className = "doItemActions";
      if (isLocal) {
        actions.appendChild(
          makeIconButton({
            ariaLabel: "Edit",
            title: "Edit",
            svg: iconSvg("edit"),
            onClick: (function (mid, curName, curText) {
              return function () {
                var nextName = null;
                var nextText = null;
                try {
                  nextName = prompt("แก้ไขชื่อ Macro", String(curName || ""));
                } catch (e0) {
                  nextName = null;
                }
                if (nextName === null) return; // cancel
                nextName = String(nextName || "").trim();
                if (!nextName) nextName = String(curName || "").trim() || "Macro";

                try {
                  nextText = prompt("แก้ไขข้อความ Macro", String(curText || ""));
                } catch (e1) {
                  nextText = null;
                }
                if (nextText === null) return; // cancel
                nextText = String(nextText || "");
                if (!String(nextText).trim()) {
                  try {
                    DO.setStatus("ต้องมีข้อความ");
                    setTimeout(function () { DO.setStatus("ready"); }, 800);
                  } catch (e2) {}
                  return;
                }

                DO.store.macros = (DO.store.macros || []).map(function (x) {
                  if (!x) return x;
                  if (String(x.id) !== String(mid)) return x;
                  var copy = {};
                  for (var k in x) copy[k] = x[k];
                  copy.name = nextName;
                  // keep text-based local macro editable; if original is step-based, still store text for insertion
                  copy.text = nextText;
                  copy.source = String(copy.source || "local");
                  copy.scope = String(copy.scope || "Local");
                  copy.isActive = copy.isActive !== false;
                  return copy;
                });
                DO.persist.macros();
                render();
                DO.debugLog("macro_edit_local", { id: mid, nameLen: nextName.length, textLen: String(nextText || "").length });
              };
            })(m.id, m.name, m.text != null ? m.text : insertValue),
          })
        );

        actions.appendChild(
          makeIconButton({
            ariaLabel: "Delete",
            title: "Delete",
            svg: iconSvg("delete"),
            onClick: (function (mid) {
              return function () {
                DO.store.macros = (DO.store.macros || []).filter(function (x) {
                  return String(x && x.id) !== String(mid);
                });
                DO.persist.macros();
                render();
                DO.debugLog("macro_delete_local", { id: mid });
              };
            })(m.id),
          })
        );
      }

      // Click item = insert (like clipboard behavior)
      // Do not trigger when clicking buttons inside the item.
      div.addEventListener(
        "click",
        (function (t, mid) {
          return function (ev) {
            try {
              var target = ev && ev.target ? ev.target : null;
              var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
              if (tag === "button") return;
            } catch (e0) {}
            DO.debugLog("macro_insert", { id: mid, len: String(t || "").length });
            DO.editor.insertText(t);
          };
        })(insertValue, m.id)
      );

      row.appendChild(textWrap);
      row.appendChild(actions);
      div.appendChild(row);
      root.appendChild(div);
    }

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "doMuted";
      empty.textContent = "ยังไม่มี macro";
      root.appendChild(empty);
    }
  }

  async function reload() {
    // Always render current local state first
    try {
      DO.store.macros = DO.storageLoad(DO.STORAGE_KEYS.macros, []);
    } catch (e0) {
      DO.store.macros = DO.store.macros || [];
    }
    render();

    // Try API sync when configured
    var base = String((DO.pluginOptions && DO.pluginOptions.apiBaseUrl) || "").trim();
    if (!base) {
      DO.debugLog("macroReload_localOnly", { count: (DO.store.macros || []).length });
      return;
    }

    try {
      DO.setStatus("loading macros…");
    } catch (e1) {}

    try {
      var apiItems = await fetchMacrosFromApi();
      if (apiItems && apiItems.length) {
        var normalized = [];
        for (var i = 0; i < apiItems.length; i++) {
          var nm = normalizeMacroApiItem(apiItems[i]);
          nm.source = "api";
          normalized.push(nm);
        }
        // Keep local-only macros (added in plugin) so reload won't wipe them
        var localOnly = (DO.storageLoad(DO.STORAGE_KEYS.macros, []) || []).filter(function (x) {
          try {
            return String((x && (x.source || x.scope)) || "").toLowerCase() === "local";
          } catch (e2) {
            return false;
          }
        });
        DO.store.macros = normalized.concat(localOnly);
        DO.persist.macros();
        render();
        DO.debugLog("macroReload_api_ok", { apiCount: normalized.length, localCount: localOnly.length, total: DO.store.macros.length });
      } else {
        DO.debugLog("macroReload_api_empty_keep_local", { localCount: (DO.store.macros || []).length });
      }
    } catch (err) {
      DO.debugLog("macroReload_api_failed_keep_local", { error: String(err) });
    } finally {
      try {
        DO.setStatus("ready");
      } catch (e2) {}
    }
  }

  function addFromModal() {
    var nameEl = DO.$("macroModalName");
    var textEl = DO.$("macroModalText");
    var itemsEl = DO.$("macroModalItems");

    var nameTmpl = nameEl ? String(nameEl.value || "").trim() : "";
    var textTmpl = textEl ? String(textEl.value || "") : "";
    var itemsRaw = itemsEl ? String(itemsEl.value || "") : "";

    if (!textTmpl && !itemsRaw) {
      DO.setStatus("กรอกข้อความ หรือ รายการ ก่อน");
      setTimeout(function () { DO.setStatus("ready"); }, 900);
      return;
    }

    var items = splitCommaEscaped(itemsRaw);
    var willUseItems = items.length > 0;

    // If user provided items but left text empty: treat each item as macro text
    if (willUseItems && !textTmpl) {
      textTmpl = "{item}";
    }
    // If user didn't provide items: single macro
    if (!willUseItems) {
      items = [""]; // single pass
    }

    DO.store.macros = DO.store.macros || [];
    var created = 0;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var insertText = textTmpl;
      if (String(insertText || "").indexOf("{item}") >= 0) {
        insertText = replaceAllSafe(insertText, "{item}", item);
      } else if (willUseItems) {
        // No template placeholder: treat each item itself as the insert text
        insertText = item;
      }

      insertText = String(insertText || "");
      if (!insertText.trim()) continue;

      var name = nameTmpl;
      if (name && String(name).indexOf("{item}") >= 0) {
        name = replaceAllSafe(name, "{item}", item);
      }
      if (!name) {
        // Prefer item (when batch) else derive from insertText
        name = willUseItems && item ? String(item).slice(0, 24) : defaultNameFromText(insertText);
      }

      var id = DO.newId("macro");
      DO.store.macros.unshift({
        id: id,
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
    render();
    DO.debugLog("macro_add_local_batch", { created: created, hasItems: willUseItems });

    clearAddModal();
    closeAddModal();
  }

  function bind() {
    var macroReload = DO.$("macroReload");
    if (macroReload) macroReload.addEventListener("click", function () { reload(); });

    var openBtn = DO.$("macroOpenAdd");
    if (openBtn) openBtn.addEventListener("click", function () { openAddWindow(); });

    var modal = DO.$("macroAddModal");
    if (modal) {
      // click outside to close
      modal.addEventListener("click", function (e) {
        try {
          if (e && e.target === modal) closeAddModal();
        } catch (e0) {}
      });
    }

    var closeBtn = DO.$("macroModalClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { closeAddModal(); });
    var cancelBtn = DO.$("macroModalCancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function () { closeAddModal(); });
    var saveBtn = DO.$("macroModalSave");
    if (saveBtn) saveBtn.addEventListener("click", function () { addFromModal(); });

    // modal textarea key handling
    var modalText = DO.$("macroModalText");
    if (modalText) {
      modalText.addEventListener("keydown", function (e) {
        try {
          if (e && e.key === "Tab") {
            e.preventDefault();
            appendToTextAreaById("macroModalText", "\t");
            return;
          }
          if (e && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            addFromModal();
            return;
          }
          if (e && e.key === "Escape") {
            e.preventDefault();
            closeAddModal();
            return;
          }
        } catch (e0) {}
      });
    }

    // global esc close (when modal open)
    document.addEventListener("keydown", function (e) {
      try {
        var m = DO.$("macroAddModal");
        if (!m || !isOpen(m)) return;
        if (e && e.key === "Escape") {
          e.preventDefault();
          closeAddModal();
        }
      } catch (e0) {}
    });

    var bTab = DO.$("macroModalInsertTab");
    if (bTab) bTab.addEventListener("click", function () { appendToTextAreaById("macroModalText", "[tab]"); });
    var bSpace = DO.$("macroModalInsertSpace");
    if (bSpace) bSpace.addEventListener("click", function () { appendToTextAreaById("macroModalText", "[space]"); });
    var bNl = DO.$("macroModalInsertNewline");
    if (bNl) bNl.addEventListener("click", function () { appendToTextAreaById("macroModalText", "[nl]"); });
    var bColon = DO.$("macroModalInsertColonSpace");
    if (bColon) bColon.addEventListener("click", function () { appendToTextAreaById("macroModalText", ": "); });

    // Auto-refresh when macros are saved from another plugin window (storage event)
    try {
      if (!DO.state._macroStorageListenerAttached) {
        DO.state._macroStorageListenerAttached = true;
        window.addEventListener("storage", function (ev) {
          try {
            var k = ev && ev.key ? String(ev.key) : "";
            if (k && DO.STORAGE_KEYS && k === DO.STORAGE_KEYS.macros) {
              DO.debugLog("macro_storage_changed", { key: k });
              reload();
            }
          } catch (e0) {}
        });
      }
    } catch (e2) {}
  }

  DO.features.macros = {
    bind: bind,
    render: render,
    reload: reload,
    openAddModal: openAddModal,
    closeAddModal: closeAddModal,
    addFromModal: addFromModal,
    openAddWindow: openAddWindow,
  };
})();

