// Global namespace for DocumentOffice plugin (no bundler)
// All modules attach to `window.DO`.
(function () {
  window.DO = window.DO || {};

  // Sync version with config/index + host cache-busting
  window.DO.VERSION = "0.1.10";

  // Toggle verbose logs
  window.DO.DEBUG = true;

  window.DO.state = window.DO.state || {
    uiBound: false,
    activeTab: "clipboard",
    debugOpen: false,
    targetTimer: 0,
    lastToken: "",
  };

  window.DO.pluginOptions = window.DO.pluginOptions || {
    apiBaseUrl: "",
    accessToken: "",
    userName: "",
    userId: null,
    defaultCheckMode: "paragraph",
    features: {},
  };

  window.DO.store = window.DO.store || {
    abbreviations: [],
    clipboard: [],
    macros: [],
    redundant: [],
    dictionary: [],
  };
})();

