const SettingsPage = (() => {
  function render() {
    const user = Auth.getUser();
    document.getElementById('mainContent').innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Settings</div><div class="page-sub">Application configuration</div></div>
        ${Exporter.dropdownBtn('SettingsPage.exportExcel()','SettingsPage.exportPDF()')}
      </div>

      <div class="card">
        <div class="section-title">Account</div>
        <div class="info-row"><span class="info-key">Name</span><span class="info-val">${user.name}</span></div>
        <div class="info-row"><span class="info-key">Username</span><span class="info-val"><code>${user.username}</code></span></div>
        <div class="info-row"><span class="info-key">Role</span><span class="info-val"><span class="role-badge rb-${user.role}">${user.role.toUpperCase()}</span></span></div>
        <div class="info-row"><span class="info-key">Block</span><span class="info-val">${user.block||'All Blocks (District)'}</span></div>
        <div class="info-row"><span class="info-key">Department</span><span class="info-val">${user.dept||'—'}</span></div>
        <div class="info-row"><span class="info-key">Mobile</span><span class="info-val">${user.mobile||'—'}</span></div>
        <div class="info-row"><span class="info-key">Designation</span><span class="info-val">${user.designation||'—'}</span></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">Application Info</div>
        <div class="info-row"><span class="info-key">App Version</span><span class="info-val">2.0.0</span></div>
        <div class="info-row"><span class="info-key">Architecture</span><span class="info-val">3-Tier (Presentation · Logic · Data)</span></div>
        <div class="info-row"><span class="info-key">Backend</span><span class="info-val">Node.js + Express REST API</span></div>
        <div class="info-row"><span class="info-key">Database</span><span class="info-val">Firebase Firestore (${user.block||'mydrdcement'})</span></div>
        <div class="info-row"><span class="info-key">Frontend</span><span class="info-val">Vanilla JS · Material Design</span></div>
        <div class="info-row"><span class="info-key">Export</span><span class="info-val">XLSX + jsPDF AutoTable</span></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">Quick Exports</div>
        <p style="font-size:13px;color:var(--grey-700);margin-bottom:12px">Export data snapshots directly from settings</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outlined btn-sm" onclick="SettingsPage.exportAll()">
            <span class="material-icons-round">download_for_offline</span> Full Data Export (Excel)
          </button>
          <button class="btn btn-outlined btn-sm" onclick="SettingsPage.exportAllPDF()">
            <span class="material-icons-round">picture_as_pdf</span> Full Summary (PDF)
          </button>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">Actions</div>
        <button class="btn btn-danger btn-sm" onclick="Auth.logout()" style="margin-top:4px">
          <span class="material-icons-round">logout</span> Sign Out
        </button>
      </div>`;
  }

  // ── Export account / app info ─────────────────────────────────
  function exportExcel() {
    const user = Auth.getUser();
    Exporter.toExcel('Settings_Info', [{
      name: 'Account',
      headers: ['Field','Value'],
      rows: [
        ['Name',        user.name],
        ['Username',    user.username],
        ['Role',        user.role.toUpperCase()],
        ['Block',       user.block||'All Blocks'],
        ['Designation', user.designation||'—'],
        ['Department',  user.dept||'—'],
        ['Mobile',      user.mobile||'—'],
        [],
        ['App Version', '2.0.0'],
        ['Architecture','3-Tier'],
        ['Backend',     'Node.js + Express'],
        ['Database',    'Firebase Firestore (mydrdcement)'],
      ],
    }]);
  }

  function exportPDF() {
    const user = Auth.getUser();
    Exporter.toPDF('Settings_Info', 'Account & Application Info',
      ['Field','Value'],
      [
        ['Name',        user.name],
        ['Username',    user.username],
        ['Role',        user.role.toUpperCase()],
        ['Block',       user.block||'All Blocks'],
        ['Designation', user.designation||'—'],
        ['Department',  user.dept||'—'],
        ['Mobile',      user.mobile||'—'],
        ['App Version', '2.0.0'],
        ['Architecture','3-Tier (Presentation · Logic · Data)'],
        ['Backend',     'Node.js + Express REST API'],
        ['Database',    'Firebase Firestore'],
      ]
    );
  }

  async function exportAll() {
    UI.showToast('Fetching all data…', 'info');
    try {
      const [bens, allots, issuances, bdoStock] = await Promise.all([
        API.get('/beneficiaries'),
        API.get('/allotments'),
        API.get('/issuance'),
        API.get('/stock/bdo-entries'),
      ]);
      Exporter.toExcel('Full_Data_Export', [
        {
          name: 'Beneficiaries',
          headers: ['Work ID','Name','Village','Block','Scheme','Year','Sanctioned','Issued','Balance','Mobile','Status'],
          rows: bens.map(b=>{const iss=b.issuedBags||0;return[b.workId||'',b.name,b.village,b.block,b.scheme,b.year,b.sanctionedBags||0,iss,Math.max(0,(b.sanctionedBags||0)-iss),b.mobile||'',b.status||'Active'];})
        },
        {
          name: 'Allotments',
          headers: ['Challan No.','Beneficiary','Village','Block','Bags','Status','Engineer Verified','Created'],
          rows: allots.map(a=>[a.challanNo,a.beneficiaryName,a.village,a.block,a.bags,a.status,a.engineerVerified?'Yes':'No',fmtDate(a.createdAt)])
        },
        {
          name: 'Issuances',
          headers: ['Challan No.','Beneficiary','Village','Block','Bags','Issued By','Date'],
          rows: issuances.map(i=>[i.challanNo,i.beneficiaryName,i.village,i.block,i.bags,i.issuedBy,fmtDate(i.issuedAt)])
        },
        {
          name: 'Block Stock',
          headers: ['Receipt ID','Block','Bags','Invoice No.','Date','By'],
          rows: bdoStock.map(e=>[e.id,e.block,e.bags,e.invoiceNo||'',fmtDate(e.date),e.by])
        },
      ]);
    } catch(e) { UI.showToast(e.message, 'error'); }
  }

  async function exportAllPDF() {
    UI.showToast('Generating summary PDF…', 'info');
    try {
      const [bens, allots, issuances] = await Promise.all([
        API.get('/beneficiaries'),
        API.get('/allotments'),
        API.get('/issuance'),
      ]);
      const sanctioned = bens.reduce((s,b)=>s+(b.sanctionedBags||0),0);
      const issued     = issuances.reduce((s,i)=>s+(i.bags||0),0);
      Exporter.toPDF('Full_Summary', 'Full District Data Summary',
        ['Metric','Value'],
        [
          ['Total Beneficiaries',   bens.length],
          ['Active Beneficiaries',  bens.filter(b=>b.status==='Active').length],
          ['Total Sanctioned Bags', sanctioned],
          ['Total Bags Issued',     issued],
          ['Issuance Progress',     sanctioned?Math.round(issued/sanctioned*100)+'%':'0%'],
          ['Total Allotments',      allots.length],
          ['Pending Allotments',    allots.filter(a=>a.status==='Pending').length],
          ['Approved Allotments',   allots.filter(a=>a.status==='Approved').length],
          ['Rejected Allotments',   allots.filter(a=>a.status==='Rejected').length],
          ['Total Issuances',       issuances.length],
        ]
      );
    } catch(e) { UI.showToast(e.message, 'error'); }
  }

  return { render, exportExcel, exportPDF, exportAll, exportAllPDF };
})();
