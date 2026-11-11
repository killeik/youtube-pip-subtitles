// Keep extension storage out of the page's JavaScript context.
(() => {
  const defaults = {
    fontSize: 16,
    fontFamily: 'Trebuchet MS',
    textColor: '#ffffff',
    bgColor: 'rgba(0,0,0,0.75)',
    position: 'bottom',
  };
  async function sendSettings() {
    const settings = await chrome.storage.local.get(defaults);
    window.dispatchEvent(
      new CustomEvent('youtube-pip-settings', {
        detail: JSON.stringify(settings),
      }),
    );
  }
  window.addEventListener('youtube-pip-ready', sendSettings);
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') sendSettings();
  });
  sendSettings();
})();
