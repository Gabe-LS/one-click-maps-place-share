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

  // ── Main flow: interceptor caught a short link ─────────────

  document.addEventListener("gmbs-short-link", function (e) {
    pendingLink = e.detail;
    pendingLinkUrl = window.location.pathname;

    if (!intercepting) {
      intercepting = true;
      hideDialog();
      collectPlaceInfo(2000).then(function (info) {
        closeShareDialog();
        unhideDialog();
        copyAndToast(info.name, info.location, pendingLink);
        intercepting = false;
      });
    }
  });

  // ── Share button click detection ───────────────────────────
  // Capturing listener hides the dialog before it can render.

  function isShareButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    var jslog = el.getAttribute("jslog") || "";
    if (jslog.indexOf("13534") === 0 || jslog.indexOf("14906") === 0) return true;
    var icon = el.querySelector("span");
    if (icon && icon.textContent.trim() === SHARE_ICON) return true;
    return false;
  }

  document.addEventListener("click", function (e) {
    if (intercepting) return;
    var btn = e.target.closest("button");
    if (btn && isShareButton(btn)) {
      log("share click detected, hiding dialog");
      hideDialog();
      setTimeout(function () {
        if (!intercepting) unhideDialog();
      }, 10000);
    }
  }, true);

  // ── Dialog hiding ───────────────────────────────────────────

  function hideDialog() {
    document.documentElement.setAttribute("data-gmbs-hiding", "");
  }

  function unhideDialog() {
    document.documentElement.removeAttribute("data-gmbs-hiding");
  }

  // ── Place info from page ───────────────────────────────────

  function isDirectionsPage() {
    return window.location.pathname.indexOf("/maps/dir/") !== -1;
  }

  var TRAVEL_MODES = { "0": "By car", "1": "By bike", "2": "On foot", "3": "By public transport" };

  function getDirectionsInfo() {
    var match = window.location.pathname.match(/\/maps\/dir\/(.+)/);
    if (!match) return { name: null, location: null };
    var parts = match[1].split("/");
    var waypoints = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].charAt(0) === "@" || parts[i].indexOf("data=") !== -1 || parts[i].indexOf("am=") !== -1) break;
      var decoded = decodeURIComponent(parts[i].replace(/\+/g, " "));
      var name = decoded.split(",")[0].trim();
      if (name) waypoints.push(name);
    }
    var dirName = waypoints.length >= 2 ? waypoints.join(" → ") : null;
    var h1s = document.querySelectorAll("h1");
    var duration = null;
    for (var j = 0; j < h1s.length; j++) {
      if (!h1s[j].closest('[role="dialog"]')) {
        var raw = h1s[j].textContent.trim();
        var timeRange = raw.match(/^\d{1,2}[.:]\d{2}.*[-–].*\d{1,2}[.:]\d{2}.*\((.+)\)\s*$/);
        duration = timeRange ? timeRange[1].trim() : raw.split("(")[0].trim();
        break;
      }
    }
    var mode = null;
    var selected = document.querySelector('[data-travel_mode].vSX6le');
    if (selected) mode = selected.getAttribute("data-travel_mode");
    if (!mode) {
      var modeMatches = window.location.href.match(/!3e(\d)/g);
      if (modeMatches) mode = modeMatches[modeMatches.length - 1].charAt(3);
    }
    var modeLabel = mode ? TRAVEL_MODES[mode] || "" : "";
    var location = null;
    if (duration && modeLabel) location = duration + " " + modeLabel.toLowerCase();
    else if (duration) location = duration;
    else if (modeLabel) location = modeLabel;
    return { name: dirName, location: location };
  }

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

    var h1s = document.querySelectorAll("h1");
    for (var i = 0; i < h1s.length; i++) {
      if (!h1s[i].closest('[role="dialog"]')) {
        var h1Text = h1s[i].textContent.trim().replace(PUA_RE, "");
        if (h1Text) return h1Text;
      }
    }

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

  function collectPlaceInfo(timeoutMs) {
    return new Promise(function (resolve) {
      if (isDirectionsPage()) {
        resolve(getDirectionsInfo());
        return;
      }
      var name = getPlaceName();
      var loc = getPlaceLocation();
      if (loc) {
        resolve({ name: name, location: loc });
        return;
      }
      log("address not ready, polling up to", timeoutMs, "ms");
      var start = Date.now();
      var check = function () {
        name = getPlaceName();
        loc = getPlaceLocation();
        if (loc || Date.now() - start > timeoutMs) {
          resolve({ name: name, location: loc });
          return;
        }
        setTimeout(check, 100);
      };
      setTimeout(check, 100);
    });
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

  // ── Core helpers ───────────────────────────────────────────

  function copyAndToast(name, placeLocation, link) {
    var lines = [name, placeLocation, link].filter(Boolean);
    log("copying to clipboard:", lines.join(" | "));
    copyText(lines.join("\n")).then(function () {
      showToast("Copied: " + (name ? name.trim() : "link"));
    });
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
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
