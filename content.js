(function () {
  "use strict";

  var TAG = "[OCMPS]";
  var SHARE_ICON = String.fromCharCode(0xe80d);
  var PUA_RE = new RegExp("^[\\ue000-\\uf8ff]+\\s*");

  var debug = false;
  var intercepting = false;
  var pendingLink = null;
  var pendingLinkUrl = null;

  function log() {
    if (debug) console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }
  function warn() {
    if (debug) console.warn.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }
  function err() {
    if (debug) console.error.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  document.addEventListener("gmbs-short-link", function (e) {
    pendingLink = e.detail;
    pendingLinkUrl = window.location.pathname;
  });

  // ── Dialog hiding ───────────────────────────────────────────
  // Activates CSS rules injected by interceptor.js at document_start.

  function hideDialog() {
    document.documentElement.setAttribute("data-gmbs-hiding", "");
  }

  function unhideDialog() {
    document.documentElement.removeAttribute("data-gmbs-hiding");
  }

  // ── Share button detection ─────────────────────────────────

  function findShareButton() {
    var btns = document.querySelectorAll("button[data-value]");
    for (var i = 0; i < btns.length; i++) {
      var icon = btns[i].querySelector("span");
      if (icon && icon.textContent.trim() === SHARE_ICON) {
        log("share button found by icon codepoint");
        return btns[i];
      }
    }
    var byJslog = document.querySelector('button[jslog^="13534"]');
    if (byJslog) {
      warn("share button found by jslog fallback (icon match failed)");
      return byJslog;
    }
    err("share button not found by any strategy");
    return null;
  }

  // ── Place info from page ───────────────────────────────────

  function getPlaceName() {
    var addrBtn = document.querySelector('button[data-item-id*="address"]');
    if (addrBtn) {
      var panel = addrBtn.closest('[role="main"]');
      if (panel) {
        var h1 = panel.querySelector("h1");
        var text = h1 ? h1.textContent.trim().replace(PUA_RE, "") : "";
        if (text) return text;
        var ariaLabel = (panel.getAttribute("aria-label") || "").trim();
        if (ariaLabel) return ariaLabel;
      }
    }

    var h1 = document.querySelector("h1");
    var h1Text = h1 ? h1.textContent.trim().replace(PUA_RE, "") : "";
    if (h1Text) return h1Text;

    var title = document.title || "";
    var cleaned = title.replace(/\s*[-–—·]\s*Google\s+Maps.*$/i, "").trim();
    if (cleaned && cleaned !== title.trim()) {
      warn("place name from page title fallback");
      return cleaned;
    }

    var pathMatch = window.location.pathname.match(/\/maps\/place\/([^\/@]+)/);
    if (pathMatch) {
      var decoded = decodeURIComponent(pathMatch[1].replace(/\+/g, " ")).trim();
      if (decoded) {
        warn("place name from URL path fallback");
        return decoded;
      }
    }

    warn("place name not found by any strategy");
    return null;
  }

  function getPlaceLocation() {
    var btn = document.querySelector('button[data-item-id*="address"]');
    if (btn) return btn.textContent.trim().replace(PUA_RE, "");
    warn("place location not found (no address button)");
    return null;
  }

  // ── Close dialog ───────────────────────────────────────────

  function closeShareDialog() {
    var btn = document.querySelector('[jsaction*="modal.close"]');
    if (btn) { btn.click(); return; }

    btn = document.getElementById("header-close-button");
    if (btn) { btn.click(); return; }

    var dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      var all = dialog.querySelectorAll("button");
      for (var i = 0; i < all.length; i++) {
        var rect = all[i].getBoundingClientRect();
        var dRect = dialog.getBoundingClientRect();
        if (
          rect.width < 50 &&
          rect.height < 50 &&
          rect.top - dRect.top < 60 &&
          dRect.right - rect.right < 60
        ) {
          warn("dialog closed by geometric fallback");
          all[i].click();
          return;
        }
      }
    }

    warn("dialog close: all button strategies failed, sending Escape");
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
      })
    );
  }

  // ── Short link retrieval ───────────────────────────────────

  var SHORT_LINK_RE = /https?:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+/;

  function readLinkFromDialog() {
    var dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;

    var inputs = dialog.querySelectorAll("input");
    for (var a = 0; a < inputs.length; a++) {
      var m = (inputs[a].value || "").match(SHORT_LINK_RE);
      if (m) return m[0];
    }

    var els = dialog.querySelectorAll("span, div, a");
    for (var b = 0; b < els.length; b++) {
      if (els[b].children.length > 0) continue;
      var m2 = (els[b].textContent || "").match(SHORT_LINK_RE);
      if (m2) return m2[0];
    }

    var anchors = dialog.querySelectorAll("a[href]");
    for (var c = 0; c < anchors.length; c++) {
      var m3 = anchors[c].href.match(SHORT_LINK_RE);
      if (m3) return m3[0];
    }

    return null;
  }

  function clickCopyLinkButton() {
    var dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;

    var toolbar = dialog.querySelector('[role="toolbar"]');
    if (toolbar) {
      var first = toolbar.querySelector('[role="button"]');
      if (first) {
        warn("clicking toolbar Copy Link button as fallback");
        first.click();
        return;
      }
    }

    var btns = dialog.querySelectorAll("button");
    for (var d = 0; d < btns.length; d++) {
      var ja = btns[d].getAttribute("jsaction") || "";
      if (ja.indexOf("copy") !== -1) {
        warn("clicking jsaction copy button as fallback");
        btns[d].click();
        return;
      }
    }
  }

  function waitForLink(timeoutMs) {
    return new Promise(function (resolve) {
      if (pendingLink) {
        log("link already available from interceptor");
        resolve(pendingLink);
        return;
      }

      var start = Date.now();
      var triedCopyBtn = false;
      var check = function () {
        if (pendingLink) {
          log("link received from interceptor after", Date.now() - start, "ms");
          resolve(pendingLink);
          return;
        }

        var fromDom = readLinkFromDialog();
        if (fromDom) {
          log("link read from dialog DOM after", Date.now() - start, "ms");
          resolve(fromDom);
          return;
        }

        var elapsed = Date.now() - start;
        if (elapsed > timeoutMs) {
          err("link retrieval timed out after", timeoutMs, "ms");
          resolve(null);
          return;
        }

        if (!triedCopyBtn && elapsed > 5000) {
          triedCopyBtn = true;
          clickCopyLinkButton();
        }

        setTimeout(check, 60);
      };
      check();
    });
  }

  // ── Clipboard ──────────────────────────────────────────────

  function copyText(text) {
    return navigator.clipboard.writeText(text).catch(function (e) {
      warn("clipboard API failed, using execCommand fallback:", e);
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    });
  }

  // ── Toast ──────────────────────────────────────────────────

  function showToast(message) {
    var existing = document.getElementById("gmbs-toast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "gmbs-toast";
    toast.textContent = message.trim();
    toast.style.cssText =
      "position:fixed;bottom:32px;left:50%;transform:translateX(-50%);" +
      "background:#1a73e8;color:#fff;padding:12px 24px;border-radius:8px;" +
      "font:14px Google Sans,Roboto,Arial,sans-serif;z-index:999999;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:0;" +
      "transition:opacity .2s;pointer-events:none;" +
      "text-align:center;white-space:nowrap;line-height:1.4";
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.opacity = "1"; });
    setTimeout(function () {
      toast.style.opacity = "0";
      setTimeout(function () { toast.remove(); }, 300);
    }, 2000);
  }

  // ── Core flow ──────────────────────────────────────────────

  function cleanup() {
    closeShareDialog();
    unhideDialog();
    if (overlay) overlay.style.display = "";
    intercepting = false;
  }

  function copyAndToast(name, placeLocation, link) {
    var lines = [name, placeLocation, link].filter(Boolean);
    log("copying to clipboard:", lines.join(" | "));
    copyText(lines.join("\n")).then(function () {
      showToast("Copied: " + (name ? name.trim() : "link"));
    });
  }

  function handleShare() {
    if (intercepting) return;
    intercepting = true;

    var btn = findShareButton();
    if (!btn) { intercepting = false; return; }

    var name = getPlaceName();
    var placeLocation = getPlaceLocation();

    if (pendingLink && pendingLinkUrl === window.location.pathname) {
      log("using cached link (same place)");
      copyAndToast(name, placeLocation, pendingLink);
      intercepting = false;
      return;
    }

    pendingLink = null;
    pendingLinkUrl = null;
    hideDialog();

    if (overlay) overlay.style.display = "none";
    btn.click();
    log("share dialog triggered, waiting for link...");

    waitForLink(8000).then(
      function (link) {
        cleanup();
        if (link) {
          copyAndToast(name, placeLocation, link);
        }
      },
      function (e) {
        err("share flow failed:", e);
        cleanup();
      }
    );
  }

  // ── Overlay ────────────────────────────────────────────────

  var overlay = null;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "gmbs-overlay";
    overlay.style.cssText =
      "position:fixed;z-index:10000;cursor:pointer;background:transparent;display:none";

    var stop = function (e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    overlay.addEventListener("click", function (e) {
      stop(e);
      e.preventDefault();
      handleShare();
    });
    var evts = ["pointerdown", "mousedown", "pointerup", "mouseup"];
    for (var i = 0; i < evts.length; i++) {
      overlay.addEventListener(evts[i], stop);
    }
    document.body.appendChild(overlay);
  }

  function trackPosition() {
    if (!intercepting) {
      var btn = findShareButton();
      if (btn && overlay) {
        var rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          overlay.style.display = "block";
          overlay.style.top = rect.top + "px";
          overlay.style.left = rect.left + "px";
          overlay.style.width = rect.width + "px";
          overlay.style.height = rect.height + "px";
        } else {
          overlay.style.display = "none";
        }
      } else if (overlay) {
        overlay.style.display = "none";
      }
    }
    requestAnimationFrame(trackPosition);
  }

  // ── Init ───────────────────────────────────────────────────

  function init() {
    chrome.storage.local.get("debug", function (data) {
      debug = !!data.debug;
      if (debug) {
        document.documentElement.setAttribute("data-gmbs-debug", "");
        console.log(TAG, "debug logging enabled");
      }
    });
    createOverlay();
    trackPosition();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
