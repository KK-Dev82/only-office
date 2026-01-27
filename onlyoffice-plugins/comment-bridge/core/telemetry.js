(function () {
  var CB = (window.CB = window.CB || {});

  CB.sendToHost = function (message) {
    try {
      if (window.Asc && window.Asc.plugin && typeof window.Asc.plugin.executeMethod === "function") {
        window.Asc.plugin.executeMethod("SendExternalMessage", [message]);
        return true;
      }
    } catch (e) {}
    return false;
  };
})();

