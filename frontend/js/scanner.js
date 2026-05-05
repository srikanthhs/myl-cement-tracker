'use strict';
/* QR / Barcode scanner – wraps html5-qrcode, falls back to manual input */

const Scanner = (() => {
  let _scanner = null;
  let _callback = null;
  let _running  = false;

  const CDN_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';

  function _loadLib() {
    return new Promise((resolve, reject) => {
      if (typeof Html5Qrcode !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src     = CDN_URL;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Scanner library failed to load'));
      document.head.appendChild(s);
    });
  }

  function _buildOverlay() {
    const el = document.createElement('div');
    el.id        = 'scannerOverlay';
    el.innerHTML = `
      <div class="scanner-sheet">
        <div class="scanner-header">
          <span class="material-icons-round">qr_code_scanner</span>
          <span>Scan Beneficiary ID</span>
          <button class="nav-icon-btn" onclick="Scanner.stop()">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div id="qr-reader"></div>
        <p class="scanner-hint">Point camera at Work ID or Aadhaar barcode</p>
        <div class="scanner-manual">
          <div class="search-input" style="flex:1">
            <span class="material-icons-round">edit</span>
            <input id="scanManualInput" placeholder="Or type Work ID manually…" autocomplete="off"
              onkeydown="if(event.key==='Enter')Scanner._submitManual()">
          </div>
          <button class="btn btn-primary" onclick="Scanner._submitManual()">
            <span class="material-icons-round">check</span> OK
          </button>
        </div>
      </div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('open'), 10);
    return el;
  }

  async function scan(onResult) {
    if (_running) return;
    _callback = onResult;

    try { await _loadLib(); } catch { /* camera may still work */ }

    _buildOverlay();
    _running = true;

    if (typeof Html5Qrcode !== 'undefined') {
      try {
        _scanner = new Html5Qrcode('qr-reader');
        await _scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.5 },
          text => _finish(text.trim()),
          () => {}
        );
      } catch (err) {
        const hint = document.querySelector('.scanner-hint');
        if (hint) hint.textContent = 'Camera unavailable – use manual input below';
      }
    }
  }

  function _finish(value) {
    if (!value) return;
    if (_callback) _callback(value);
    stop();
  }

  function _submitManual() {
    const val = (document.getElementById('scanManualInput')?.value || '').trim();
    if (val) _finish(val);
  }

  async function stop() {
    _running  = false;
    _callback = null;
    if (_scanner) {
      try { await _scanner.stop(); } catch {}
      _scanner = null;
    }
    const overlay = document.getElementById('scannerOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  return { scan, stop, _submitManual };
})();
