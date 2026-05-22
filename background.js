chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'doCapture') {
    const { x, y, w, h, dpr } = msg.rect;

    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then(dataUrl => {
        // Send full screenshot back to content script for cropping
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'cropAndDownload',
          dataUrl,
          rect: msg.rect
        });
      })
      .catch(err => console.error('Capture failed:', err));
  }
  return true;
});
