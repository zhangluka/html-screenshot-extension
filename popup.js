const presetBtns = document.querySelectorAll('.ratio-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const cwInput = document.getElementById('cw');
const chInput = document.getElementById('ch');
const previewBtn = document.getElementById('preview');
const captureBtn = document.getElementById('capture');

let selectedRatio = [16, 9];
let outputMode = 'download'; // 'download' or 'copy'

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const [w, h] = btn.dataset.ratio.split(':').map(Number);
    cwInput.value = w;
    chInput.value = h;
    selectedRatio = [w, h];
  });
});

[cwInput, chInput].forEach(input => {
  input.addEventListener('input', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    selectedRatio = [Number(cwInput.value) || 1, Number(chInput.value) || 1];
  });
});

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    outputMode = btn.dataset.mode;
  });
});

// Preview: show draggable crop overlay
previewBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const msg = { type: 'preview', ratio: selectedRatio, outputMode };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, msg);
  }
  window.close();
});

// Copy blob to clipboard
async function copyBlobToClipboard(blob) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
  } catch {
    // Fallback: open image in new tab so user can copy manually
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  }
}

// Capture: directly crop centered and download/copy
captureBtn.addEventListener('click', async () => {
  captureBtn.textContent = '...';
  captureBtn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const srcW = img.width;
    const srcH = img.height;
    const targetRatio = selectedRatio[0] / selectedRatio[1];
    const srcRatio = srcW / srcH;

    let cropW, cropH, cropX, cropY;
    if (srcRatio > targetRatio) {
      cropH = srcH;
      cropW = Math.round(srcH * targetRatio);
      cropX = Math.round((srcW - cropW) / 2);
      cropY = 0;
    } else {
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
      cropX = 0;
      cropY = Math.round((srcH - cropH) / 2);
    }

    canvas.width = cropW;
    canvas.height = cropH;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    canvas.toBlob(async blob => {
      if (outputMode === 'copy') {
        await copyBlobToClipboard(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        chrome.downloads.download({
          url: url,
          filename: `screenshot-${selectedRatio[0]}x${selectedRatio[1]}-${timestamp}.png`,
          saveAs: false
        });
      }
      window.close();
    }, 'image/png');
  };
  img.src = dataUrl;
});
