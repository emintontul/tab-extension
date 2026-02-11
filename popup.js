// i18n helper
const i18n = (key) => chrome.i18n.getMessage(key);

document.addEventListener('DOMContentLoaded', async () => {
  // Set localized labels
  document.getElementById('label-this').textContent = i18n('thisWindow');
  document.getElementById('label-all').textContent = i18n('allWindows');
  document.getElementById('search-input').placeholder = i18n('search');
  document.getElementById('close-selected-btn').textContent = i18n('closeSelected');
  document.getElementById('undo-title').textContent = i18n('recentlyClosed');
  document.getElementById('sessions-title').textContent = i18n('sessions');
  document.getElementById('session-name-input').placeholder = i18n('sessionName');
  document.getElementById('label-duplicates').textContent = i18n('duplicates');
  document.getElementById('label-undo').textContent = i18n('undo');
  document.getElementById('label-sessions').textContent = i18n('sessions');

  const tabListEl = document.getElementById('tab-list');
  const toggle = document.getElementById('all-windows-toggle');
  const searchInput = document.getElementById('search-input');
  const themeToggle = document.getElementById('theme-toggle');
  const settingsBtn = document.getElementById('settings-btn');
  const selectionBar = document.getElementById('selection-bar');
  const selectedCountEl = document.getElementById('selected-count');
  const closeSelectedBtn = document.getElementById('close-selected-btn');

  // New elements
  const duplicatesBtn = document.getElementById('duplicates-btn');
  const undoBtn = document.getElementById('undo-btn');
  const sessionsBtn = document.getElementById('sessions-btn');
  const undoPanel = document.getElementById('undo-panel');
  const undoList = document.getElementById('undo-list');
  const sessionsPanel = document.getElementById('sessions-panel');
  const sessionsList = document.getElementById('sessions-list');
  const sessionNameInput = document.getElementById('session-name-input');
  const saveSessionBtn = document.getElementById('save-session-btn');
  const toast = document.getElementById('toast');

  // Get current window and active tab
  const currentWindow = await chrome.windows.getCurrent();
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab?.id;

  // Load settings
  const settings = await chrome.storage.sync.get({
    protectCurrentTab: true,
    darkMode: null
  });

  let protectCurrentTab = settings.protectCurrentTab;
  let showDuplicatesOnly = false;
  let allTabs = [];

  // Theme management
  if (settings.darkMode === true || (settings.darkMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }

  themeToggle.addEventListener('click', async () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    await chrome.storage.sync.set({ darkMode: isDark });
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Track selected tabs
  let selectedTabs = new Set();

  // Initial render
  await renderTabs(false);

  // Toggle change
  toggle.addEventListener('change', async () => {
    selectedTabs.clear();
    updateSelectionBar();
    await renderTabs(toggle.checked);
  });

  // Search functionality
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    const groups = tabListEl.querySelectorAll('.site-group');

    groups.forEach(group => {
      const domain = group.dataset.domain.toLowerCase();
      const tabTitles = Array.from(group.querySelectorAll('.tab-title')).map(el => el.textContent.toLowerCase());
      const matches = domain.includes(query) || tabTitles.some(title => title.includes(query));
      group.classList.toggle('hidden', !matches);
    });
  });

  // ========== DUPLICATE FINDER ==========
  duplicatesBtn.addEventListener('click', async () => {
    showDuplicatesOnly = !showDuplicatesOnly;
    duplicatesBtn.classList.toggle('active', showDuplicatesOnly);
    await renderTabs(toggle.checked);
  });

  // ========== UNDO / RECENTLY CLOSED ==========
  undoBtn.addEventListener('click', async () => {
    sessionsPanel.classList.add('hidden');
    undoPanel.classList.toggle('hidden');

    if (!undoPanel.classList.contains('hidden')) {
      await loadRecentlyClosed();
    }
  });

  async function loadRecentlyClosed() {
    undoList.innerHTML = '';

    chrome.runtime.sendMessage({ action: 'getRecentlyClosed' }, (response) => {
      if (!response || !response.tabs || response.tabs.length === 0) {
        undoList.innerHTML = `<div class="panel-empty">${i18n('noRecentlyClosed')}</div>`;
        return;
      }

      response.tabs.forEach(tab => {
        const item = document.createElement('div');
        item.className = 'panel-item';

        const favicon = document.createElement('img');
        favicon.className = 'panel-item-favicon';
        favicon.src = tab.favIconUrl || getFallbackFavicon(new URL(tab.url).hostname);
        favicon.onerror = () => {
          favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23666" width="100" height="100" rx="10"/></svg>';
        };

        const info = document.createElement('div');
        info.className = 'panel-item-info';

        const title = document.createElement('div');
        title.className = 'panel-item-title';
        title.textContent = tab.title || 'Untitled';

        const url = document.createElement('div');
        url.className = 'panel-item-url';
        url.textContent = tab.url;

        info.appendChild(title);
        info.appendChild(url);

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'panel-item-btn';
        restoreBtn.textContent = i18n('restore');
        restoreBtn.onclick = (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: 'restoreTab', sessionId: tab.sessionId }, () => {
            item.remove();
            if (undoList.querySelectorAll('.panel-item').length === 0) {
              undoList.innerHTML = `<div class="panel-empty">${i18n('noRecentlyClosed')}</div>`;
            }
          });
        };

        item.appendChild(favicon);
        item.appendChild(info);
        item.appendChild(restoreBtn);
        undoList.appendChild(item);
      });
    });
  }

  // ========== SESSIONS ==========
  sessionsBtn.addEventListener('click', async () => {
    undoPanel.classList.add('hidden');
    sessionsPanel.classList.toggle('hidden');

    if (!sessionsPanel.classList.contains('hidden')) {
      await loadSessions();
    }
  });

  async function loadSessions() {
    const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
    sessionsList.innerHTML = '';

    if (savedSessions.length === 0) {
      sessionsList.innerHTML = `<div class="panel-empty">${i18n('noSavedSessions')}</div>`;
      return;
    }

    savedSessions.forEach((session, index) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'site-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'site-header';

      // Session icon
      const iconEl = document.createElement('div');
      iconEl.className = 'session-icon';
      iconEl.textContent = '📁';

      const infoEl = document.createElement('div');
      infoEl.className = 'site-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'site-domain';
      nameEl.textContent = session.name;

      const countEl = document.createElement('div');
      countEl.className = 'site-count';
      countEl.textContent = `${session.tabs.length} ${session.tabs.length === 1 ? i18n('tab') : i18n('tabs')}`;

      infoEl.appendChild(nameEl);
      infoEl.appendChild(countEl);

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'close-all-btn';
      restoreBtn.style.background = 'var(--accent)';
      restoreBtn.textContent = i18n('restore');
      restoreBtn.onclick = async (e) => {
        e.stopPropagation();
        for (const url of session.tabs) {
          await chrome.tabs.create({ url, active: false });
        }
        showToast(`${session.name} restored`);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'close-all-btn';
      deleteBtn.style.marginLeft = '6px';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        savedSessions.splice(index, 1);
        await chrome.storage.local.set({ savedSessions });
        await loadSessions();
      };

      headerEl.appendChild(iconEl);
      headerEl.appendChild(infoEl);
      headerEl.appendChild(restoreBtn);
      headerEl.appendChild(deleteBtn);

      // Expanded list showing URLs
      const expandedEl = document.createElement('div');
      expandedEl.className = 'tab-list-expanded';
      expandedEl.style.display = 'none';

      session.tabs.forEach(url => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';

        let domain = 'unknown';
        try {
          domain = new URL(url).hostname.replace('www.', '');
        } catch (e) {}

        const titleEl = document.createElement('span');
        titleEl.className = 'tab-title';
        titleEl.textContent = domain;
        titleEl.title = url;

        tabEl.appendChild(titleEl);
        expandedEl.appendChild(tabEl);
      });

      headerEl.onclick = (e) => {
        if (e.target === restoreBtn || e.target === deleteBtn) return;
        expandedEl.style.display = expandedEl.style.display === 'none' ? 'block' : 'none';
      };

      groupEl.appendChild(headerEl);
      groupEl.appendChild(expandedEl);
      sessionsList.appendChild(groupEl);
    });
  }

  saveSessionBtn.addEventListener('click', async () => {
    const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
    const query = toggle.checked ? {} : { windowId: currentWindow.id };
    const tabs = await chrome.tabs.query(query);
    const urls = tabs.filter(t => !t.pinned).map(t => t.url);

    const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
    savedSessions.unshift({ name, tabs: urls, date: Date.now() });
    await chrome.storage.local.set({ savedSessions });

    sessionNameInput.value = '';
    showToast(i18n('sessionSaved'));
    await loadSessions();
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach(btn => {
    btn.onclick = () => {
      undoPanel.classList.add('hidden');
      sessionsPanel.classList.add('hidden');
    };
  });

  // Toast helper
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2000);
  }

  // Close selected button
  closeSelectedBtn.addEventListener('click', async () => {
    if (selectedTabs.size === 0) return;

    // Exclude current tab if protected
    if (protectCurrentTab) {
      selectedTabs.delete(activeTabId);
      const checkbox = document.querySelector(`[data-tab-id="${activeTabId}"]`);
      if (checkbox) checkbox.checked = false;
    }

    if (selectedTabs.size === 0) {
      updateSelectionBar();
      return;
    }

    await chrome.tabs.remove([...selectedTabs]);
    selectedTabs.clear();
    updateSelectionBar();
    await renderTabs(toggle.checked);
  });

  function updateSelectionBar() {
    if (selectedTabs.size > 0) {
      selectionBar.classList.remove('hidden');
      selectedCountEl.textContent = i18n('selectedCount').replace('{count}', selectedTabs.size);
    } else {
      selectionBar.classList.add('hidden');
    }
  }

  async function renderTabs(allWindows) {
    tabListEl.innerHTML = '';

    const query = allWindows ? {} : { windowId: currentWindow.id };
    allTabs = await chrome.tabs.query(query);

    // Filter out pinned tabs
    let tabs = allTabs.filter(tab => !tab.pinned);

    // Find duplicates
    const urlCount = {};
    tabs.forEach(tab => {
      urlCount[tab.url] = (urlCount[tab.url] || 0) + 1;
    });
    const duplicateUrls = new Set(Object.keys(urlCount).filter(url => urlCount[url] > 1));

    // If showing duplicates only, filter
    if (showDuplicatesOnly) {
      tabs = tabs.filter(tab => duplicateUrls.has(tab.url));

      if (tabs.length === 0) {
        tabListEl.innerHTML = `<div class="empty-message">${i18n('noDuplicates')}</div>`;
        return;
      }
    }

    const grouped = {};

    tabs.forEach(tab => {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace('www.', '');

        if (!grouped[domain]) {
          grouped[domain] = {
            tabs: [],
            favicon: tab.favIconUrl || getFallbackFavicon(domain)
          };
        }
        grouped[domain].tabs.push({ ...tab, isDuplicate: duplicateUrls.has(tab.url) });
      } catch (e) {
        const domain = 'other';
        if (!grouped[domain]) {
          grouped[domain] = { tabs: [], favicon: null };
        }
        grouped[domain].tabs.push({ ...tab, isDuplicate: duplicateUrls.has(tab.url) });
      }
    });

    const sorted = Object.entries(grouped).sort((a, b) => b[1].tabs.length - a[1].tabs.length);

    if (sorted.length === 0) {
      tabListEl.innerHTML = `<div class="empty-message">${i18n('noTabs')}</div>`;
      return;
    }

    sorted.forEach(([domain, data]) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'site-group';
      groupEl.dataset.domain = domain;

      const headerEl = document.createElement('div');
      headerEl.className = 'site-header';

      const faviconEl = document.createElement('img');
      faviconEl.className = 'site-favicon';
      faviconEl.src = data.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23666" width="100" height="100" rx="10"/></svg>';
      faviconEl.onerror = () => {
        faviconEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23666" width="100" height="100" rx="10"/></svg>';
      };

      const infoEl = document.createElement('div');
      infoEl.className = 'site-info';

      const domainEl = document.createElement('div');
      domainEl.className = 'site-domain';
      domainEl.textContent = domain;

      const countEl = document.createElement('div');
      countEl.className = 'site-count';
      const tabWord = data.tabs.length === 1 ? i18n('tab') : i18n('tabs');
      countEl.textContent = `${data.tabs.length} ${tabWord}`;

      // Filter out current tab from closeable tabs if protected
      const closeableTabs = protectCurrentTab
        ? data.tabs.filter(t => t.id !== activeTabId)
        : data.tabs;
      const hasCurrentTab = data.tabs.some(t => t.id === activeTabId);

      const closeAllBtn = document.createElement('button');
      closeAllBtn.className = 'close-all-btn';

      // If only current tab in group and protected, hide close button
      if (closeableTabs.length === 0) {
        closeAllBtn.style.display = 'none';
      } else {
        closeAllBtn.textContent = i18n('close');
      }

      closeAllBtn.onclick = async (e) => {
        e.stopPropagation();

        const tabIds = closeableTabs.map(t => t.id);
        if (tabIds.length === 0) return;

        await chrome.tabs.remove(tabIds);

        if (hasCurrentTab && protectCurrentTab) {
          countEl.textContent = `1 ${i18n('tab')}`;
          expandedEl.querySelectorAll('.tab-item:not(.current-tab)').forEach(el => el.remove());
          closeAllBtn.style.display = 'none';
        } else {
          groupEl.remove();
        }
      };

      infoEl.appendChild(domainEl);
      infoEl.appendChild(countEl);

      headerEl.appendChild(faviconEl);
      headerEl.appendChild(infoEl);
      headerEl.appendChild(closeAllBtn);

      const expandedEl = document.createElement('div');
      expandedEl.className = 'tab-list-expanded';
      expandedEl.style.display = 'none';

      data.tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';

        const isCurrentTab = tab.id === activeTabId;
        const isProtected = isCurrentTab && protectCurrentTab;

        if (isCurrentTab) {
          tabEl.classList.add('current-tab');
        }

        if (tab.isDuplicate) {
          tabEl.classList.add('duplicate');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tab-checkbox';
        checkbox.dataset.tabId = tab.id;
        checkbox.checked = selectedTabs.has(tab.id);
        checkbox.onclick = (e) => e.stopPropagation();

        // Disable checkbox for protected current tab
        if (isProtected) {
          checkbox.disabled = true;
          checkbox.style.opacity = '0.3';
        }

        checkbox.onchange = () => {
          if (checkbox.checked) {
            selectedTabs.add(tab.id);
          } else {
            selectedTabs.delete(tab.id);
          }
          updateSelectionBar();
        };

        const titleEl = document.createElement('span');
        titleEl.className = 'tab-title';
        titleEl.textContent = tab.title || 'Untitled';
        titleEl.title = tab.url;
        titleEl.onclick = () => {
          chrome.tabs.update(tab.id, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';

        // Hide close button for protected current tab
        if (isProtected) {
          closeBtn.style.visibility = 'hidden';
        }

        closeBtn.onclick = async (e) => {
          e.stopPropagation();
          if (isProtected) return;

          await chrome.tabs.remove(tab.id);
          selectedTabs.delete(tab.id);
          tabEl.remove();

          const remaining = expandedEl.querySelectorAll('.tab-item');
          if (remaining.length === 0) {
            groupEl.remove();
          } else {
            const newTabWord = remaining.length === 1 ? i18n('tab') : i18n('tabs');
            countEl.textContent = `${remaining.length} ${newTabWord}`;
            if (remaining.length === 1 && remaining[0].classList.contains('current-tab') && protectCurrentTab) {
              closeAllBtn.style.display = 'none';
            }
          }
          updateSelectionBar();
        };

        tabEl.appendChild(checkbox);
        tabEl.appendChild(titleEl);

        if (isCurrentTab) {
          const badge = document.createElement('span');
          badge.className = 'current-badge';
          badge.textContent = i18n('current');
          tabEl.appendChild(badge);
        }

        if (tab.isDuplicate && !isCurrentTab) {
          const dupBadge = document.createElement('span');
          dupBadge.className = 'duplicate-badge';
          dupBadge.textContent = i18n('duplicate');
          tabEl.appendChild(dupBadge);
        }

        tabEl.appendChild(closeBtn);
        expandedEl.appendChild(tabEl);
      });

      headerEl.onclick = (e) => {
        if (e.target === closeAllBtn) return;
        expandedEl.style.display = expandedEl.style.display === 'none' ? 'block' : 'none';
      };

      groupEl.appendChild(headerEl);
      groupEl.appendChild(expandedEl);
      tabListEl.appendChild(groupEl);
    });
  }
});

function getFallbackFavicon(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}
