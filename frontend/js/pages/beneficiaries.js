const BeneficiariesPage = (() => {
  let _data = [], _filtered = [];

  async function render() {
    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Beneficiaries</div><div class="page-sub">All registered beneficiaries</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Exporter.dropdownBtn('BeneficiariesPage.exportExcel()','BeneficiariesPage.exportPDF()')}
          ${Auth.can('editBeneficiary') ? `<button class="btn btn-primary" onclick="BeneficiariesPage.openAddModal()"><span class="material-icons-round">add</span> Add</button>` : ''}
          <a class="btn btn-outlined" href="/api/upload/template"><span class="material-icons-round">download</span> Template</a>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div class="search-input" style="flex:1;min-width:200px"><span class="material-icons-round">search</span><input id="benSearch" placeholder="Search name, village, work ID…" oninput="BeneficiariesPage.filter()"></div>
          <select class="form-control" style="width:160px" id="benBlockF" onchange="BeneficiariesPage.filter()">
            <option value="">All Blocks</option>
            ${['Mayiladuthurai','Sirkali','Sembanarkoil','Kuthalam','Papanasam'].map(b=>`<option>${b}</option>`).join('')}
          </select>
          <select class="form-control" style="width:120px" id="benSchemeF" onchange="BeneficiariesPage.filter()">
            <option value="">All Schemes</option>
            ${['PMAY','IAY','CM Housing','CMHB'].map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
        <div class="table-wrap">
          <table id="benTable">
            <thead><tr><th>#</th><th>Work ID</th><th>Name</th><th>Village / Panchayat</th><th>Block</th><th>Scheme</th><th>Year</th><th style="text-align:right">Sanctioned</th><th style="text-align:right">Issued</th><th style="text-align:right">Balance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="benBody">${UI.skeletonRows(12)}</tbody>
          </table>
        </div>
        <div id="benPagination" style="padding:12px 0;font-size:13px;color:var(--grey-700)"></div>
      </div>`;

    try {
      _data = await API.get('/beneficiaries');
      filter();
    } catch (e) {
      document.getElementById('benBody').innerHTML = `<tr><td colspan="12"><div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div></td></tr>`;
    }
  }

  function filter() {
    const q      = (document.getElementById('benSearch')?.value || '').toLowerCase();
    const block  = document.getElementById('benBlockF')?.value  || '';
    const scheme = document.getElementById('benSchemeF')?.value || '';
    let rows = _data;
    if (q)      rows = rows.filter(b=>`${b.name} ${b.village} ${b.workId} ${b.aadhaar} ${b.mobile}`.toLowerCase().includes(q));
    if (block)  rows = rows.filter(b=>b.block===block);
    if (scheme) rows = rows.filter(b=>b.scheme===scheme);
    _filtered = rows;
    _renderTable(rows);
  }

  function _renderTable(rows) {
    document.getElementById('benBody').innerHTML = rows.length === 0
      ? `<tr><td colspan="12"><div class="empty-state"><span class="material-icons-round">people</span><p>No beneficiaries found</p></div></td></tr>`
      : rows.map((b, i) => {
          const issued  = b.issuedBags || 0;
          const balance = Math.max(0, (b.sanctionedBags||0)-issued);
          return `<tr>
            <td style="color:var(--grey-500)">${i+1}</td>
            <td><code style="font-size:11px">${b.workId||'—'}</code></td>
            <td><strong>${b.name}</strong><br><span style="font-size:11px;color:var(--grey-500)">${b.mobile||''}</span></td>
            <td>${b.village}</td>
            <td>${b.block}</td>
            <td>${b.scheme}</td>
            <td>${b.year}</td>
            <td style="text-align:right;font-weight:600">${fmt(b.sanctionedBags)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600">${fmt(issued)}</td>
            <td style="text-align:right;color:${balance>0?'var(--blue)':'var(--grey-500)'};font-weight:600">${fmt(balance)}</td>
            <td>${statusChip(b.status||'Active')}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-text btn-sm" onclick="BeneficiariesPage.view('${b.id}')">View</button>
              ${Auth.can('editBeneficiary')?`<button class="btn btn-text btn-sm" onclick="BeneficiariesPage.openEditModal('${b.id}')">Edit</button>`:''}
            </td>
          </tr>`;
        }).join('');
    document.getElementById('benPagination').textContent = `Showing ${rows.length} of ${_data.length} beneficiaries`;
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    const rows = (_filtered.length ? _filtered : _data);
    Exporter.toExcel('Beneficiaries', [{
      name: 'Beneficiaries',
      headers: ['#','Work ID','Name','Village','Block','Scheme','Year','Sanctioned Bags','Issued Bags','Balance','Mobile','Aadhaar','Status'],
      rows: rows.map((b,i) => {
        const issued  = b.issuedBags||0;
        const balance = Math.max(0,(b.sanctionedBags||0)-issued);
        return [i+1, b.workId||'', b.name, b.village, b.block, b.scheme, b.year,
                b.sanctionedBags||0, issued, balance, b.mobile||'', b.aadhaar||'', b.status||'Active'];
      }),
    }]);
  }

  function exportPDF() {
    const rows = (_filtered.length ? _filtered : _data);
    Exporter.toPDF('Beneficiaries', `Beneficiaries List (${rows.length} records)`,
      ['#','Work ID','Name','Village','Block','Scheme','Sanctioned','Issued','Balance'],
      rows.map((b,i) => {
        const issued  = b.issuedBags||0;
        const balance = Math.max(0,(b.sanctionedBags||0)-issued);
        return [i+1, b.workId||'—', b.name, b.village, b.block, b.scheme,
                b.sanctionedBags||0, issued, balance];
      }),
      { landscape: true }
    );
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function view(id) {
    const b = _data.find(x=>x.id===id);
    if (!b) return;
    const issued  = b.issuedBags||0;
    const balance = Math.max(0,(b.sanctionedBags||0)-issued);
    UI.openModal(`Beneficiary – ${b.name}`, `
      <div class="info-row"><span class="info-key">Work ID</span><span class="info-val"><code>${b.workId||'—'}</code></span></div>
      <div class="info-row"><span class="info-key">Village</span><span class="info-val">${b.village}</span></div>
      <div class="info-row"><span class="info-key">Block</span><span class="info-val">${b.block}</span></div>
      <div class="info-row"><span class="info-key">Scheme</span><span class="info-val">${b.scheme} · ${b.year}</span></div>
      <div class="info-row"><span class="info-key">Mobile</span><span class="info-val">${b.mobile||'—'}</span></div>
      <div class="info-row"><span class="info-key">Aadhaar</span><span class="info-val">${b.aadhaar?b.aadhaar.replace(/\d(?=\d{4})/g,'*'):'—'}</span></div>
      <div class="info-row"><span class="info-key">House No</span><span class="info-val">${b.houseNo||'—'}</span></div>
      <hr class="divider">
      <div class="info-row"><span class="info-key">Sanctioned Bags</span><span class="info-val">${fmt(b.sanctionedBags)}</span></div>
      <div class="info-row"><span class="info-key">Issued Bags</span><span class="info-val" style="color:var(--green)">${fmt(issued)}</span></div>
      <div class="info-row"><span class="info-key">Balance</span><span class="info-val" style="color:var(--blue)">${fmt(balance)}</span></div>
      <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${b.sanctionedBags?Math.round(issued/b.sanctionedBags*100):0}%"></div></div>
    `,[{label:'Close',cls:'btn-outlined',fn:'UI.closeModal()'}]);
  }

  function openAddModal() {
    UI.openModalWithButtons('Add Beneficiary', _form(), [
      {label:'Cancel', cls:'btn-outlined', fn:UI.closeModal},
      {label:'Save',   cls:'btn-primary',  fn:save},
    ]);
  }

  function openEditModal(id) {
    const b = _data.find(x=>x.id===id);
    if (!b) return;
    UI.openModalWithButtons('Edit Beneficiary', _form(b), [
      {label:'Cancel', cls:'btn-outlined', fn:UI.closeModal},
      {label:'Update', cls:'btn-primary',  fn:()=>save(id)},
    ]);
  }

  function _form(b={}) {
    const BLOCKS = ['Mayiladuthurai','Sirkali','Sembanarkoil','Kuthalam','Papanasam'];
    const user   = Auth.getUser();
    return `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Full Name *</label><input class="form-control" id="bf_name" value="${b.name||''}" required></div>
        <div class="form-group"><label class="form-label">TNRD Work ID</label><input class="form-control" id="bf_workId" value="${b.workId||''}"></div>
        <div class="form-group"><label class="form-label">Village / Panchayat *</label><input class="form-control" id="bf_village" value="${b.village||''}"></div>
        <div class="form-group"><label class="form-label">Block *</label>
          <select class="form-control" id="bf_block">
            ${BLOCKS.map(bl=>`<option ${(b.block||user.block)===bl?'selected':''}>${bl}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Scheme</label>
          <select class="form-control" id="bf_scheme">
            ${['PMAY','IAY','CM Housing','CMHB'].map(s=>`<option ${b.scheme===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Year</label><input class="form-control" id="bf_year" value="${b.year||'2024-25'}"></div>
        <div class="form-group"><label class="form-label">Sanctioned Bags</label><input class="form-control" type="number" id="bf_sanctioned" value="${b.sanctionedBags||30}" min="0"></div>
        <div class="form-group"><label class="form-label">Mobile</label><input class="form-control" id="bf_mobile" value="${b.mobile||''}"></div>
        <div class="form-group"><label class="form-label">Aadhaar</label><input class="form-control" id="bf_aadhaar" value="${b.aadhaar||''}"></div>
        <div class="form-group"><label class="form-label">House No.</label><input class="form-control" id="bf_houseNo" value="${b.houseNo||''}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Address</label><textarea class="form-control" id="bf_address">${b.address||''}</textarea></div>
      </div>`;
  }

  async function save(id) {
    const payload = {
      name:          document.getElementById('bf_name').value.trim(),
      workId:        document.getElementById('bf_workId').value.trim(),
      village:       document.getElementById('bf_village').value.trim(),
      block:         document.getElementById('bf_block').value,
      scheme:        document.getElementById('bf_scheme').value,
      year:          document.getElementById('bf_year').value.trim(),
      sanctionedBags:parseInt(document.getElementById('bf_sanctioned').value)||0,
      mobile:        document.getElementById('bf_mobile').value.trim(),
      aadhaar:       document.getElementById('bf_aadhaar').value.trim(),
      houseNo:       document.getElementById('bf_houseNo').value.trim(),
      address:       document.getElementById('bf_address').value.trim(),
    };
    if (!payload.name||!payload.village){UI.showToast('Name and village are required','error');return;}
    try {
      if (id){await API.put(`/beneficiaries/${id}`,payload);UI.showToast('Beneficiary updated');}
      else   {await API.post('/beneficiaries',payload);      UI.showToast('Beneficiary added');}
      UI.closeModal(); render();
    } catch(e){UI.showToast(e.message,'error');}
  }

  return { render, filter, view, openAddModal, openEditModal, save, exportExcel, exportPDF };
})();
