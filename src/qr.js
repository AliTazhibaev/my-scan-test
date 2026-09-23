// ============================================================
// QR SCANNER (extracted from app.js)
// ============================================================
// Depends on: jsQR (global), showToast (passed as callback)

let videoStream = null;
let scanRAF = null;
let scanLastTime = 0;

let _onScan = null; // callback: (code: string) => void
let _showToast = null;

export function initQR(onScanCallback, toastFn) {
  _onScan = onScanCallback;
  _showToast = toastFn || function() {};
}

export function openScanner() {
  document.getElementById('scannerModal').classList.remove('hidden');
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  }).then(stream => {
    videoStream = stream;
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
  const qrCtx = qrCanvas.getContext('2d');
  scanLastTime = 0;

  function scanFrame(now) {
    if (now - scanLastTime < 180) {
      scanRAF = requestAnimationFrame(scanFrame);
      return;
    }
    scanLastTime = now;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      qrCanvas.width = videoEl.videoWidth;
      qrCanvas.height = videoEl.videoHeight;
      qrCtx.drawImage(videoEl, 0, 0);
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
}
