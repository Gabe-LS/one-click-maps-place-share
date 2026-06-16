// MAIN world · document_start
// 1. Injects dialog-hiding CSS before any Maps code runs
// 2. Patches XHR and fetch to intercept short link RPC responses

(function () {
  "use strict";

  var TAG = "[GMBS]";

  function logEnabled() {
    return document.documentElement.hasAttribute("data-gmbs-debug");
  }

  // ── Pre-inject hiding CSS ──

  var css = document.createElement("style");
  css.textContent =
    'html[data-gmbs-hiding] [role="dialog"],' +
    'html[data-gmbs-hiding] [aria-modal="true"],' +
    "html[data-gmbs-hiding] .MCk2mb{" +
    "opacity:0!important;visibility:hidden!important;" +
    "pointer-events:none!important;transition:none!important;" +
    "background:transparent!important}";
  (document.head || document.documentElement).appendChild(css);

  // ── XHR + fetch interceptor ──

  var LINK_RE = /https?:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+/;

  function emit(url) {
    if (logEnabled()) console.log(TAG, "intercepted short link:", url);
    document.dispatchEvent(
      new CustomEvent("gmbs-short-link", { detail: url })
    );
  }

  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__gmbsUrl = typeof url === "string" ? url : String(url);
    return origXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this.__gmbsUrl && this.__gmbsUrl.indexOf("batchexecute") !== -1) {
      this.addEventListener("load", function () {
        try {
          var m = this.responseText.match(LINK_RE);
          if (m) emit(m[0]);
        } catch (_) {}
      });
    }
    return origXhrSend.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = "";
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    } else if (input && typeof input.toString === "function") {
      url = input.toString();
    }

    var promise = origFetch.apply(this, arguments);

    if (url.indexOf("batchexecute") !== -1) {
      promise
        .then(function (resp) {
          return resp
            .clone()
            .text()
            .then(function (body) {
              var m = body.match(LINK_RE);
              if (m) emit(m[0]);
            });
        })
        .catch(function () {});
    }

    return promise;
  };
})();
