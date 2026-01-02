document.addEventListener('DOMContentLoaded', async () => {
  const tabListEl = document.getElementById('tab-list');
  const toggle = document.getElementById('all-windows-toggle');

  // Mevcut pencereyi al
  const currentWindow = await chrome.windows.getCurrent();

  // İlk yükleme
  await renderTabs(false);

  // Toggle değişince yeniden render
  toggle.addEventListener('change', async () => {
    await renderTabs(toggle.checked);
  });

  async function renderTabs(allWindows) {
    tabListEl.innerHTML = '';

    // Tabları al
    const query = allWindows ? {} : { windowId: currentWindow.id };
    const tabs = await chrome.tabs.query(query);

    // Domain'e göre grupla
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

    // Tab sayısına göre sırala (çoktan aza)
    const sorted = Object.entries(grouped).sort((a, b) => b[1].tabs.length - a[1].tabs.length);

    if (sorted.length === 0) {
      tabListEl.innerHTML = '<div class="empty-message">Açık tab yok</div>';
      return;
    }

    // Her grup için HTML oluştur
    sorted.forEach(([domain, data]) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'site-group';

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
      countEl.textContent = `${data.tabs.length} tab`;

      const closeAllBtn = document.createElement('button');
      closeAllBtn.className = 'close-all-btn';
      closeAllBtn.textContent = 'Kapat';
      closeAllBtn.onclick = async (e) => {
        e.stopPropagation();
        const tabIds = data.tabs.map(t => t.id);
        await chrome.tabs.remove(tabIds);
        groupEl.remove();
      };

      infoEl.appendChild(domainEl);
      infoEl.appendChild(countEl);

      headerEl.appendChild(faviconEl);
      headerEl.appendChild(infoEl);
      headerEl.appendChild(closeAllBtn);

      // Expandable tab listesi
      const expandedEl = document.createElement('div');
      expandedEl.className = 'tab-list-expanded';
      expandedEl.style.display = 'none';

      data.tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';

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
        closeBtn.onclick = async () => {
          await chrome.tabs.remove(tab.id);
          tabEl.remove();
          const remaining = expandedEl.querySelectorAll('.tab-item');
          if (remaining.length === 0) {
            groupEl.remove();
          } else {
            countEl.textContent = `${remaining.length} tab`;
          }
        };

        tabEl.appendChild(titleEl);
        tabEl.appendChild(closeBtn);
        expandedEl.appendChild(tabEl);
      });

      // Header'a tıklayınca genişlet/daralt
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
