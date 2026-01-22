// Tabs + debug panel UI
(function () {
  var DO = (window.DO = window.DO || {});

  DO.ui = DO.ui || {};

  DO.ui.setActiveTab = function (tab) {
    tab = String(tab || "");
    if (!tab) return;
    DO.state.activeTab = tab;

    try {
      if (DO.canUseLocalStorage()) localStorage.setItem(DO.STORAGE_KEYS.activeTab, tab);
    } catch (e0) {}

    var btns = document.querySelectorAll(".doTabBtn[data-tab]");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var t = b.getAttribute("data-tab");
      if (t === tab) b.classList.add("doIsActive");
      else b.classList.remove("doIsActive");
    }

    var panels = document.querySelectorAll(".doTabPanel[data-tab]");
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      var tp = p.getAttribute("data-tab");
      if (tp === tab) p.classList.add("doIsActive");
      else p.classList.remove("doIsActive");
    }

    DO.debugLog("tab_change", { tab: tab });
  };

  DO.ui.toggleDebugPanel = function (forceOpen) {
    var panel = DO.$("debugPanel");
    if (!panel) return;
    if (forceOpen === true) DO.state.debugOpen = true;
    else if (forceOpen === false) DO.state.debugOpen = false;
    else DO.state.debugOpen = !DO.state.debugOpen;

    if (DO.state.debugOpen) panel.classList.remove("doIsHidden");
    else panel.classList.add("doIsHidden");

    try {
      if (DO.canUseLocalStorage()) localStorage.setItem(DO.STORAGE_KEYS.debugOpen, DO.state.debugOpen ? "1" : "0");
    } catch (e) {}

    DO.debugLog("debug_toggle", { open: DO.state.debugOpen });
  };

  DO.ui.bindTabs = function () {
    try {
      var tabBtns = document.querySelectorAll(".doTabBtn[data-tab]");
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener("click", function (ev) {
          try {
            var t = ev && ev.currentTarget && ev.currentTarget.getAttribute ? ev.currentTarget.getAttribute("data-tab") : "";
            if (t) DO.ui.setActiveTab(t);
          } catch (e2) {}
        });
      }

      try {
        if (DO.canUseLocalStorage()) {
          var savedTab = localStorage.getItem(DO.STORAGE_KEYS.activeTab);
          if (savedTab) DO.state.activeTab = savedTab;
          var savedOpen = localStorage.getItem(DO.STORAGE_KEYS.debugOpen);
          if (savedOpen === "1") DO.state.debugOpen = true;
        }
      } catch (e3) {}

      // IMPORTANT: dictionary-abbreviation tabs are not "clipboard"
      DO.ui.setActiveTab(DO.state.activeTab || "dictionary");
    } catch (e4) {}
  };
})();

