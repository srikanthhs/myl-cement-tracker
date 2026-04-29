/* TNRD Reports Page – fetch from tnrd.tn.gov.in, view by date, compare */
const TnrdPage = (() => {
  let _config   = [];
  let _reports  = {};
  let _rowCache = {};   // key: "reportId" or "reportId|date"

  // ── Entry point ──────────────────────────────────────────────────────────
  async function render() {
    const el      = document.getElementById('mainContent');
    const user    = Auth.getUser();
    const canUp   = ['admin','bdo'].includes(user?.role);

    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">TNRD Portal Reports</div>
          <div class="page-sub">Data fetched from tnrd.tn.gov.in · History kept per day</div>
        </div>
        <div style="display:flex;gap:8px">
          ${canUp ? `<button class="btn btn-primary btn-sm" onclick="TnrdPage.openFetchModal()">
            <span class="material-icons-round">cloud_download</span> Fetch All from TNRD
          </button>` : ''}
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.render()">
            <span class="material-icons-round">refresh</span> Refresh
          </button>
        </div>
      </div>
      <div id="tnrdBody">
        <div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div>
      </div>
      ${_fetchAllModal()}`;

    try {
      const [cfg, reportsArr] = await Promise.all([
        API.get('/tnrd/config'),
        API.get('/tnrd/reports'),
      ]);
      _config  = cfg.length ? cfg : _fallbackConfig();
      _reports = {};
      reportsArr.forEach(r => { _reports[r.id] = r; });
      _rowCache = {};
      _renderBody(canUp);
    } catch (e) {
      document.getElementById('tnrdBody').innerHTML =
        `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${_esc(e.message)}</div>`;
    }
  }

  function _fallbackConfig() {
    return [
      { id:'cement_allotment', name:'Cement Allotment Report' },
      { id:'cement_stock',     name:'Cement Stock Status' },
      { id:'beneficiary_list', name:'Beneficiary List' },
      { id:'issuance_summary', name:'Issuance Summary Report' },
    ];
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  function _renderBody(canUp) {
    const el = document.getElementById('tnrdBody');

    const uploadSection = canUp ? `
      <div class="card" style="margin-bottom:20px">
        <div class="section-title" style="margin-bottom:4px">
          <span class="material-icons-round" style="vertical-align:middle;color:var(--blue);margin-right:6px">upload_file</span>
          Or upload Excel files manually
        </div>
        <p style="font-size:12px;color:var(--grey-500);margin:0 0 14px">
          Download from tnrd.tn.gov.in and drop each file below as an alternative to Fetch All.
        </p>
        <div class="stat-grid">${_config.map(_uploadCard).join('')}</div>
      </div>` : '';

    const reportSections = _config.map(cfg => {
      const meta = _reports[cfg.id];
      return `
        <div class="card" style="margin-bottom:16px" id="rsec-${cfg.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <div>
              <div class="section-title" style="margin:0">${_esc(cfg.name)}</div>
              ${meta ? `<div style="font-size:12px;color:var(--grey-500);margin-top:3px">
                Latest: <strong>${meta.latestDate || '—'}</strong>
                &nbsp;·&nbsp; ${fmt(meta.rowCount)} rows
                ${meta.uploadedBy ? ` &nbsp;·&nbsp; by ${_esc(meta.uploadedBy)}` : ''}
              </div>` : `<div style="font-size:12px;color:var(--grey-400);margin-top:3px">No data yet</div>`}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-outlined btn-sm" onclick="TnrdPage.openCompare('${cfg.id}','${_esc(cfg.name)}')">
                <span class="material-icons-round">compare</span> Compare dates
              </button>
              ${meta ? `<button class="btn btn-outlined btn-sm" onclick="TnrdPage.loadLatest('${cfg.id}')">
                <span class="material-icons-round">table_view</span> View latest
              </button>` : ''}
            </div>
          </div>
          <div id="rtable-${cfg.id}"></div>
        </div>`;
    }).join('');

    el.innerHTML = uploadSection + reportSections;
  }

  // ── Upload card ──────────────────────────────────────────────────────────
  function _uploadCard(cfg) {
    const meta = _reports[cfg.id];
    const ok   = meta?.status === 'success';
    return `
      <div class="stat-card" id="ucard-${cfg.id}"
           ondragover="TnrdPage.onDragOver(event)"
           ondragleave="TnrdPage.onDragLeave(event,'ucard-${cfg.id}')"
           ondrop="TnrdPage.onDrop(event,'${cfg.id}','${_esc(cfg.name)}')"
           style="cursor:default">
        <div class="stat-icon ${ok?'green':'yellow'}">
          <span class="material-icons-round">${ok?'check_circle':'upload_file'}</span>
        </div>
        <div class="stat-body">
          <div class="stat-label" style="font-weight:600">${_esc(cfg.name)}</div>
          <div style="font-size:11px;color:var(--grey-500);margin:4px 0 8px">
            ${ok ? `✓ ${meta.latestDate} · ${fmt(meta.rowCount)} rows` : 'Not uploaded yet'}
          </div>
          <label class="btn btn-outlined btn-sm" style="width:100%;justify-content:center;cursor:pointer">
            <span class="material-icons-round">attach_file</span> Choose file
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none"
              onchange="TnrdPage.onFileChosen(event,'${cfg.id}','${_esc(cfg.name)}')">
          </label>
          <div style="font-size:11px;color:var(--grey-400);text-align:center;margin-top:5px">or drag &amp; drop</div>
        </div>
      </div>`;
  }

  // ── Load and view latest data ─────────────────────────────────────────────
  async function loadLatest(id) {
    const container = document.getElementById(`rtable-${id}`);
    if (!container) return;
    container.innerHTML = `<div class="empty-state" style="padding:16px"><span class="material-icons-round spin">sync</span></div>`;
    try {
      if (!_rowCache[id]) _rowCache[id] = await API.get(`/tnrd/reports/${id}`);
      _renderTable(container, _rowCache[id].rows || [], id, 'latest');
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${_esc(e.message)}</div>`;
    }
  }

  function _renderTable(container, rows, reportId, label) {
    if (!rows.length) { container.innerHTML = `<div class="empty-state"><span class="material-icons-round">table_view</span><p>No data.</p></div>`; return; }
    const cols = Object.keys(rows[0]);
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;color:var(--grey-500)">${fmt(rows.length)} rows &nbsp;·&nbsp; ${label}</span>
        <button class="btn btn-outlined btn-sm" onclick="TnrdPage.exportRows('${reportId}','${label}')">
          <span class="material-icons-round">download</span> Export Excel
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${cols.map(c=>`<th>${_esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(0,500).map(r=>`<tr>${cols.map(c=>`<td>${_esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      ${rows.length>500?`<p style="font-size:11px;color:var(--grey-400);text-align:center;margin-top:4px">Showing 500 of ${fmt(rows.length)} rows</p>`:''}`;
  }

  // ── Compare two dates ─────────────────────────────────────────────────────
  async function openCompare(reportId, reportName) {
    const container = document.getElementById(`rtable-${reportId}`);
    if (!container) return;
    container.innerHTML = `<div class="empty-state" style="padding:12px"><span class="material-icons-round spin">sync</span><p style="font-size:13px">Loading history…</p></div>`;

    try {
      const history = await API.get(`/tnrd/reports/${reportId}/history`);

      if (!history.length) {
        container.innerHTML = `<div class="empty-state"><span class="material-icons-round">history</span><p>No history yet. Fetch some data first.</p></div>`;
        return;
      }

      const opts = history.map(h =>
        `<option value="${h.date}">${h.date} &nbsp; (${fmt(h.rowCount)} rows${h.uploadedBy?' · '+_esc(h.uploadedBy):''})</option>`
      ).join('');

      container.innerHTML = `
        <div style="background:var(--grey-50);border-radius:8px;padding:14px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:10px;font-size:13px">
            <span class="material-icons-round" style="vertical-align:middle;color:var(--blue)">compare</span>
            Compare two dates — ${_esc(reportName)}
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <label class="form-label" style="font-size:11px">Date A</label>
              <select class="form-control" id="cmpA-${reportId}" style="width:260px">${opts}</select>
            </div>
            <div>
              <label class="form-label" style="font-size:11px">Date B</label>
              <select class="form-control" id="cmpB-${reportId}" style="width:260px">${opts}</select>
            </div>
            <button class="btn btn-primary btn-sm" onclick="TnrdPage.runCompare('${reportId}','${_esc(reportName)}')">
              <span class="material-icons-round">compare_arrows</span> Compare
            </button>
            <button class="btn btn-outlined btn-sm" onclick="TnrdPage.loadLatest('${reportId}')">Cancel</button>
          </div>
        </div>
        <div id="cmpResult-${reportId}"></div>`;

      // Pre-select two most-recent dates
      const selA = document.getElementById(`cmpA-${reportId}`);
      const selB = document.getElementById(`cmpB-${reportId}`);
      if (history.length >= 2) selB.selectedIndex = 1;

    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${_esc(e.message)}</div>`;
    }
  }

  async function runCompare(reportId, reportName) {
    const dateA  = document.getElementById(`cmpA-${reportId}`)?.value;
    const dateB  = document.getElementById(`cmpB-${reportId}`)?.value;
    const result = document.getElementById(`cmpResult-${reportId}`);
    if (!dateA || !dateB || !result) return;
    if (dateA === dateB) { UI.toast('Select two different dates to compare.', 'warn'); return; }

    result.innerHTML = `<div class="empty-state" style="padding:12px"><span class="material-icons-round spin">sync</span><p style="font-size:13px">Loading both snapshots…</p></div>`;

    try {
      const keyA = `${reportId}|${dateA}`;
      const keyB = `${reportId}|${dateB}`;
      if (!_rowCache[keyA]) _rowCache[keyA] = await API.get(`/tnrd/reports/${reportId}/history/${dateA}`);
      if (!_rowCache[keyB]) _rowCache[keyB] = await API.get(`/tnrd/reports/${reportId}/history/${dateB}`);

      const snapA = _rowCache[keyA];
      const snapB = _rowCache[keyB];
      const rowsA = snapA.rows || [];
      const rowsB = snapB.rows || [];
      const cols  = rowsA.length ? Object.keys(rowsA[0]) : (rowsB.length ? Object.keys(rowsB[0]) : []);

      result.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.exportRows('${reportId}','${dateA}')">
            <span class="material-icons-round">download</span> Export ${dateA}
          </button>
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.exportRows('${reportId}','${dateB}')">
            <span class="material-icons-round">download</span> Export ${dateB}
          </button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:6px">
              ${dateA} &nbsp;·&nbsp; ${fmt(rowsA.length)} rows
            </div>
            <div class="table-wrap" style="max-height:400px">
              <table>
                <thead><tr>${cols.map(c=>`<th>${_esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${rowsA.slice(0,200).map(r=>`<tr>${cols.map(c=>`<td>${_esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:6px">
              ${dateB} &nbsp;·&nbsp; ${fmt(rowsB.length)} rows
            </div>
            <div class="table-wrap" style="max-height:400px">
              <table>
                <thead><tr>${cols.map(c=>`<th>${_esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${rowsB.slice(0,200).map(r=>`<tr>${cols.map(c=>`<td>${_esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div style="margin-top:10px;padding:10px 12px;background:var(--grey-50);border-radius:8px;font-size:13px">
          <strong>Summary:</strong>
          ${dateA}: ${fmt(rowsA.length)} rows &nbsp;→&nbsp;
          ${dateB}: ${fmt(rowsB.length)} rows &nbsp;
          <span style="color:${rowsB.length>=rowsA.length?'var(--green)':'var(--red)'}">
            (${rowsB.length>=rowsA.length?'+':''}${rowsB.length-rowsA.length} rows)
          </span>
        </div>`;
    } catch(e) {
      result.innerHTML = `<div class="alert alert-danger">${_esc(e.message)}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportRows(reportId, dateOrLabel) {
    const key    = dateOrLabel === 'latest' ? reportId : `${reportId}|${dateOrLabel}`;
    const cached = _rowCache[key];
    if (!cached?.rows?.length) { UI.toast('No data to export.', 'warn'); return; }
    const cols = Object.keys(cached.rows[0]);
    const name = `${cached.name||reportId}_${dateOrLabel}`;
    Exporter.toExcel(name, [{ name, headers: cols, rows: cached.rows.map(r=>cols.map(c=>r[c]??'')) }]);
  }

  // ── Upload (drag-drop / file picker) ─────────────────────────────────────
  function onDragOver(e) {
    e.preventDefault();
    const card = e.currentTarget;
    card.style.outline   = '2px dashed var(--blue)';
    card.style.background = 'var(--blue-bg,#e8f0fe)';
  }
  function onDragLeave(e, cardId) {
    const card = document.getElementById(cardId);
    if (card) { card.style.outline = ''; card.style.background = ''; }
  }
  function onDrop(e, reportId, reportName) {
    e.preventDefault();
    onDragLeave(e, `ucard-${reportId}`);
    const file = e.dataTransfer?.files?.[0];
    if (file) _uploadFile(file, reportId, reportName);
  }
  function onFileChosen(e, reportId, reportName) {
    const file = e.target.files?.[0];
    if (file) _uploadFile(file, reportId, reportName);
    e.target.value = '';
  }

  async function _uploadFile(file, reportId, reportName) {
    const card = document.getElementById(`ucard-${reportId}`);
    if (card) { card.style.opacity = '0.6'; card.style.pointerEvents = 'none'; }
    UI.toast(`Uploading ${file.name}…`, 'info');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', reportName);
      const result = await API.upload(`/tnrd/upload/${reportId}`, form);
      UI.toast(result.message || 'Upload successful', 'success');
      await render();
    } catch(e) {
      UI.toast(`Upload failed: ${e.message}`, 'error');
      if (card) { card.style.opacity = ''; card.style.pointerEvents = ''; }
    }
  }

  // ── Fetch-all modal ───────────────────────────────────────────────────────
  function _fetchAllModal() {
    return `
      <div id="tnrdFetchModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center">
        <div class="card" style="width:min(500px,94vw);margin:0;box-shadow:0 8px 32px rgba(0,0,0,.2)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div style="font-weight:700;font-size:15px">
              <span class="material-icons-round" style="vertical-align:middle;color:var(--blue)">cloud_download</span>
              Fetch All Reports from TNRD
            </div>
            <button class="btn btn-text btn-sm" onclick="TnrdPage.closeFetchModal()">
              <span class="material-icons-round">close</span>
            </button>
          </div>
          <div style="background:var(--grey-50);border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px">
            <strong>How to get your session cookie (30 seconds):</strong>
            <ol style="margin:8px 0 0;padding-left:18px;line-height:1.9">
              <li>Log in to <strong>tnrd.tn.gov.in</strong></li>
              <li>Press <strong>F12</strong> → <strong>Application</strong> tab → <strong>Cookies</strong> → click <em>tnrd.tn.gov.in</em></li>
              <li>Find <strong>PHPSESSID</strong> → double-click its value → Ctrl+C</li>
              <li>Paste below and click Fetch</li>
            </ol>
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">PHPSESSID Cookie Value</label>
            <input class="form-control" id="tnrdCookieInput" placeholder="e.g. r1n4njiefl9jj411q8em69fv9o"
              style="font-family:monospace;font-size:13px"
              onkeydown="if(event.key==='Enter')TnrdPage.doFetchAll()">
          </div>
          <div id="tnrdFetchProgress" style="display:none;margin-bottom:12px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-outlined btn-sm" onclick="TnrdPage.closeFetchModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" id="tnrdFetchBtn" onclick="TnrdPage.doFetchAll()">
              <span class="material-icons-round">cloud_download</span> Fetch All Reports
            </button>
          </div>
        </div>
      </div>`;
  }

  function openFetchModal() {
    let modal = document.getElementById('tnrdFetchModal');
    if (!modal) {
      document.getElementById('mainContent').insertAdjacentHTML('beforeend', _fetchAllModal());
      modal = document.getElementById('tnrdFetchModal');
    }
    modal.style.display = 'flex';
    document.getElementById('tnrdFetchProgress').style.display = 'none';
    setTimeout(() => document.getElementById('tnrdCookieInput')?.focus(), 50);
  }

  function closeFetchModal() {
    const modal = document.getElementById('tnrdFetchModal');
    if (modal) modal.style.display = 'none';
  }

  async function doFetchAll() {
    const cookie = document.getElementById('tnrdCookieInput')?.value?.trim();
    if (!cookie) { UI.toast('Paste your PHPSESSID value first.', 'warn'); return; }

    const btn  = document.getElementById('tnrdFetchBtn');
    const prog = document.getElementById('tnrdFetchProgress');
    btn.disabled  = true;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Downloading…';
    prog.style.display = 'block';
    prog.innerHTML     = `<div class="empty-state" style="padding:12px">
      <span class="material-icons-round spin">sync</span>
      <p style="font-size:13px;margin:4px 0 0">Contacting tnrd.tn.gov.in…</p></div>`;

    try {
      const result = await API.post('/tnrd/fetch-all', { sessionCookie: cookie });
      const rows   = (result.results || []).map(r => {
        const icon  = r.status==='success'?'✓':r.status==='skipped'?'—':'✗';
        const color = r.status==='success'?'var(--green)':r.status==='skipped'?'var(--grey-400)':'var(--red)';
        const detail= r.status==='success'?`${fmt(r.rowCount)} rows`:(r.error||r.status);
        return `<tr><td><span style="color:${color};font-weight:700">${icon}</span></td>
          <td>${_esc(r.name)}</td><td style="color:${color}">${_esc(detail)}</td></tr>`;
      }).join('');

      prog.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">${_esc(result.message)}</div>
        <div class="table-wrap" style="max-height:220px">
          <table><thead><tr><th></th><th>Report</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </div>`;

      if (!result.sessionExpired) {
        setTimeout(() => { closeFetchModal(); render(); }, 1800);
      } else {
        btn.disabled  = false;
        btn.innerHTML = '<span class="material-icons-round">cloud_download</span> Fetch All Reports';
        document.getElementById('tnrdCookieInput').value = '';
        document.getElementById('tnrdCookieInput').focus();
      }
    } catch(e) {
      prog.innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${_esc(e.message)}</div>`;
      btn.disabled  = false;
      btn.innerHTML = '<span class="material-icons-round">cloud_download</span> Fetch All Reports';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _esc(v) {
    if (v===null||v===undefined) return '—';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, loadLatest, openCompare, runCompare, exportRows,
           onDragOver, onDragLeave, onDrop, onFileChosen,
           openFetchModal, closeFetchModal, doFetchAll };
})();
