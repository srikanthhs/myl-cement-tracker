const AlertsPage = (() => {
  let _data = [];

  async function render() {
    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Alerts</div><div class="page-sub">System notifications and warnings</div></div>
        <div style="display:flex;gap:8px">
          ${Exporter.dropdownBtn('AlertsPage.exportExcel()','AlertsPage.exportPDF()')}
          <button class="btn btn-outlined btn-sm" onclick="AlertsPage.render()"><span class="material-icons-round">refresh</span> Refresh</button>
        </div>
      </div>
      <div id="alertsBody"><div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div></div>`;

    try {
      _data = await API.get('/alerts');
      if (!_data.length) {
        document.getElementById('alertsBody').innerHTML = `
          <div class="card">
            <div class="empty-state"><span class="material-icons-round">check_circle</span><p>All clear – no alerts</p></div>
          </div>`;
        return;
      }
      document.getElementById('alertsBody').innerHTML = _data.map(a=>`
        <div class="card" style="margin-bottom:12px;border-left:4px solid ${a.type==='warning'?'var(--yellow)':'var(--blue)'}">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span class="material-icons-round" style="color:${a.type==='warning'?'var(--yellow)':'var(--blue)'}">
              ${a.type==='warning'?'warning':'info'}
            </span>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${a.title}</div>
              <div style="font-size:13px;color:var(--grey-700);margin-top:4px">${a.body}</div>
              <div style="font-size:11px;color:var(--grey-500);margin-top:6px">
                ${a.block?`Block: ${a.block} · `:''}${fmtDateTime(a.ts)}
              </div>
            </div>
            <span class="chip ${a.type==='warning'?'chip-partial':'chip-approved'}" style="flex-shrink:0">${a.type}</span>
          </div>
        </div>`).join('');
    } catch(e) {
      document.getElementById('alertsBody').innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    if (!_data.length) { UI.showToast('No alerts to export', 'warning'); return; }
    Exporter.toExcel('Alerts', [{
      name: 'Alerts',
      headers: ['Type','Title','Details','Block','Timestamp'],
      rows: _data.map(a=>[a.type, a.title, a.body, a.block||'District', fmtDateTime(a.ts)]),
    }]);
  }

  function exportPDF() {
    if (!_data.length) { UI.showToast('No alerts to export', 'warning'); return; }
    Exporter.toPDF('Alerts', `System Alerts (${_data.length})`,
      ['Type','Title','Details','Block','Timestamp'],
      _data.map(a=>[a.type, a.title, a.body, a.block||'District', fmtDateTime(a.ts)])
    );
  }

  return { render, exportExcel, exportPDF };
})();
