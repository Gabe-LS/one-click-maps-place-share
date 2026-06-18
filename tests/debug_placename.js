// Paste in Console on a Google Maps place page.
// Reports what getPlaceName() would see and which strategy would fire.

(function () {
  var PUA_RE = new RegExp("^[\\ue000-\\uf8ff]+\\s*");

  console.group("[GMBS debug] Place name diagnosis");

  // Strategy 1: all h1 elements
  var h1s = document.querySelectorAll("h1");
  console.log("h1 elements found:", h1s.length);
  for (var i = 0; i < h1s.length; i++) {
    var raw = h1s[i].textContent;
    var trimmed = raw.trim();
    var stripped = trimmed.replace(PUA_RE, "");
    var visible = h1s[i].offsetParent !== null || h1s[i].getBoundingClientRect().height > 0;
    console.log("  h1[" + i + "]:", {
      raw: JSON.stringify(raw),
      trimmed: JSON.stringify(trimmed),
      stripped: JSON.stringify(stripped),
      visible: visible,
      parent: h1s[i].parentElement ? h1s[i].parentElement.tagName + "." + h1s[i].parentElement.className.split(" ")[0] : "none",
      html: h1s[i].outerHTML.substring(0, 200)
    });
    if (stripped) {
      console.log("  >>> Strategy 1 MATCH: would return", JSON.stringify(stripped));
    }
  }

  // Strategy 2: page title
  var title = document.title || "";
  var cleaned = title.replace(/\s*[-–—·]\s*Google\s+Maps.*$/i, "").trim();
  console.log("document.title:", JSON.stringify(title));
  console.log("  cleaned:", JSON.stringify(cleaned));
  if (cleaned && cleaned !== title.trim()) {
    console.log("  >>> Strategy 2 MATCH: would return", JSON.stringify(cleaned));
  } else {
    console.log("  >>> Strategy 2: no match (cleaned === title or empty)");
  }

  // Strategy 3: URL path
  var pathname = window.location.pathname;
  var pathMatch = pathname.match(/\/maps\/place\/([^\/@]+)/);
  console.log("pathname:", pathname);
  if (pathMatch) {
    var decoded = decodeURIComponent(pathMatch[1].replace(/\+/g, " ")).trim();
    console.log("  path segment:", JSON.stringify(pathMatch[1]));
    console.log("  decoded:", JSON.stringify(decoded));
    if (decoded) {
      console.log("  >>> Strategy 3 MATCH: would return", JSON.stringify(decoded));
    }
  } else {
    console.log("  >>> Strategy 3: no /maps/place/ in URL");
  }

  // Also log what the old code would have returned
  var oldH1 = document.querySelector("h1");
  var oldResult = oldH1 ? oldH1.textContent.trim() : null;
  console.log("\nOLD getPlaceName() would return:", JSON.stringify(oldResult));

  // And what getPlaceLocation returns
  var addrBtn = document.querySelector('button[data-item-id*="address"]');
  var addr = addrBtn ? addrBtn.textContent.trim().replace(PUA_RE, "") : null;
  console.log("getPlaceLocation() returns:", JSON.stringify(addr));

  console.groupEnd();
})();
