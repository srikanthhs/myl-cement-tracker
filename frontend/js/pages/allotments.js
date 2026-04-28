const AllotmentsPage = (() => {
  let _data = [], _bens = [], _filter = 'all', _filtered = [];

  async function render() {
    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Cement Allotments</div><div class="page-sub">Create and manage allotment orders</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Exporter.dropdownBtn('AllotmentsPage.exportExcel()','AllotmentsPage.exportPDF()')}
          ${Auth.can('createAllotment')?`<button class="btn btn-primary" onclick="AllotmentsPage.openNew()"><span class="material-icons-round">add</span> New Allotment</button>`:''}
        </div>
      </div>
      <div class="tab-bar">
        <button class="tab active" onclick="AllotmentsPage.setFilter('all',this)">All</button>
        <button class="tab" onclick="AllotmentsPage.setFilter('Pending',this)">⏳ Pending</button>
        <button class="tab" onclick="AllotmentsPage.setFilter('awaiting_engineer',this)">🔧 Awaiting Engineer</button>
        <button class="tab" onclick="AllotmentsPage.setFilter('awaiting_bdo',this)">📋 Awaiting BDO</button>
        <button class="tab" onclick="AllotmentsPage.setFilter('Approved',this)">✅ Approved</button>
        <button class="tab" onclick="AllotmentsPage.setFilter('Rejected',this)">❌ Rejected</button>
      </div>
      <div class="card">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div class="search-input" style="flex:1;min-width:180px"><span class="material-icons-round">search</span><input id="altSearch" placeholder="Search name, challan…" oninput="AllotmentsPage.applyFilter()"></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Allotment ID</th><th>Beneficiary</th><th>Village</th><th>Block</th><th>Scheme</th><th style="text-align:right">Bags</th><th>Challan No.</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody id="altBody">${UI.skeletonRows(10)}</tbody>
          </table>
        </div>
      </div>`;

    try {
      [_data, _bens] = await Promise.all([API.get('/allotments'), API.get('/beneficiaries')]);
      applyFilter();
    } catch(e) {
      document.getElementById('altBody').innerHTML = `<tr><td colspan="10"><div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div></td></tr>`;
    }
  }

  function setFilter(f, btn) {
    _filter = f;
    document.querySelectorAll('.tab-bar .tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    applyFilter();
  }

  function applyFilter() {
    const q = (document.getElementById('altSearch')?.value||'').toLowerCase();
    let rows = _data;
    if (_filter==='awaiting_engineer') rows = rows.filter(a=>a.status==='Pending'&&!a.engineerVerified);
    else if (_filter==='awaiting_bdo') rows = rows.filter(a=>a.status==='Pending'&&a.engineerVerified);
    else if (_filter!=='all')          rows = rows.filter(a=>a.status===_filter);
    if (q) rows = rows.filter(a=>`${a.beneficiaryName} ${a.challanNo} ${a.village}`.toLowerCase().includes(q));
    _filtered = rows;

    document.getElementById('altBody').innerHTML = rows.length===0
      ? `<tr><td colspan="10"><div class="empty-state"><span class="material-icons-round">assignment</span><p>No allotments found</p></div></td></tr>`
      : rows.map(a=>`
          <tr>
            <td><code style="font-size:11px">${a.id.slice(-8)}</code></td>
            <td><strong>${a.beneficiaryName}</strong></td>
            <td>${a.village}</td>
            <td>${a.block}</td>
            <td>${a.scheme}</td>
            <td style="text-align:right;font-weight:700">${fmt(a.bags)}</td>
            <td><code style="font-size:11px">${a.challanNo}</code></td>
            <td>
              ${statusChip(a.status)}
              ${a.engineerVerified?'<span class="chip chip-verified" style="font-size:10px;margin-left:4px">🔧 Verified</span>':''}
            </td>
            <td>${fmtDate(a.createdAt)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-text btn-sm" onclick="AllotmentsPage.view('${a.id}')">View</button>
              ${Auth.can('engineerVerify')&&a.status==='Pending'&&!a.engineerVerified
                ?`<button class="btn btn-text btn-sm" style="color:var(--purple)" onclick="AllotmentsPage.engineerVerify('${a.id}')">Verify</button>`:''}
              ${Auth.can('approveAllotment')&&a.status==='Pending'
                ?`<button class="btn btn-text btn-sm" style="color:var(--green)" onclick="AllotmentsPage.approve('${a.id}')">Approve</button>
                  <button class="btn btn-text btn-sm" style="color:var(--red)"   onclick="AllotmentsPage.reject('${a.id}')">Reject</button>`:''}
            </td>
          </tr>`).join('');
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    const rows = _filtered.length ? _filtered : _data;
    Exporter.toExcel('Allotments', [{
      name: 'Allotments',
      headers: ['Allotment ID','Challan No.','Beneficiary','Village','Block','Scheme','Year','Bags','Status','Engineer Verified','Created By','Created Date'],
      rows: rows.map(a=>[
        a.id, a.challanNo, a.beneficiaryName, a.village, a.block, a.scheme, a.year||'',
        a.bags, a.status, a.engineerVerified?'Yes':'No', a.createdBy||'', fmtDate(a.createdAt),
      ]),
    }]);
  }

  function exportPDF() {
    const rows = _filtered.length ? _filtered : _data;
    Exporter.toPDF('Allotments', `Allotments (${rows.length} records)`,
      ['Challan No.','Beneficiary','Village','Block','Bags','Status','Date'],
      rows.map(a=>[a.challanNo, a.beneficiaryName, a.village, a.block, a.bags, a.status, fmtDate(a.createdAt)]),
      { landscape: true }
    );
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function view(id) {
    const a = _data.find(x=>x.id===id);
    if (!a) return;
    const tl = (a.timeline||[]).map(t=>`
      <div class="tl-item">
        <div class="tl-dot done"></div>
        <div class="tl-label">${t.event}</div>
        <div class="tl-meta">${t.by} · ${fmtDateTime(t.at)}</div>
        ${t.note?`<div class="tl-note">${t.note}</div>`:''}
      </div>`).join('');
    UI.openModal(`Allotment – ${a.challanNo}`,`
      <div class="info-row"><span class="info-key">Beneficiary</span><span class="info-val">${a.beneficiaryName}</span></div>
      <div class="info-row"><span class="info-key">Village</span><span class="info-val">${a.village}</span></div>
      <div class="info-row"><span class="info-key">Block</span><span class="info-val">${a.block}</span></div>
      <div class="info-row"><span class="info-key">Scheme / Year</span><span class="info-val">${a.scheme} · ${a.year}</span></div>
      <div class="info-row"><span class="info-key">Bags Allotted</span><span class="info-val"><strong>${fmt(a.bags)}</strong></span></div>
      <div class="info-row"><span class="info-key">Status</span><span class="info-val">${statusChip(a.status)}</span></div>
      <div class="info-row"><span class="info-key">Engineer Verified</span><span class="info-val">${a.engineerVerified?'✅ Yes':'⏳ No'}</span></div>
      <hr class="divider">
      <div class="section-title">Timeline</div>
      <div class="timeline">${tl||'<p style="color:var(--grey-500);font-size:13px">No timeline events</p>'}</div>
    `,[{label:'Close',cls:'btn-outlined',fn:'UI.closeModal()'}]);
  }

  function openNew() {
    const opts = _bens.map(b=>`<option value="${b.id}">${b.name} – ${b.village} (${b.block})</option>`).join('');
    UI.openModalWithButtons('New Allotment',`
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Beneficiary *</label><select class="form-control" id="af_ben">${opts}</select></div>
        <div class="form-group"><label class="form-label">Bags *</label><input class="form-control" type="number" id="af_bags" value="30" min="1"></div>
        <div class="form-group"><label class="form-label">Remarks</label><input class="form-control" id="af_remarks" placeholder="Optional remarks…"></div>
      </div>`,[
      {label:'Cancel',           cls:'btn-outlined', fn:UI.closeModal},
      {label:'Create Allotment', cls:'btn-primary',  fn:_save},
    ]);
  }

  async function _save() {
    const payload={beneficiaryId:document.getElementById('af_ben').value,bags:parseInt(document.getElementById('af_bags').value),remarks:document.getElementById('af_remarks').value};
    if(!payload.bags||payload.bags<=0){UI.showToast('Bags must be > 0','error');return;}
    try{await API.post('/allotments',payload);UI.showToast('Allotment created');UI.closeModal();render();}
    catch(e){UI.showToast(e.message,'error');}
  }

  async function engineerVerify(id) {
    UI.openModalWithButtons('Engineer Verification',`
      <div class="alert alert-info"><span class="material-icons-round">info</span>Confirm site visit and work readiness.</div>
      <div class="form-group"><label class="form-label">Remarks</label><textarea class="form-control" id="ev_remarks" rows="3" placeholder="Site observations…"></textarea></div>
    `,[
      {label:'Cancel',         cls:'btn-outlined', fn:UI.closeModal},
      {label:'Confirm Verify', cls:'btn-primary',  fn:async()=>{
        try{await API.patch(`/allotments/${id}/engineer-verify`,{remarks:document.getElementById('ev_remarks').value});UI.showToast('Engineer verification submitted');UI.closeModal();render();}
        catch(e){UI.showToast(e.message,'error');}
      }},
    ]);
  }

  async function approve(id) {
    if(!confirm('Approve this allotment?'))return;
    try{await API.patch(`/allotments/${id}/approve`,{});UI.showToast('Allotment approved');render();}
    catch(e){UI.showToast(e.message,'error');}
  }

  async function reject(id) {
    const reason=prompt('Rejection reason:');
    if(!reason)return;
    try{await API.patch(`/allotments/${id}/reject`,{reason});UI.showToast('Allotment rejected');render();}
    catch(e){UI.showToast(e.message,'error');}
  }

  return { render, setFilter, applyFilter, view, openNew, engineerVerify, approve, reject, exportExcel, exportPDF };
})();
