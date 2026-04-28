/* TNRD Reports Page – shows Excel files auto-downloaded from tnrd.tn.gov.in */
const TnrdPage = (() => {
  let _reports   = [];
  let _activeId  = null;
  let _rowCache  = {};

  // ── Entry point ──────────────────────────────────────────────────────────
  async function render() {
    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">TNRD Portal Reports</div>
          <div class="page-sub">Auto-downloaded from tnrd.tn.gov.in · Refreshed on schedule</div>
        </div>
        <button class="btn btn-outlined btn-sm" onclick="TnrdPage.render()">
          <span class="material-icons-round">refresh</span> Refresh
        </button>
      </div>
      <div id="tnrdBody"><div class="empty-state">
        <span class="material-icons-round spin">sync</span><p>Loading reports…</p>
      </div></div>`;

    try {
      _reports  = await API.get('/tnrd/reports');
      _rowCache = {};
      _renderList();
    } catch (e) {
      document.getElementById('tnrdBody').innerHTML =
        `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Report card list ─────────────────────────────────────────────────────
  function _renderList() {
    const el = document.getElementById('tnrdBody');

    if (!_reports.length) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="material-icons-round">cloud_download</span>
          <p>No reports downloaded yet.</p>
          <p style="font-size:12px;color:var(--grey-500)">
            Run the Python downloader to populate reports from tnrd.tn.gov.in
          </p>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:20px">
        ${_reports.map(_statusCard).join('')}
      </div>
      <div id="tnrdDetail"></div>`;

    // Auto-open first successful report
    const first = _reports.find(r => r.status === 'success') || _reports[0];
    if (first) openReport(first.id);
  }

  function _statusCard(r) {
    const ok       = r.status === 'success';
    const err      = r.status === 'error';
    const color    = ok ? 'green' : err ? 'red' : 'yellow';
    const icon     = ok ? 'check_circle' : err ? 'error_outline' : 'schedule';
    const timeStr  = r.downloadedAt
      ? new Date(r.downloadedAt).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' })
      : 'Never';
    const schedStr = r.scheduleAt?.length ? r.scheduleAt.join(', ') : '—';

    return `
      <div class="stat-card clickable" onclick="TnrdPage.openReport('${r.id}')"
           id="tnrd-card-${r.id}" style="cursor:pointer">
        <div class="stat-icon ${color}">
          <span class="material-icons-round">${icon}</span>
        </div>
        <div class="stat-body">
          <div class="stat-value">${fmt(r.rowCount)}</div>
          <div class="stat-label">${r.name}</div>
          <div style="font-size:11px;color:var(--grey-500);margin-top:4px">
            <span class="material-icons-round" style="font-size:11px;vertical-align:middle">schedule</span>
            ${schedStr} &nbsp;·&nbsp;
            <span class="material-icons-round" style="font-size:11px;vertical-align:middle">cloud_done</span>
            ${timeStr}
          </div>
          ${err ? `<div style="font-size:11px;color:var(--red);margin-top:2px">${r.lastError || 'Download error'}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Report detail table ──────────────────────────────────────────────────
  async function openReport(id) {
    _activeId = id;
    // Highlight active card
    document.querySelectorAll('[id^="tnrd-card-"]').forEach(c => c.style.outline = '');
    const card = document.getElementById(`tnrd-card-${id}`);
    if (card) card.style.outline = '2px solid var(--blue)';

    const detail = document.getElementById('tnrdDetail');
    if (!detail) return;
    detail.innerHTML = `<div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading rows…</p></div>`;

    try {
      if (!_rowCache[id]) {
        _rowCache[id] = await API.get(`/tnrd/reports/${id}`);
      }
      const report = _rowCache[id];
      detail.innerHTML = _reportDetail(report);
    } catch (e) {
      detail.innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  function _reportDetail(report) {
    const rows = report.rows || [];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const timeStr = report.downloadedAt
      ? new Date(report.downloadedAt).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })
      : '—';

    const badge = report.status === 'success'
      ? `<span class="role-badge" style="background:var(--green-bg);color:var(--green)">Success</span>`
      : `<span class="role-badge" style="background:var(--red-bg);color:var(--red)">${report.status}</span>`;

    return `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <div class="section-title" style="margin:0">${report.name}</div>
            <div style="font-size:12px;color:var(--grey-500);margin-top:4px">
              ${badge}
              &nbsp;
              <span class="material-icons-round" style="font-size:12px;vertical-align:middle">cloud_done</span>
              Last downloaded: ${timeStr}
              &nbsp;·&nbsp;
              <strong>${fmt(report.rowCount)}</strong> rows
            </div>
          </div>
          <button class="btn btn-outlined btn-sm" onclick="TnrdPage.exportReport('${report.id}')">
            <span class="material-icons-round">download</span> Export Excel
          </button>
        </div>

        ${rows.length === 0
          ? '<div class="empty-state"><span class="material-icons-round">table_view</span><p>No data in this report yet.</p></div>'
          : `<div class="table-wrap">
              <table>
                <thead>
                  <tr>${cols.map(c => `<th>${_escape(c)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                  ${rows.slice(0, 500).map(row => `
                    <tr>${cols.map(c => `<td>${_escape(row[c])}</td>`).join('')}</tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ${rows.length > 500
              ? `<div style="text-align:center;font-size:12px;color:var(--grey-500);padding:8px">
                   Showing 500 of ${fmt(rows.length)} rows. Export to Excel to see all.
                 </div>`
              : ''}`}
      </div>`;
  }

  // ── Export to Excel ──────────────────────────────────────────────────────
  function exportReport(id) {
    const report = _rowCache[id];
    if (!report || !report.rows?.length) {
      UI.toast('No data to export.', 'warn');
      return;
    }
    const cols = Object.keys(report.rows[0]);
    Exporter.toExcel(report.name, [{
      name: report.name,
      headers: cols,
      rows: report.rows.map(r => cols.map(c => r[c] ?? '')),
    }]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _escape(v) {
    if (v === null || v === undefined) return '—';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { render, openReport, exportReport };
})();
