// Update badge with tab count
async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const count = tabs.filter(t => !t.pinned).length;
  chrome.action.setBadgeText({ text: count.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#007AFF' });
}

// Track recently closed tabs for undo
let recentlyClosed = [];
const MAX_CLOSED = 25;

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  updateBadge();
});

chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    updateBadge();
  }
});

// Initial badge update
updateBadge();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRecentlyClosed') {
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
      const closedTabs = sessions
        .filter(s => s.tab)
        .map(s => ({
          sessionId: s.tab.sessionId,
          title: s.tab.title,
          url: s.tab.url,
          favIconUrl: s.tab.favIconUrl
        }));
      sendResponse({ tabs: closedTabs });
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'restoreTab') {
    chrome.sessions.restore(request.sessionId, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
