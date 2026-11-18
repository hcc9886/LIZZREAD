const btn = document.getElementById("btn");
const stateEl = document.getElementById("state");
const siteEl = document.getElementById("site");
const warn = document.getElementById("warn");
let tabId = null;
let enabled = false;

function render() {
  stateEl.textContent = enabled ? "已开启" : "已关闭";
  stateEl.className = "state " + (enabled ? "on" : "off");
  btn.textContent = enabled ? "关闭" : "开启";
  btn.className = enabled ? "off" : "";
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs && tabs[0];
  if (!tab) return;
  tabId = tab.id;
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (e) {}
  siteEl.textContent = host || tab.url || "";
  chrome.tabs.sendMessage(tabId, { type: "getState" }, res => {
    if (chrome.runtime.lastError || !res) {
      warn.style.display = "block";
      btn.disabled = true;
      stateEl.textContent = "不可用";
      return;
    }
    enabled = !!res.enabled;
    btn.disabled = false;
    render();
  });
});

btn.addEventListener("click", () => {
  if (tabId == null) return;
  enabled = !enabled;
  render();
  chrome.tabs.sendMessage(tabId, { type: "set", enabled }, () => {
    if (chrome.runtime.lastError) { /* 页面可能已刷新 */ }
  });
});
