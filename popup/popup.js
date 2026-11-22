const DEFAULTS = { titlePages: false, convertOffice: true, keepOriginals: false };
const saved = document.getElementById('saved');
let hideTimer;

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  for (const key of Object.keys(DEFAULTS)) {
    const box = document.getElementById(key);
    box.checked = !!settings[key];
    box.addEventListener('change', async () => {
      await chrome.storage.sync.set({ [key]: box.checked });
      saved.textContent = 'Saved. Applies to your next download.';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { saved.textContent = ''; }, 2500);
    });
  }
});
