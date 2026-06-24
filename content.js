let overlay = null;
let cropBox = null;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let cropStart = { x: 0, y: 0 };
let currentRatio = [16, 9];
let currentOutputMode = 'download';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'preview') {
    currentRatio = msg.ratio;
    currentOutputMode = msg.outputMode || 'download';
    showOverlay(msg.ratio);
  } else if (msg.type === 'capture') {
    quickCapture(msg.ratio);
  } else if (msg.type === 'cropAndDownload') {
    cropAndSave(msg.dataUrl, msg.rect);
  }
});

// Direct capture from popup (no preview)
async function quickCapture(ratio) {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const targetRatio = ratio[0] / ratio[1];
  const srcRatio = vw / vh;

  let cropW, cropH;
  if (srcRatio > targetRatio) {
    cropH = vh;
    cropW = Math.round(vh * targetRatio);
  } else {
    cropW = vw;
    cropH = Math.round(vw / targetRatio);
  }

  chrome.runtime.sendMessage({
    type: 'doCapture',
    rect: {
      x: (vw - cropW) / 2,
      y: (vh - cropH) / 2,
      w: cropW,
      h: cropH,
      dpr
    }
  });
}

function showOverlay(ratio) {
  removeOverlay();

  overlay = document.createElement('div');
  overlay.id = 'screenshot-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483646;
    background: rgba(0,0,0,0.4);
    cursor: crosshair;
  `;

  cropBox = document.createElement('div');
  cropBox.id = 'screenshot-crop';
  cropBox.style.cssText = `
    position: absolute;
    border: 2px solid #d97757;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.4);
    cursor: move;
    z-index: 2147483647;
  `;

  // Size label
  const label = document.createElement('div');
  label.id = 'screenshot-label';
  label.style.cssText = `
    position: absolute; top: -32px; left: 50%; transform: translateX(-50%);
    background: #d97757; color: #fff;
    font: 600 12px -apple-system, sans-serif;
    padding: 4px 12px; border-radius: 100vw;
    white-space: nowrap; pointer-events: none;
  `;

  // Corner handles
  const handles = ['nw', 'ne', 'sw', 'se'];
  handles.forEach(pos => {
    const handle = document.createElement('div');
    handle.dataset.handle = pos;
    const isTop = pos.includes('n');
    const isLeft = pos.includes('w');
    handle.style.cssText = `
      position: absolute;
      width: 12px; height: 12px;
      background: #d97757;
      border: 2px solid #fff;
      border-radius: 2px;
      ${isTop ? 'top' : 'bottom'}: -6px;
      ${isLeft ? 'left' : 'right'}: -6px;
      cursor: ${isTop === isLeft ? 'nwse-resize' : 'nesw-resize'};
      z-index: 2147483647;
    `;
    cropBox.appendChild(handle);
  });

  // Confirm button
  const confirmBtn = document.createElement('div');
  confirmBtn.id = 'screenshot-confirm';
  confirmBtn.textContent = '✓ Capture';
  confirmBtn.style.cssText = `
    position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%);
    background: #141413; color: #faf9f5;
    font: 500 13px -apple-system, sans-serif;
    padding: 8px 20px; border-radius: 6px;
    cursor: pointer; pointer-events: auto;
    transition: background 0.15s;
  `;
  confirmBtn.addEventListener('mouseenter', () => confirmBtn.style.background = '#3d3d3a');
  confirmBtn.addEventListener('mouseleave', () => confirmBtn.style.background = '#141413');
  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    captureArea();
  });

  // Cancel hint
  const cancelHint = document.createElement('div');
  cancelHint.textContent = 'ESC to cancel';
  cancelHint.style.cssText = `
    position: absolute; bottom: -40px; right: 0;
    font: 400 11px -apple-system, sans-serif;
    color: rgba(255,255,255,0.6);
    pointer-events: none;
  `;

  cropBox.appendChild(label);
  cropBox.appendChild(confirmBtn);
  cropBox.appendChild(cancelHint);
  overlay.appendChild(cropBox);
  document.body.appendChild(overlay);

  // Init crop size centered
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const targetRatio = ratio[0] / ratio[1];
  let cropW, cropH;

  if (vw / vh > targetRatio) {
    cropH = vh * 0.6;
    cropW = cropH * targetRatio;
  } else {
    cropW = vw * 0.6;
    cropH = cropW / targetRatio;
  }

  const cropX = (vw - cropW) / 2;
  const cropY = (vh - cropH) / 2;

  setCropRect(cropX, cropY, cropW, cropH);

  // Drag to move
  cropBox.addEventListener('mousedown', (e) => {
    if (e.target.dataset.handle || e.target.id === 'screenshot-confirm') return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cropStart = { x: cropBox.offsetLeft, y: cropBox.offsetTop };
    e.preventDefault();
  });

  // Handle resize
  cropBox.querySelectorAll('[data-handle]').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const pos = handle.dataset.handle;
      const rect = cropBox.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

      function onMove(e2) {
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        let newW, newH, newX, newY;

        if (pos.includes('e')) {
          newW = Math.max(100, startRect.width + dx);
          newH = newW / targetRatio;
          newX = startRect.left;
          newY = pos === 'se' ? startRect.top : startRect.top + startRect.height - newH;
        } else {
          newW = Math.max(100, startRect.width - dx);
          newH = newW / targetRatio;
          newX = startRect.left + startRect.width - newW;
          newY = pos === 'nw' ? startRect.top + startRect.height - newH : startRect.top;
        }

        setCropRect(newX, newY, newW, newH);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('keydown', onEsc);
}

function setCropRect(x, y, w, h) {
  cropBox.style.left = x + 'px';
  cropBox.style.top = y + 'px';
  cropBox.style.width = w + 'px';
  cropBox.style.height = h + 'px';

  const label = cropBox.querySelector('#screenshot-label');
  if (label) {
    label.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }
}

function onDrag(e) {
  if (!isDragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  let newX = cropStart.x + dx;
  let newY = cropStart.y + dy;

  newX = Math.max(0, Math.min(newX, window.innerWidth - cropBox.offsetWidth));
  newY = Math.max(0, Math.min(newY, window.innerHeight - cropBox.offsetHeight));

  setCropRect(newX, newY, cropBox.offsetWidth, cropBox.offsetHeight);
}

function onDragEnd() {
  isDragging = false;
}

function onEsc(e) {
  if (e.key === 'Escape') removeOverlay();
}

function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    cropBox = null;
  }
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('keydown', onEsc);
}

function captureArea() {
  if (!cropBox) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = {
    x: cropBox.offsetLeft,
    y: cropBox.offsetTop,
    w: cropBox.offsetWidth,
    h: cropBox.offsetHeight,
    dpr
  };

  // Hide overlay before capture
  overlay.style.display = 'none';

  // Wait one frame for the hide to take effect, then capture
  requestAnimationFrame(() => {
    chrome.runtime.sendMessage({ type: 'doCapture', rect, outputMode: currentOutputMode });
    removeOverlay();
  });
}

async function copyBlobToClipboard(blob) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
  } catch {
    // Fallback: open image in new tab so user can copy manually
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}

function cropAndSave(dataUrl, rect) {
  const { x, y, w, h, dpr } = rect;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const sx = x * dpr;
    const sy = y * dpr;
    const sw = w * dpr;
    const sh = h * dpr;

    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob(async blob => {
      if (currentOutputMode === 'copy') {
        await copyBlobToClipboard(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `screenshot-${Math.round(w)}x${Math.round(h)}-${timestamp}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  };
  img.src = dataUrl;
}
