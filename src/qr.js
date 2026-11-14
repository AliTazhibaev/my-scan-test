// ============================================================
// QR SCANNER (extracted from app.js)
// ============================================================
// Depends on: jsQR (global), showToast (passed as callback)

let videoStream = null;
let scanRAF = null;
let scanLastTime = 0;

// Приближение: 1–4×. Если камера умеет зум сама (многие Android) — зумит камера,
// иначе зум цифровой: картинка увеличивается, а распознаётся только видимая часть кадра.
let zoom = 1;
let hwZoom = null; // { min, max } — зум самой камеры, если есть
const ZOOM_MAX = 4;

function setZoom(z) {
  zoom = Math.max(1, Math.min(ZOOM_MAX, z));
  const videoEl = document.getElementById('video');
  const track = videoStream && videoStream.getVideoTracks()[0];
  if (hwZoom && track) {
    const hz = Math.max(hwZoom.min, Math.min(hwZoom.max, zoom));
    track.applyConstraints({ advanced: [{ zoom: hz }] }).catch(() => {});
    videoEl.style.transform = '';
  } else {
    videoEl.style.transform = zoom > 1.01 ? 'scale(' + zoom.toFixed(3) + ')' : '';
  }
  document.querySelectorAll('#scanZoom button').forEach(b => {
    b.classList.toggle('active', Math.abs(+b.dataset.zoom - zoom) < 0.25);
  });
}

let _onScan = null; // callback: (code: string) => void
let _showToast = null;

export function initQR(onScanCallback, toastFn) {
  _onScan = onScanCallback;
  _showToast = toastFn || function() {};
}

export function openScanner() {
  document.getElementById('scannerModal').classList.remove('hidden');
  navigator.mediaDevices.getUserMedia({
    // Повыше разрешение — чтобы при цифровом приближении код оставался чётким.
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(stream => {
    videoStream = stream;
    hwZoom = null;
    try {
      const caps = stream.getVideoTracks()[0].getCapabilities ? stream.getVideoTracks()[0].getCapabilities() : null;
      if (caps && caps.zoom && caps.zoom.max >= 3) hwZoom = { min: caps.zoom.min || 1, max: caps.zoom.max };
    } catch (e) { hwZoom = null; }
    setZoom(1);
    const videoEl = document.getElementById('video');
    videoEl.srcObject = stream;
    videoEl.play();
    startQRScan();
  }).catch(() => _showToast('❌ Нет доступа к камере'));
}

export function closeScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  if (scanRAF) {
    cancelAnimationFrame(scanRAF);
    scanRAF = null;
  }
}

function startQRScan() {
  const videoEl = document.getElementById('video');
  const qrCanvas = document.getElementById('qrCanvas');
  const qrCtx = qrCanvas.getContext('2d', { willReadFrequently: true });
  scanLastTime = 0;

  function scanFrame(now) {
    if (now - scanLastTime < 180) {
      scanRAF = requestAnimationFrame(scanFrame);
      return;
    }
    scanLastTime = now;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (!hwZoom && zoom > 1.01) {
        // Цифровой зум: берём ту часть кадра, что видна в квадратном окне.
        const side = Math.min(vw, vh) / zoom;
        sx = (vw - side) / 2; sy = (vh - side) / 2; sw = sh = side;
      }
      const k = Math.min(1, 1000 / Math.max(sw, sh));
      qrCanvas.width = Math.round(sw * k);
      qrCanvas.height = Math.round(sh * k);
      qrCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, qrCanvas.width, qrCanvas.height);
      const imgData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const qrResult = jsQR(imgData.data, imgData.width, imgData.height);
      if (qrResult) {
        if (_onScan) _onScan(qrResult.data);
        closeScanner();
        return;
      }
    }
    scanRAF = requestAnimationFrame(scanFrame);
  }
  scanRAF = requestAnimationFrame(scanFrame);
}

export function handleManualCode() {
  const val = document.getElementById('manualCode').value.trim();
  if (val) {
    if (_onScan) _onScan(val);
    closeScanner();
  }
}

export function wireQRListeners() {
  document.getElementById('scanBtn').addEventListener('click', openScanner);
  document.getElementById('closeScannerBtn').addEventListener('click', closeScanner);
  document.getElementById('scannerModal').addEventListener('click', function(e) {
    if (e.target === this) closeScanner();
  });
  document.getElementById('manualSubmit').addEventListener('click', handleManualCode);
  document.querySelectorAll('#scanZoom button').forEach(b => {
    b.addEventListener('click', () => setZoom(+b.dataset.zoom));
  });
  // Щипок двумя пальцами по камере — плавное приближение.
  const view = document.getElementById('scanView');
  let pinch0 = 0, zoom0 = 1, lastApply = 0;
  const dist = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  view.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { pinch0 = dist(e); zoom0 = zoom; }
  }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !pinch0) return;
    e.preventDefault();
    const now = performance.now();
    if (hwZoom && now - lastApply < 60) return;
    lastApply = now;
    setZoom(zoom0 * dist(e) / pinch0);
  }, { passive: false });
  view.addEventListener('touchend', e => { if (e.touches.length < 2) pinch0 = 0; }, { passive: true });
}
