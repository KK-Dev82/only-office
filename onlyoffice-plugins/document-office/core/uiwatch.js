// UI/layout watchers: detect panel collapse + cursor changes
(function () {
  var DO = (window.DO = window.DO || {});
  DO.state = DO.state || {};

  function pickStyle(el) {
    if (!el) return null;
    try {
      var cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        position: cs.position,
        height: cs.height,
        minHeight: cs.minHeight,
        width: cs.width,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
      };
    } catch (e) {
      return null;
    }
  }

  function rectOf(el) {
    if (!el || !el.getBoundingClientRect) return null;
    try {
      var r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    } catch (e) {
      return null;
    }
  }

  function logLayout(reason, extra) {
    try {
      var root = document.querySelector(".doRoot");
      var body = document.body;
      var html = document.documentElement;

      var payload = {
        reason: reason,
        extra: extra,
        rect: {
          root: rectOf(root),
          body: rectOf(body),
          html: rectOf(html),
        },
        style: {
          root: pickStyle(root),
          body: pickStyle(body),
          html: pickStyle(html),
        },
        cls: {
          html: html ? String(html.className || "") : "",
          body: body ? String(body.className || "") : "",
        },
      };

      // throttle: only log when rect actually changed (or forced)
      var sig = JSON.stringify(payload.rect);
      if (!extra || !extra.force) {
        if (DO.state._uiwatchLastRectSig === sig) return;
      }
      DO.state._uiwatchLastRectSig = sig;

      DO.debugLog("ui_layout_change", payload);
    } catch (e) {}
  }

  DO.startUiWatch = function () {
    if (DO.state._uiwatchStarted) return;
    DO.state._uiwatchStarted = true;

    try {
      logLayout("start", { force: true });
    } catch (e0) {}

    // Resize observer for root (best signal for collapse)
    try {
      var root = document.querySelector(".doRoot");
      if (root && typeof window.ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          logLayout("ResizeObserver");
        });
        ro.observe(root);
        DO.state._uiwatchRO = ro;
      }
    } catch (e1) {}

    // Mutation observer for html/body class/style changes (plugins-ui/theme toggles)
    try {
      var mo = new MutationObserver(function (mutations) {
        var changed = false;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m && m.type === "attributes") {
            changed = true;
            break;
          }
        }
        if (changed) logLayout("MutationObserver");
      });
      if (document.documentElement) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
      DO.state._uiwatchMO = mo;
    } catch (e2) {}

    // Log when window size changes inside iframe
    try {
      window.addEventListener("resize", function () { logLayout("window.resize"); }, { passive: true });
    } catch (e3) {}
  };

  DO.bindCursorWatch = function () {
    if (DO.state._cursorWatchBound) return;
    DO.state._cursorWatchBound = true;

    function handler(e) {
      try {
        DO.debugLog("cursor_change", { event: e });
        // often collapse happens immediately after cursor change → capture layout too
        logLayout("cursor_change", { force: true });
      } catch (e0) {}
    }

    try {
      var p = window.Asc && window.Asc.plugin;
      if (p && typeof p.attachEditorEvent === "function") {
        p.attachEditorEvent("onTargetPositionChanged", handler);
        DO.debugLog("cursor_watch_attached", { mode: "attachEditorEvent" });
        return;
      }
      if (p && typeof p.attachEvent === "function") {
        p.attachEvent("onTargetPositionChanged", handler);
        DO.debugLog("cursor_watch_attached", { mode: "attachEvent" });
        return;
      }
      DO.debugLog("cursor_watch_unavailable", { hasAttachEditorEvent: !!(p && p.attachEditorEvent), hasAttachEvent: !!(p && p.attachEvent) });
    } catch (e1) {}
  };
})();

