/* TNRD Reports Page
   Human assistant downloads Excel files from tnrd.tn.gov.in and uploads
   them here. Data is stored in Firestore and shown in the table below.   */
const TnrdPage = (() => {
  let _config  = [];   // expected reports from server config
  let _reports = {};   // id → metadata (from Firestore)
  let _rowCache = {};  // id → full report with rows

  // ── Entry point ──────────────────────────────────────────────────────────
  async function render() {
    const el   = document.getElementById('mainContent');
    const user = Auth.getUser();
    const canUpload = ['admin', 'bdo'].includes(user?.role);

    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">TNRD Portal Reports</div>
          <div class="page-sub">Upload Excel files downloaded from tnrd.tn.gov.in</div>
        </div>
        <button class="btn btn-outlined btn-sm" onclick="TnrdPage.render()">
          <span class="material-icons-round">refresh</span> Refresh
        </button>
      </div>
      <div id="tnrdBody">
        <div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div>
      </div>`;

    try {
      const [cfg, reportsArr] = await Promise.all([
        API.get('/tnrd/config'),
        API.get('/tnrd/reports'),
      ]);

      _config  = cfg.length ? cfg : _fallbackConfig();
      _reports = {};
      reportsArr.forEach(r => { _reports[r.id] = r; });
      _rowCache = {};

      _renderPage(canUpload);
    } catch (e) {
      document.getElementById('tnrdBody').innerHTML =
        `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  function _fallbackConfig() {
    return [
      { id: 'cement_allotment',  name: 'Cement Allotment Report',  scheduleAt: [] },
      { id: 'cement_stock',      name: 'Cement Stock Status',       scheduleAt: [] },
      { id: 'beneficiary_list',  name: 'Beneficiary List',          scheduleAt: [] },
      { id: 'issuance_summary',  name: 'Issuance Summary Report',   scheduleAt: [] },
    ];
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  function _renderPage(canUpload) {
    const el = document.getElementById('tnrdBody');

    el.innerHTML = `
      ${canUpload ? `
      <div class="card" style="margin-bottom:20px">
        <div class="section-title" style="margin-bottom:4px">
          <span class="material-icons-round" style="vertical-align:middle;margin-right:6px;color:var(--blue)">upload_file</span>
          Upload Today's Reports
        </div>
        <p style="font-size:13px;color:var(--grey-500);margin:0 0 16px">
          Log in to tnrd.tn.gov.in, download each Excel report, then drop it in the matching box below.
        </p>
        <div class="stat-grid" id="tnrdUploadGrid">
          ${_config.map(r => _uploadCard(r)).join('')}
        </div>
      </div>` : ''}

      <div id="tnrdReportsSection">
        ${_config.map(r => _reportSection(r)).join('')}
      </div>`;
  }

  // ── Upload card ──────────────────────────────────────────────────────────
  function _uploadCard(cfg) {
    const meta     = _reports[cfg.id];
    const uploaded = meta?.uploadedAt || meta?.downloadedAt;
    const timeStr  = uploaded
      ? new Date(uploaded).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
      : 'Not uploaded yet';
    const byStr    = meta?.uploadedBy ? ` by ${meta.uploadedBy}` : '';
    const ok       = meta?.status === 'success';

    return `
      <div class="stat-card" id="ucard-${cfg.id}"
           ondragover="TnrdPage.onDragOver(event)"
           ondragleave="TnrdPage.onDragLeave(event,'ucard-${cfg.id}')"
           ondrop="TnrdPage.onDrop(event,'${cfg.id}','${_esc(cfg.name)}')"
           style="cursor:default;transition:outline .15s">
        <div class="stat-icon ${ok ? 'green' : 'yellow'}">
          <span class="material-icons-round">${ok ? 'check_circle' : 'upload_file'}</span>
        </div>
        <div class="stat-body">
          <div class="stat-label" style="font-weight:600">${_esc(cfg.name)}</div>
          <div style="font-size:11px;color:var(--grey-500);margin:4px 0 8px">
            ${ok
              ? `<span style="color:var(--green)">✓</span> ${timeStr}${byStr} · ${fmt(meta.rowCount)} rows`
              : timeStr}
          </div>
          <label class="btn btn-outlined btn-sm" style="width:100%;justify-content:center;cursor:pointer">
            <span class="material-icons-round">attach_file</span> Choose file
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none"
              onchange="TnrdPage.onFileChosen(event,'${cfg.id}','${_esc(cfg.name)}')">
          </label>
          <div style="font-size:11px;color:var(--grey-400);text-align:center;margin-top:6px">or drag &amp; drop here</div>
        </div>
      </div>`;
  }

  // ── Report data section ──────────────────────────────────────────────────
  function _reportSection(cfg) {
    const meta = _reports[cfg.id];
    if (!meta || meta.status !== 'success') return '';

    const timeStr = (meta.uploadedAt || meta.downloadedAt)
      ? new Date(meta.uploadedAt || meta.downloadedAt)
          .toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';

    return `
      <div class="card" style="margin-bottom:16px" id="rsec-${cfg.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div>
            <div class="section-title" style="margin:0">${_esc(meta.name || cfg.name)}</div>
            <div style="font-size:12px;color:var(--grey-500);margin-top:3px">
              <span class="material-icons-round" style="font-size:12px;vertical-align:middle">cloud_done</span>
              ${timeStr}
              ${meta.uploadedBy ? ` · uploaded by <strong>${_esc(meta.uploadedBy)}</strong>` : ''}
              &nbsp;·&nbsp; <strong>${fmt(meta.rowCount)}</strong> rows
            </div>
          </div>
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.loadAndView('${cfg.id}')">
            <span class="material-icons-round">table_view</span> View data
          </button>
        </div>
        <div id="rtable-${cfg.id}"></div>
      </div>`;
  }

  // ── File upload handling ─────────────────────────────────────────────────
  function onDragOver(e) {
    e.preventDefault();
    const card = e.currentTarget;
    card.style.outline = '2px dashed var(--blue)';
    card.style.background = 'var(--blue-bg,#e8f0fe)';
  }

  function onDragLeave(e, cardId) {
    const card = document.getElementById(cardId);
    if (card) { card.style.outline = ''; card.style.background = ''; }
  }

  function onDrop(e, reportId, reportName) {
    e.preventDefault();
    const card = document.getElementById(`ucard-${reportId}`);
    if (card) { card.style.outline = ''; card.style.background = ''; }
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
    if (card) {
      card.style.outline  = '2px solid var(--blue)';
      card.style.opacity  = '0.7';
      card.style.pointerEvents = 'none';
    }

    UI.toast(`Uploading ${file.name}…`, 'info');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', reportName);

      const result = await API.upload(`/tnrd/upload/${reportId}`, form);
      UI.toast(result.message || 'Upload successful', 'success');

      // Refresh page to show updated data
      await render();
      // Auto-load the table for the report just uploaded
      await loadAndView(reportId);
    } catch (e) {
      UI.toast(`Upload failed: ${e.message}`, 'error');
      if (card) { card.style.outline = '2px solid var(--red)'; card.style.opacity = ''; card.style.pointerEvents = ''; }
    }
  }

  // ── View data table ──────────────────────────────────────────────────────
  async function loadAndView(id) {
    const container = document.getElementById(`rtable-${id}`);
    if (!container) return;

    container.innerHTML = `<div class="empty-state" style="padding:20px">
      <span class="material-icons-round spin">sync</span><p>Loading rows…</p></div>`;

    try {
      if (!_rowCache[id]) {
        _rowCache[id] = await API.get(`/tnrd/reports/${id}`);
      }
      const report = _rowCache[id];
      const rows   = report.rows || [];
      const cols   = rows.length ? Object.keys(rows[0]) : [];

      if (!rows.length) {
        container.innerHTML = `<div class="empty-state"><span class="material-icons-round">table_view</span><p>No rows in this report.</p></div>`;
        return;
      }

      container.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.exportReport('${id}')">
            <span class="material-icons-round">download</span> Export Excel
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>${cols.map(c => `<th>${_esc(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.slice(0, 500).map(row =>
                `<tr>${cols.map(c => `<td>${_esc(row[c])}</td>`).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        </div>
        ${rows.length > 500
          ? `<p style="text-align:center;font-size:12px;color:var(--grey-500);margin-top:6px">
               Showing first 500 of ${fmt(rows.length)} rows. Export to see all.
             </p>` : ''}`;
    } catch (e) {
      container.innerHTML = `<div class="alert alert-danger">
        <span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportReport(id) {
    const report = _rowCache[id];
    if (!report?.rows?.length) { UI.toast('No data to export.', 'warn'); return; }
    const cols = Object.keys(report.rows[0]);
    Exporter.toExcel(report.name || id, [{
      name: report.name || id,
      headers: cols,
      rows: report.rows.map(r => cols.map(c => r[c] ?? '')),
    }]);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _esc(v) {
    if (v === null || v === undefined) return '—';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, loadAndView, exportReport, onDragOver, onDragLeave, onDrop, onFileChosen };
})();
