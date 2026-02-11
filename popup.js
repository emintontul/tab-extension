// i18n helper
const i18n = (key) => chrome.i18n.getMessage(key);

document.addEventListener('DOMContentLoaded', async () => {
  // Set localized labels
  document.getElementById('label-this').textContent = i18n('thisWindow');
  document.getElementById('label-all').textContent = i18n('allWindows');
  document.getElementById('search-input').placeholder = i18n('search');
  document.getElementById('close-selected-btn').textContent = i18n('closeSelected');

  const tabListEl = document.getElementById('tab-list');
  const toggle = document.getElementById('all-windows-toggle');
  const searchInput = document.getElementById('search-input');
  const themeToggle = document.getElementById('theme-toggle');
  const selectionBar = document.getElementById('selection-bar');
  const selectedCountEl = document.getElementById('selected-count');
  const closeSelectedBtn = document.getElementById('close-selected-btn');

  // Get current window and active tab
  const currentWindow = await chrome.windows.getCurrent();
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab?.id;

  // Theme management
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
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

  // Close selected button
  closeSelectedBtn.addEventListener('click', async () => {
    if (selectedTabs.size === 0) return;

    // Always exclude current tab from closing
    selectedTabs.delete(activeTabId);
    const checkbox = document.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (checkbox) checkbox.checked = false;

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
    const allTabs = await chrome.tabs.query(query);

    // Filter out pinned tabs
    const tabs = allTabs.filter(tab => !tab.pinned);

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
        grouped[domain].tabs.push(tab);
      } catch (e) {
        const domain = 'other';
        if (!grouped[domain]) {
          grouped[domain] = { tabs: [], favicon: null };
        }
        grouped[domain].tabs.push(tab);
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

      // Filter out current tab from closeable tabs
      const closeableTabs = data.tabs.filter(t => t.id !== activeTabId);
      const hasCurrentTab = data.tabs.some(t => t.id === activeTabId);

      const closeAllBtn = document.createElement('button');
      closeAllBtn.className = 'close-all-btn';

      // If only current tab in group, hide close button
      if (closeableTabs.length === 0) {
        closeAllBtn.style.display = 'none';
      } else {
        closeAllBtn.textContent = i18n('close');
      }

      closeAllBtn.onclick = async (e) => {
        e.stopPropagation();

        // Close all except current tab
        const tabIds = closeableTabs.map(t => t.id);
        if (tabIds.length === 0) return;

        await chrome.tabs.remove(tabIds);

        // If current tab was in this group, keep the group with just current tab
        if (hasCurrentTab) {
          countEl.textContent = `1 ${i18n('tab')}`;
          // Remove closed tabs from expanded list
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
        if (isCurrentTab) {
          tabEl.classList.add('current-tab');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tab-checkbox';
        checkbox.dataset.tabId = tab.id;
        checkbox.checked = selectedTabs.has(tab.id);
        checkbox.onclick = (e) => e.stopPropagation();

        // Disable checkbox for current tab
        if (isCurrentTab) {
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

        // Hide close button for current tab
        if (isCurrentTab) {
          closeBtn.style.visibility = 'hidden';
        }

        closeBtn.onclick = async (e) => {
          e.stopPropagation();
          if (isCurrentTab) return; // Extra safety

          await chrome.tabs.remove(tab.id);
          selectedTabs.delete(tab.id);
          tabEl.remove();

          const remaining = expandedEl.querySelectorAll('.tab-item');
          if (remaining.length === 0) {
            groupEl.remove();
          } else {
            const newTabWord = remaining.length === 1 ? i18n('tab') : i18n('tabs');
            countEl.textContent = `${remaining.length} ${newTabWord}`;
            // Hide group close button if only current tab remains
            if (remaining.length === 1 && remaining[0].classList.contains('current-tab')) {
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
