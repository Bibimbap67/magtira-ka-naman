// After the extension is installed or updated (including ↻ on the extensions page),
// chat tabs that were already open still run the old copy, which is cut off: it can't
// hear the popup's switch. Put the new copy into those tabs so they work without a reload.
// (content.js removes the old glass before adding its own.)
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  const [{ matches, js, css }] = chrome.runtime.getManifest().content_scripts;
  for (const tab of await chrome.tabs.query({ url: matches })) {
    const target = { tabId: tab.id };
    chrome.scripting.insertCSS({ target, files: css }).catch(() => {});
    chrome.scripting.executeScript({ target, files: js }).catch(() => {}); // e.g. a tab still loading
  }
});
