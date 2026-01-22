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
        flex: cs.flex,
        flexDirection: cs.flexDirection,
        height: cs.height,
        minHeight: cs.minHeight,
        maxHeight: cs.maxHeight,
        width: cs.width,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        fontSize: cs.fontSize,
        transform: cs.transform,
        zoom: cs.zoom,
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

  function snapshot() {
    try {
      var root = document.querySelector(".doRoot");
      var body = document.body;
      var html = document.documentElement;
      var vv = window.visualViewport;
      return {
        window: {
          innerW: window.innerWidth,
          innerH: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
        },
        viewport: vv
          ? {
              w: Math.round(vv.width),
              h: Math.round(vv.height),
              scale: vv.scale,
              offsetLeft: Math.round(vv.offsetLeft),
              offsetTop: Math.round(vv.offsetTop),
            }
          : null,
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
    } catch (e) {
      return null;
    }
  }

  function delta(prev, next) {
    try {
      if (!prev || !next) return null;
      var pr = (prev.rect && prev.rect.root) || null;
      var nr = (next.rect && next.rect.root) || null;
      if (!pr || !nr) return null;
      return {
        dRootW: (nr.w || 0) - (pr.w || 0),
        dRootH: (nr.h || 0) - (pr.h || 0),
        dWinW: (next.window.innerW || 0) - (prev.window.innerW || 0),
        dWinH: (next.window.innerH || 0) - (prev.window.innerH || 0),
      };
    } catch (e) {
      return null;
    }
  }

  function logLayout(reason, extra) {
    try {
      var payload = snapshot();
      if (!payload) return;
      payload.reason = reason;
      payload.extra = extra;
      payload.delta = delta(DO.state._uiwatchLastSnapshot, payload);

      // throttle: only log when rect actually changed (or forced)
      var sig = JSON.stringify(payload.rect);
      if (!extra || !extra.force) {
        if (DO.state._uiwatchLastRectSig === sig) return;
      }
      DO.state._uiwatchLastRectSig = sig;
      DO.state._uiwatchLastSnapshot = payload;

      DO.debugLog("ui_layout_change", payload);

      // Summary line (easy to read without expanding objects)
      try {
        var rr = payload.rect && payload.rect.root ? payload.rect.root : null;
        var wr = payload.window || {};
        DO.debugLog("ui_layout_change_summary", {
          reason: reason,
          root: rr ? { w: rr.w, h: rr.h } : null,
          win: { w: wr.innerW, h: wr.innerH },
          htmlCls: payload.cls ? payload.cls.html : "",
          bodyCls: payload.cls ? payload.cls.body : "",
          delta: payload.delta || null,
        });
      } catch (e2) {}
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

    function handler(name, e) {
      try {
        DO.debugLog("cursor_change", { name: name, event: e });
        // often collapse happens immediately after cursor change → capture layout too
        logLayout("cursor_change", { force: true });
      } catch (e0) {}
    }

    function attachOne(id) {
      try {
        var p = window.Asc && window.Asc.plugin;
        if (!p) return "";
        if (typeof p.attachEditorEvent === "function") {
          p.attachEditorEvent(id, function (e) { handler(id, e); });
          return "attachEditorEvent";
        }
        if (typeof p.attachEvent === "function") {
          p.attachEvent(id, function (e) { handler(id, e); });
          return "attachEvent";
        }
        // direct fallback: chain if already exists
        var prev = p[id];
        if (typeof prev === "function") {
          p[id] = function (e) {
            try { prev(e); } catch (e0) {}
            try { handler(id, e); } catch (e1) {}
          };
          return "direct_chain";
        }
        p[id] = function (e) { handler(id, e); };
        return "direct";
      } catch (e) {
        return "";
      }
    }

    try {
      var events = [
        "onTargetPositionChanged",
        // Some builds fire selection events instead
        "onSelectionChanged",
        "onChangeSelection",
      ];
      var modes = {};
      for (var i = 0; i < events.length; i++) {
        var m = attachOne(events[i]);
        modes[events[i]] = m || "none";
      }
      DO.debugLog("cursor_watch_attached", { modes: modes });
    } catch (e1) {}
  };
})();

