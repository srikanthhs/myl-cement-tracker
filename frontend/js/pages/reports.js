const ReportsPage = (() => {
  let _cache = {};

  async function render() {
    const el   = document.getElementById('mainContent');
    const user = Auth.getUser();
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Reports</div><div class="page-sub">Summary and analytics</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Exporter.dropdownBtn('ReportsPage.exportExcel()','ReportsPage.exportPDF()')}
          <button class="btn btn-outlined btn-sm" onclick="window.print()"><span class="material-icons-round">print</span> Print</button>
        </div>
      </div>
      <div class="tab-bar">
        <button class="tab active" onclick="ReportsPage.showTab('summary',this)">${user.role==='admin'?'District Summary':'Block Summary'}</button>
        <button class="tab" onclick="ReportsPage.showTab('issuance',this)">Issuance Log</button>
        <button class="tab" onclick="ReportsPage.showTab('pending',this)">Pending Allotments</button>
      </div>
      <div id="reportContent"><div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div></div>`;

    showTab('summary', document.querySelector('.tab-bar .tab'));
  }

  async function showTab(tab, btn) {
    document.querySelectorAll('.tab-bar .tab').forEach(t=>t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _cache.tab = tab;
    const el = document.getElementById('reportContent');
    el.innerHTML = `<div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div>`;
    try {
      if (tab==='summary') {
        const data = Auth.getUser()?.role==='admin'
          ? await API.get('/reports/district')
          : await API.get('/reports/block');
        _cache.summary = data;
        el.innerHTML   = _summaryTable(data);
      } else if (tab==='issuance') {
        el.innerHTML = _logFilter();
        loadLog();
      } else if (tab==='pending') {
        const data = await API.get('/reports/pending');
        _cache.pending = data;
        el.innerHTML   = _pendingTable(data);
      }
    } catch(e) {
      el.innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    const tab = _cache.tab || 'summary';
    if (tab==='summary' && _cache.summary) {
      const data = _cache.summary;
      const isDistrict = !!data.rows?.[0]?.block;
      const label = isDistrict ? 'Block' : 'Panchayat';
      Exporter.toExcel('Reports', [{
        name: isDistrict ? 'District Summary' : 'Block Summary',
        headers: [label,'Beneficiaries','Sanctioned Bags','Received','Issued','Balance','Progress %'],
        rows: (data.rows||[]).map(r=>[
          r.block||r.panchayat, r.beneficiaries, r.sanctioned, r.received||0, r.issued, r.balance, r.pct+'%',
        ]).concat([['TOTAL', data.totals?.beneficiaries, data.totals?.sanctioned, data.totals?.received||0, data.totals?.issued, data.totals?.balance, data.totals?.pct+'%']]),
      }]);
    } else if (tab==='issuance' && _cache.issuanceLog) {
      Exporter.toExcel('Issuance_Log', [{
        name: 'Issuance Log',
        headers: ['Date','Beneficiary','Village','Block','Challan No.','Bags','Issued By'],
        rows: _cache.issuanceLog.map(i=>[fmtDate(i.issuedAt), i.beneficiaryName, i.village, i.block, i.challanNo, i.bags, i.issuedBy]),
      }]);
    } else if (tab==='pending' && _cache.pending) {
      Exporter.toExcel('Pending_Allotments', [{
        name: 'Pending Allotments',
        headers: ['Challan No.','Beneficiary','Village','Block','Bags','Status','Created'],
        rows: _cache.pending.map(a=>[a.challanNo, a.beneficiaryName, a.village, a.block, a.bags, a.status, fmtDate(a.createdAt)]),
      }]);
    } else {
      UI.showToast('Load a report first before exporting', 'warning');
    }
  }

  function exportPDF() {
    const tab = _cache.tab || 'summary';
    if (tab==='summary' && _cache.summary) {
      const data = _cache.summary;
      const isDistrict = !!data.rows?.[0]?.block;
      Exporter.toPDF('Report_Summary', isDistrict ? 'District Summary' : 'Block Summary',
        [isDistrict?'Block':'Panchayat','Beneficiaries','Sanctioned','Issued','Balance','%'],
        (data.rows||[]).map(r=>[r.block||r.panchayat, r.beneficiaries, r.sanctioned, r.issued, r.balance, r.pct+'%']),
        { landscape: true }
      );
    } else if (tab==='issuance' && _cache.issuanceLog) {
      Exporter.toPDF('Issuance_Log', 'Issuance Log',
        ['Date','Beneficiary','Village','Block','Challan','Bags','Issued By'],
        _cache.issuanceLog.map(i=>[fmtDate(i.issuedAt), i.beneficiaryName, i.village, i.block, i.challanNo, i.bags, i.issuedBy]),
        { landscape: true }
      );
    } else if (tab==='pending' && _cache.pending) {
      Exporter.toPDF('Pending_Allotments', 'Pending Allotments',
        ['Challan No.','Beneficiary','Village','Block','Bags','Status'],
        _cache.pending.map(a=>[a.challanNo, a.beneficiaryName, a.village, a.block, a.bags, a.status]),
        { landscape: true }
      );
    } else {
      UI.showToast('Load a report first before exporting', 'warning');
    }
  }

  // ── Renderers ─────────────────────────────────────────────────
  function _summaryTable(data) {
    if (!data) return '<div class="empty-state"><p>No data</p></div>';
    const rows = data.rows||[];
    const tot  = data.totals||{};
    const label = data.block ? 'Panchayat' : 'Block';
    return `
      <div class="card"><div class="table-wrap"><table>
        <thead><tr>
          <th>${label}</th>
          <th style="text-align:right">Beneficiaries</th>
          <th style="text-align:right">Sanctioned Bags</th>
          <th style="text-align:right">Received</th>
          <th style="text-align:right">Issued</th>
          <th style="text-align:right">Balance</th>
          <th>Progress</th>
        </tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr>
              <td><strong>${data.block?r.panchayat:r.block}</strong></td>
              <td style="text-align:right">${fmt(r.beneficiaries)}</td>
              <td style="text-align:right">${fmt(r.sanctioned)}</td>
              <td style="text-align:right">${fmt(r.received||0)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600">${fmt(r.issued)}</td>
              <td style="text-align:right;color:var(--blue);font-weight:600">${fmt(r.balance)}</td>
              <td style="min-width:100px">
                <div class="progress-bar"><div class="progress-fill" style="width:${r.pct}%"></div></div>
                <div style="font-size:10px;color:var(--grey-500);margin-top:2px">${r.pct}%</div>
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--blue-light);font-weight:700">
            <td>TOTAL</td>
            <td style="text-align:right">${fmt(tot.beneficiaries)}</td>
            <td style="text-align:right">${fmt(tot.sanctioned)}</td>
            <td style="text-align:right">${fmt(tot.received||0)}</td>
            <td style="text-align:right;color:var(--green)">${fmt(tot.issued)}</td>
            <td style="text-align:right;color:var(--blue)">${fmt(tot.balance)}</td>
            <td>${tot.pct}%</td>
          </tr>
        </tfoot>
      </table></div></div>`;
  }

  function _logFilter() {
    const today = new Date().toISOString().slice(0,10);
    const month = today.slice(0,7)+'-01';
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group"><label class="form-label">From</label><input class="form-control" type="date" id="rpt_from" value="${month}"></div>
          <div class="form-group"><label class="form-label">To</label><input class="form-control" type="date" id="rpt_to" value="${today}"></div>
          <button class="btn btn-primary btn-sm" onclick="ReportsPage.loadLog()"><span class="material-icons-round">search</span> Search</button>
        </div>
      </div>
      <div class="card" id="logTable"><div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div></div>`;
  }

  async function loadLog() {
    const from = document.getElementById('rpt_from')?.value||'';
    const to   = document.getElementById('rpt_to')?.value||'';
    const el   = document.getElementById('logTable');
    if(!el)return;
    el.innerHTML = `<div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div>`;
    try {
      const data = await API.get(`/reports/issuance-log?from=${from}&to=${to}`);
      _cache.issuanceLog = data;
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Beneficiary</th><th>Village</th><th>Block</th><th>Challan</th><th style="text-align:right">Bags</th><th>Issued By</th></tr></thead>
        <tbody>
          ${data.length===0
            ?`<tr><td colspan="7"><div class="empty-state"><p>No issuances in this period</p></div></td></tr>`
            :data.map(i=>`
                <tr>
                  <td>${fmtDate(i.issuedAt)}</td>
                  <td><strong>${i.beneficiaryName}</strong></td>
                  <td>${i.village}</td>
                  <td>${i.block}</td>
                  <td><code style="font-size:11px">${i.challanNo}</code></td>
                  <td style="text-align:right;font-weight:700;color:var(--green)">${fmt(i.bags)}</td>
                  <td>${i.issuedBy}</td>
                </tr>`).join('')}
        </tbody>
        ${data.length?`<tfoot><tr style="background:var(--grey-50);font-weight:700">
          <td colspan="5">TOTAL</td>
          <td style="text-align:right;color:var(--green)">${fmt(data.reduce((s,i)=>s+i.bags,0))}</td>
          <td></td>
        </tr></tfoot>`:''}
      </table></div>`;
    } catch(e) {
      el.innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  function _pendingTable(data) {
    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Allotment ID</th><th>Beneficiary</th><th>Village</th><th>Block</th><th style="text-align:right">Bags</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>
        ${data.length===0
          ?`<tr><td colspan="7"><div class="empty-state"><span class="material-icons-round">check_circle</span><p>No pending allotments</p></div></td></tr>`
          :data.map(a=>`
              <tr>
                <td><code style="font-size:11px">${a.challanNo}</code></td>
                <td><strong>${a.beneficiaryName}</strong></td>
                <td>${a.village}</td>
                <td>${a.block}</td>
                <td style="text-align:right;font-weight:700">${fmt(a.bags)}</td>
                <td>${statusChip(a.status)}</td>
                <td>${fmtDate(a.createdAt)}</td>
              </tr>`).join('')}
      </tbody>
    </table></div></div>`;
  }

  return { render, showTab, loadLog, exportExcel, exportPDF };
})();
