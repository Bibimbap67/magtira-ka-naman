importScripts('nickname.js', 'store.js', 'config.js', 'board.js');

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

// --- Leaderboard: this service worker is the only part that talks to the server ---

const board = MKN.board.create({ url: MKN.BOARD_URL });
const SYNC = 'mkn-board-sync';

// Your all-time total changed: send it in about a minute, if you joined.
// (An alarm, not a timer, because the browser can stop this worker at any time.)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[MKN.store.LIFETIME] || !(await board.me())) return;
  if (!(await chrome.alarms.get(SYNC))) chrome.alarms.create(SYNC, { delayInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name !== SYNC) return;
  const res = await board.sync();
  // Offline, too soon or a server hiccup: try again a bit later.
  if (['network', 'too_fast', 'server_error'].includes(res.error)) chrome.alarms.create(SYNC, { delayInMinutes: 2 });
});

// The popup asks for the board through messages: { type: 'board', action, nickname? }.
// Only the extension's own popup page may ask (not content scripts on chat sites).
const POPUP = chrome.runtime.getURL('popup/');
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(POPUP) || msg?.type !== 'board') return false;
  const actions = {
    join: () => board.join(msg.nickname),
    rename: () => board.rename(msg.nickname),
    leave: () => board.leave(),
    top: () => board.top(),
  };
  if (!actions[msg.action]) return false;
  actions[msg.action]().then(sendResponse, () => sendResponse({ ok: false, error: 'network' }));
  return true; // answers later
});
