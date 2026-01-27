// Token detector (Abbreviation only)
// - No ONLYOFFICE InputHelper usage
// - Keeps abbreviation auto-expand working by watching editor paragraph changes
(function () {
  // NOTE: core/* initializes window.DO; keep DA alias for existing logs
  var DO = (window.DO = window.DO || {});
  var DA = (window.DA = DO);

  DO.features = DO.features || {};
  DO.state = DO.state || {};

  // Throttle paragraph polling (ms)
  var THROTTLE_MS = 250;

  DO.state._abbrDetect = DO.state._abbrDetect || {
    disposed: false,
    timer: 0,
    lastParaText: undefined,
  };

  function extractLastTokenInfo(text) {
    try {
      var s0 = String(text || "").replace(/\u00A0/g, " ");
      // trim-right only; keep indices stable if needed later
      var s = s0.replace(/[\s\u00A0]+$/g, "");
      var m = s.match(/([A-Za-z0-9ก-๙._-]{1,})$/);
      var token = m ? String(m[1] || "") : "";
      var start = token ? Math.max(0, s.length - token.length) : -1;
      return { token: token, start: start, text: s0 };
    } catch (e) {
      return { token: "", start: -1, text: String(text || "") };
    }
  }

  function attach(eventName, fn) {
    try {
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEditorEvent) {
        window.Asc.plugin.attachEditorEvent(eventName, fn);
        return;
      }
      if (window.Asc && window.Asc.plugin && window.Asc.plugin.attachEvent) {
        window.Asc.plugin.attachEvent(eventName, fn);
        return;
      }
      if (window.Asc && window.Asc.plugin) {
        window.Asc.plugin[eventName] = fn;
      }
    } catch (e) {}
  }

  function scheduleFromParagraph() {
    var st = DO.state._abbrDetect;
    if (!st || st.disposed) return;
    if (st.timer) return;
    st.timer = setTimeout(function () {
      try {
        st.timer = 0;
        if (st.disposed) return;
        if (!DO.editor || !DO.editor.getCurrentParagraphText) return;

        DO.editor.getCurrentParagraphText(function (paraText) {
          try {
            if (st.disposed) return;
            var nextText = String(paraText || "");
            st.lastParaText = nextText;

            // Suppress detection right after plugin mutates document text
            // (prevents loops where programmatic replace triggers onDocumentContentChanged again)
            try {
              DO.state = DO.state || {};
              var now = Date.now();
              var suppressUntil = Number(DO.state._abbrSuppressUntil || 0) || 0;
              if (suppressUntil && now < suppressUntil) {
                return;
              }
            } catch (eSup) {}

            var tokenInfo = extractLastTokenInfo(nextText);

            // Update panel suggestions while typing (does not replace text)
            try {
              if (
                DO.features &&
                DO.features.abbreviation &&
                typeof DO.features.abbreviation.handleLiveToken === "function"
              ) {
                DO.features.abbreviation.handleLiveToken(tokenInfo);
              }
            } catch (e0) {}

            // Auto expand completed abbreviation (replace last token)
            try {
              // Temporary circuit breaker: if auto mode was disabled due to rapid repeats,
              // skip auto-expand but keep live suggestions (user can click to expand).
              try {
                DO.state = DO.state || {};
                var now2 = Date.now();
                var disabledUntil = Number(DO.state._abbrAutoDisabledUntil || 0) || 0;
                if (disabledUntil && now2 < disabledUntil) {
                  return;
                }
              } catch (eDis) {}

              if (
                DO.features &&
                DO.features.abbreviation &&
                typeof DO.features.abbreviation.findCompletedAbbreviationFromParagraph === "function" &&
                typeof DO.features.abbreviation.handleCompletedAbbreviation === "function"
              ) {
                var abbrInfo = DO.features.abbreviation.findCompletedAbbreviationFromParagraph(nextText);
                DO.features.abbreviation.handleCompletedAbbreviation(abbrInfo);
              }
            } catch (e1) {}
          } catch (e2) {}
        });
      } catch (e3) {
        try { st.timer = 0; } catch (e4) {}
      }
    }, THROTTLE_MS);
  }

  function dispose() {
    var st = DO.state._abbrDetect;
    if (!st) return;
    st.disposed = true;
    try {
      if (st.timer) clearTimeout(st.timer);
    } catch (e0) {}
    st.timer = 0;
  }

  function bind() {
    try {
      if (DO.state.__abbrDetectBound) return;
      DO.state.__abbrDetectBound = true;
    } catch (e0) {}

    attach("onTargetPositionChanged", function () { scheduleFromParagraph(); });
    attach("onDocumentContentChanged", function () { scheduleFromParagraph(); });
    attach("onSelectionChanged", function () { scheduleFromParagraph(); });
    attach("onChangeSelection", function () { scheduleFromParagraph(); });

    // First run
    scheduleFromParagraph();
  }

  // Keep legacy API name used by bootstrap.js
  DO.features.dictSuggest = DO.features.dictSuggest || {};
  DO.features.dictSuggest.bind = bind;
  DO.features.dictSuggest.dispose = dispose;
})();

