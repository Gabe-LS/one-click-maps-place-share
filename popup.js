var checkbox = document.getElementById("debug");

chrome.storage.local.get("debug", function (data) {
  checkbox.checked = !!data.debug;
});

checkbox.addEventListener("change", function () {
  chrome.storage.local.set({ debug: checkbox.checked }, function () {
    chrome.tabs.query({ url: ["https://www.google.com/maps/*", "https://*.google.com/maps/*"] }, function (tabs) {
      for (var i = 0; i < tabs.length; i++) {
        chrome.tabs.reload(tabs[i].id);
      }
    });
  });
});
