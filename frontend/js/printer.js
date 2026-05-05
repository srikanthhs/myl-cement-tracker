'use strict';
/* Bluetooth ESC/POS thermal printer – Web Bluetooth API (Chrome on Android) */

const Printer = (() => {
  let _device = null;
  let _char   = null;

  // Service / characteristic UUIDs for common BLE thermal printers
  const SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',          // generic thermal
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',          // Issc BLE serial
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',          // Nordic UART
  ];
  const WRITE_CHARS = [
    '00002af1-0000-1000-8000-00805f9b34fb',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',          // Nordic UART TX
  ];

  // ── ESC/POS constants ───────────────────────────────────────────
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
  const CMD = {
    INIT:     [ESC, 0x40],
    BOLD_ON:  [ESC, 0x45, 1],
    BOLD_OFF: [ESC, 0x45, 0],
    ALIGN_L:  [ESC, 0x61, 0],
    ALIGN_C:  [ESC, 0x61, 1],
    SIZE_2X:  [GS,  0x21, 0x11],
    SIZE_1X:  [GS,  0x21, 0x00],
    FEED3:    [ESC, 0x64, 3],
    CUT:      [GS,  0x56, 0x41, 0x10],
  };

  function _encode(parts) {
    const bytes = [];
    for (const p of parts) {
      if (typeof p === 'string') {
        for (const ch of p) bytes.push(ch.charCodeAt(0) & 0xFF);
      } else if (Array.isArray(p)) {
        bytes.push(...p);
      }
    }
    return new Uint8Array(bytes);
  }

  function _line(text = '') { return text + '\n'; }
  function _dash(n = 32)    { return '─'.repeat ? '─'.repeat(n) + '\n' : '-'.repeat(n) + '\n'; }
  function _pad(text, width = 32) {
    const spaces = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(spaces) + text;
  }

  // ── Bluetooth connection ────────────────────────────────────────
  async function connect() {
    if (!navigator.bluetooth) {
      UI.showToast('Web Bluetooth not supported. Use Chrome on Android.', 'error');
      return false;
    }
    try {
      _device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICES,
      });
      const server = await _device.gatt.connect();

      for (const svcUuid of SERVICES) {
        try {
          const svc = await server.getPrimaryService(svcUuid);
          for (const charUuid of WRITE_CHARS) {
            try {
              _char = await svc.getCharacteristic(charUuid);
              _device.addEventListener('gattserverdisconnected', _onDisconnect);
              UI.showToast(`Printer connected: ${_device.name || 'BT Printer'}`, 'success');
              _updatePrinterBar();
              return true;
            } catch {}
          }
        } catch {}
      }
      UI.showToast('Printer found but protocol not supported', 'error');
      return false;
    } catch (err) {
      if (err.name !== 'NotFoundError') UI.showToast('Bluetooth error: ' + err.message, 'error');
      return false;
    }
  }

  function _onDisconnect() {
    _char = null;
    UI.showToast('Printer disconnected', 'warning');
    _updatePrinterBar();
  }

  function isConnected() { return !!(_device?.gatt?.connected && _char); }

  function disconnect() {
    if (_device?.gatt?.connected) _device.gatt.disconnect();
    _device = null; _char = null;
    _updatePrinterBar();
  }

  async function _write(data) {
    if (!_char) throw new Error('Printer not connected');
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
      await _char.writeValueWithoutResponse(data.slice(i, i + CHUNK));
    }
  }

  // ── Receipt builder ─────────────────────────────────────────────
  async function printReceipt(issuance) {
    if (!isConnected()) {
      const ok = await connect();
      if (!ok) return;
    }

    const d       = new Date(issuance.issuedAt);
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const receipt = _encode([
      CMD.INIT,
      CMD.ALIGN_C,
      CMD.BOLD_ON,
      _line('RURAL DEVELOPMENT DEPT'),
      _line('MAYILADUTHURAI DISTRICT'),
      CMD.BOLD_OFF,
      _line('Govt. Cement Issuance Slip'),
      _line(`${dateStr}  ${timeStr}`),
      CMD.ALIGN_L,
      _line('-'.repeat(32)),
      CMD.BOLD_ON, _line('BENEFICIARY'), CMD.BOLD_OFF,
      _line((issuance.beneficiaryName || '').substring(0, 32)),
      _line('Village : ' + (issuance.village || 'N/A')),
      _line('Block   : ' + (issuance.block   || 'N/A')),
      _line('Scheme  : ' + (issuance.scheme  || 'N/A')),
      _line('-'.repeat(32)),
      CMD.BOLD_ON,
      _line('Challan : ' + (issuance.challanNo || '')),
      CMD.BOLD_OFF,
      CMD.ALIGN_C,
      CMD.SIZE_2X,
      _line(String(issuance.bags) + ' BAGS'),
      CMD.SIZE_1X,
      CMD.ALIGN_L,
      _line('-'.repeat(32)),
      _line('Issued by : ' + (issuance.issuedBy || '')),
      issuance.gps ? _line(`GPS : ${issuance.gps.lat}, ${issuance.gps.lng}`) : '',
      _line('-'.repeat(32)),
      CMD.ALIGN_C,
      _line('Beneficiary / Auth. Receiver'),
      _line(''),
      _line(''),
      _line('_'.repeat(28)),
      _line(''),
      CMD.BOLD_ON, _line('MYL CEMENT TRACKER'), CMD.BOLD_OFF,
      _line('Digitally Verified'),
      CMD.FEED3,
      CMD.CUT,
    ]);

    try {
      await _write(receipt);
      UI.showToast('Receipt printed!', 'success');
    } catch (err) {
      UI.showToast('Print failed – ' + err.message, 'error');
    }
  }

  // ── Printer status bar (shown in app bar on mobile) ─────────────
  function _updatePrinterBar() {
    const bar = document.getElementById('printerStatusBar');
    if (!bar) return;
    if (isConnected()) {
      bar.innerHTML = `<span class="material-icons-round" style="font-size:16px;color:var(--green)">print</span>
        <span style="font-size:11px;color:var(--green)">${_device.name || 'Printer'}</span>
        <button class="btn btn-text btn-sm" style="padding:2px 6px;font-size:11px" onclick="Printer.disconnect()">Disconnect</button>`;
      bar.style.display = 'flex';
    } else {
      bar.innerHTML = `<span class="material-icons-round" style="font-size:16px;color:var(--grey-500)">print_disabled</span>
        <span style="font-size:11px;color:var(--grey-500)">No printer</span>
        <button class="btn btn-text btn-sm" style="padding:2px 6px;font-size:11px" onclick="Printer.connect()">Connect</button>`;
      bar.style.display = 'flex';
    }
  }

  function showStatusBar() { _updatePrinterBar(); }

  return { connect, disconnect, isConnected, printReceipt, showStatusBar };
})();
