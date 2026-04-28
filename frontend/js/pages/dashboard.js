const DashboardPage = (() => {
  let _cache = {};

  async function render() {
    const el   = document.getElementById('mainContent');
    const user = Auth.getUser();
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Dashboard</div><div class="page-sub">Welcome, ${user.name} · ${user.designation || ''}</div></div>
        <div style="display:flex;gap:8px">
          ${Exporter.dropdownBtn('DashboardPage.exportExcel()','DashboardPage.exportPDF()')}
          <button class="btn btn-outlined btn-sm" onclick="DashboardPage.render()">
            <span class="material-icons-round">refresh</span> Refresh
          </button>
        </div>
      </div>
      <div class="stat-grid" id="statGrid">${_skeleton()}</div>
      <div id="dashBody"></div>`;

    try {
      const [bens, allots, issuances, stockSum, alerts] = await Promise.all([
        API.get('/beneficiaries'),
        API.get('/allotments'),
        API.get('/issuance'),
        API.get('/stock/summary'),
        API.get('/alerts'),
      ]);

      _cache = { bens, allots, issuances, stockSum };

      const sanctioned = bens.reduce((s, b) => s + (b.sanctionedBags || 0), 0);
      const issued     = issuances.reduce((s, i) => s + (i.bags || 0), 0);
      const pending    = allots.filter(a => a.status === 'Pending').length;
      const approved   = allots.filter(a => a.status === 'Approved').length;
      const pct        = sanctioned ? Math.round(issued / sanctioned * 100) : 0;

      const alertBadge = document.getElementById('sidebarAlertBadge');
      if (alertBadge && alerts.length) {
        alertBadge.textContent = alerts.length;
        alertBadge.classList.remove('hidden');
      }

      document.getElementById('statGrid').innerHTML = `
        ${_statCard('people',      'blue',   fmt(bens.length),    'Total Beneficiaries',    `${bens.filter(b=>b.status==='Active').length} active`, 'beneficiaries')}
        ${_statCard('assignment',  'yellow', fmt(pending),        'Pending Allotments',     `${approved} approved & ready`, 'allotments')}
        ${_statCard('output',      'green',  fmt(issued),         'Bags Issued',            `${pct}% of ${fmt(sanctioned)} sanctioned`, 'issuance')}
        ${_statCard('inventory_2', 'purple', fmt(stockSum.blockBal || 0), 'Block Stock Balance', `${fmt(stockSum.blockRecv || 0)} received`, 'stock')}
      `;

      document.getElementById('dashBody').innerHTML = `
        <div class="card">
          <div class="section-title">District Issuance Progress</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
            <span>Issued: <strong>${fmt(issued)}</strong> bags</span>
            <span>Target: <strong>${fmt(sanctioned)}</strong> bags</span>
            <span style="color:var(--blue);font-weight:700">${pct}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="section-title">Recent Issuances</div>
          ${issuances.length === 0
            ? '<div class="empty-state"><span class="material-icons-round">output</span><p>No issuances yet</p></div>'
            : `<div class="table-wrap"><table>
                <thead><tr><th>Beneficiary</th><th>Village</th><th>Block</th><th>Bags</th><th>Date</th></tr></thead>
                <tbody>
                  ${[...issuances].sort((a,b)=>(b.issuedAt||'')>(a.issuedAt||'')?1:-1).slice(0,10).map(i=>`
                    <tr>
                      <td><strong>${i.beneficiaryName}</strong></td>
                      <td>${i.village||'—'}</td>
                      <td>${i.block}</td>
                      <td><strong>${fmt(i.bags)}</strong></td>
                      <td>${fmtDate(i.issuedAt)}</td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
        ${alerts.slice(0,3).map(a=>`
          <div class="alert alert-${a.type==='warning'?'warn':'info'}" style="margin-top:12px">
            <span class="material-icons-round">${a.type==='warning'?'warning':'info'}</span>
            <div><strong>${a.title}</strong><br><span style="font-size:12px">${a.body}</span></div>
          </div>`).join('')}`;
    } catch (err) {
      document.getElementById('statGrid').innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${err.message}</div>`;
    }
  }

  function exportExcel() {
    const { bens = [], allots = [], issuances = [], stockSum = {} } = _cache;
    const sanctioned = bens.reduce((s,b)=>s+(b.sanctionedBags||0),0);
    const issued     = issuances.reduce((s,i)=>s+(i.bags||0),0);

    Exporter.toExcel('Dashboard_Summary', [
      {
        name: 'Summary',
        headers: ['Metric', 'Value'],
        rows: [
          ['Total Beneficiaries', bens.length],
          ['Active Beneficiaries', bens.filter(b=>b.status==='Active').length],
          ['Total Sanctioned Bags', sanctioned],
          ['Total Bags Issued', issued],
          ['Issuance %', sanctioned ? Math.round(issued/sanctioned*100)+'%' : '0%'],
          ['Pending Allotments', allots.filter(a=>a.status==='Pending').length],
          ['Approved Allotments', allots.filter(a=>a.status==='Approved').length],
          ['Block Stock Balance', stockSum.blockBal || 0],
          ['Block Stock Received', stockSum.blockRecv || 0],
        ],
      },
      {
        name: 'Recent Issuances',
        headers: ['Beneficiary','Village','Block','Bags','Date','Issued By'],
        rows: [...issuances].sort((a,b)=>(b.issuedAt||'')>(a.issuedAt||'')?1:-1).slice(0,50)
          .map(i=>[i.beneficiaryName, i.village, i.block, i.bags, fmtDate(i.issuedAt), i.issuedBy]),
      },
    ]);
  }

  function exportPDF() {
    const { bens=[], allots=[], issuances=[], stockSum={} } = _cache;
    const sanctioned = bens.reduce((s,b)=>s+(b.sanctionedBags||0),0);
    const issued     = issuances.reduce((s,i)=>s+(i.bags||0),0);

    Exporter.toPDF('Dashboard_Summary', 'Dashboard Summary', ['Metric','Value'], [
      ['Total Beneficiaries', bens.length],
      ['Total Sanctioned Bags', sanctioned],
      ['Total Bags Issued', issued],
      ['Issuance Progress', sanctioned ? Math.round(issued/sanctioned*100)+'%' : '0%'],
      ['Pending Allotments', allots.filter(a=>a.status==='Pending').length],
      ['Block Stock Balance', stockSum.blockBal || 0],
    ]);
  }

  function _statCard(icon, color, val, label, sub, page) {
    return `
      <div class="stat-card" onclick="Router.navigate('${page}')">
        <div class="stat-icon ${color}"><span class="material-icons-round">${icon}</span></div>
        <div>
          <div class="stat-val">${val}</div>
          <div class="stat-label">${label}</div>
          <div class="stat-sub">${sub}</div>
        </div>
      </div>`;
  }

  function _skeleton() {
    return Array(4).fill(0).map(()=>`
      <div class="stat-card" style="cursor:default">
        <div class="skeleton" style="width:48px;height:48px;border-radius:12px"></div>
        <div style="flex:1">
          <div class="skeleton" style="height:28px;width:80px;margin-bottom:8px"></div>
          <div class="skeleton" style="height:13px;width:120px;margin-bottom:4px"></div>
          <div class="skeleton" style="height:11px;width:90px"></div>
        </div>
      </div>`).join('');
  }

  return { render, exportExcel, exportPDF };
})();
