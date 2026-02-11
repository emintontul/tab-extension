const i18n = (key) => chrome.i18n.getMessage(key);

document.addEventListener('DOMContentLoaded', async () => {
  // Set localized text
  document.getElementById('title').textContent = i18n('settingsTitle') || 'Settings';
  document.getElementById('protect-current-title').textContent = i18n('protectCurrentTitle') || 'Protect current tab';
  document.getElementById('protect-current-desc').textContent = i18n('protectCurrentDesc') || "Never close the tab you're currently viewing";
  document.getElementById('dark-mode-title').textContent = i18n('darkModeTitle') || 'Dark mode';
  document.getElementById('dark-mode-desc').textContent = i18n('darkModeDesc') || 'Use dark theme';
  document.getElementById('saved-msg').textContent = i18n('settingsSaved') || 'Settings saved';

  const protectCurrentEl = document.getElementById('protect-current');
  const darkModeEl = document.getElementById('dark-mode');
  const savedMsg = document.getElementById('saved-msg');

  // Load saved settings
  const settings = await chrome.storage.sync.get({
    protectCurrentTab: true,
    darkMode: null
  });

  protectCurrentEl.checked = settings.protectCurrentTab;
  darkModeEl.checked = settings.darkMode === true;

  // Save on change
  function showSaved() {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 1500);
  }

  protectCurrentEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ protectCurrentTab: protectCurrentEl.checked });
    showSaved();
  });

  darkModeEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ darkMode: darkModeEl.checked });
    showSaved();
  });
});
