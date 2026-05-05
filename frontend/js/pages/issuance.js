const IssuancePage = (() => {
  let _data = [], _allots = [], _gps = null, _photos = [];

  async function render() {
    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Cement Issuance</div><div class="page-sub">Issue cement against approved allotments</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Exporter.dropdownBtn('IssuancePage.exportExcel()','IssuancePage.exportPDF()')}
          ${Auth.can('issueCement')?`<button class="btn btn-primary" onclick="IssuancePage.openIssueModal()"><span class="material-icons-round">output</span> Issue Cement</button>`:''}
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Issuance ID</th><th>Beneficiary</th><th>Village</th><th>Block</th><th>Challan</th><th style="text-align:right">Bags</th><th>Issued By</th><th>Date</th><th>GPS</th><th>Photos</th><th>Actions</th></tr></thead>
            <tbody id="issBody">${UI.skeletonRows(10)}</tbody>
          </table>
        </div>
      </div>`;

    try {
      [_data, _allots] = await Promise.all([API.get('/issuance'), API.get('/allotments')]);
      _renderTable();
    } catch(e) {
      document.getElementById('issBody').innerHTML = `<tr><td colspan="11"><div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div></td></tr>`;
    }
  }

  function _renderTable() {
    document.getElementById('issBody').innerHTML = _data.length===0
      ? `<tr><td colspan="11"><div class="empty-state"><span class="material-icons-round">output</span><p>No issuances recorded</p></div></td></tr>`
      : [..._data].sort((a,b)=>(b.issuedAt||'')>(a.issuedAt||'')?1:-1).map(i=>`
          <tr>
            <td><code style="font-size:11px">${i.id.slice(-8)}</code></td>
            <td><strong>${i.beneficiaryName}</strong></td>
            <td>${i.village}</td>
            <td>${i.block}</td>
            <td><code style="font-size:11px">${i.challanNo}</code></td>
            <td style="text-align:right;font-weight:700;color:var(--green)">${fmt(i.bags)}</td>
            <td>${i.issuedBy}</td>
            <td>${fmtDate(i.issuedAt)}</td>
            <td>${i.gps?'<span class="chip chip-verified" style="font-size:10px">✓ GPS</span>':'—'}</td>
            <td>${i.photos?.length||0} photos</td>
            <td style="white-space:nowrap">
              <button class="btn btn-text btn-sm" onclick="IssuancePage.view('${i.id}')">View</button>
              <button class="btn btn-text btn-sm" onclick="IssuancePage.printSlip('${i.id}')">Print</button>
            </td>
          </tr>`).join('');
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    Exporter.toExcel('Issuance_Records', [{
      name: 'Issuance Records',
      headers: ['Issuance ID','Beneficiary','Village','Block','Scheme','Challan No.','Bags Issued','Received By','GPS Lat','GPS Lng','Photos','Issued By','Date & Time'],
      rows: [..._data].sort((a,b)=>(b.issuedAt||'')>(a.issuedAt||'')?1:-1).map(i=>[
        i.id, i.beneficiaryName, i.village, i.block, i.scheme||'', i.challanNo, i.bags,
        i.receivedBy||'', i.gps?.lat||'', i.gps?.lng||'', i.photos?.length||0,
        i.issuedBy, fmtDateTime(i.issuedAt),
      ]),
    }]);
  }

  function exportPDF() {
    Exporter.toPDF('Issuance_Records', `Issuance Records (${_data.length} entries)`,
      ['Beneficiary','Village','Block','Challan No.','Bags','Issued By','Date'],
      [..._data].sort((a,b)=>(b.issuedAt||'')>(a.issuedAt||'')?1:-1)
        .map(i=>[i.beneficiaryName, i.village, i.block, i.challanNo, i.bags, i.issuedBy, fmtDate(i.issuedAt)]),
      { landscape: true }
    );
  }

  // ── View / Print ──────────────────────────────────────────────
  function view(id) {
    const i = _data.find(x=>x.id===id);
    if(!i)return;
    UI.openModal(`Issuance – ${i.challanNo}`,`
      <div class="info-row"><span class="info-key">Beneficiary</span><span class="info-val">${i.beneficiaryName}</span></div>
      <div class="info-row"><span class="info-key">Village</span><span class="info-val">${i.village}</span></div>
      <div class="info-row"><span class="info-key">Block</span><span class="info-val">${i.block}</span></div>
      <div class="info-row"><span class="info-key">Bags Issued</span><span class="info-val" style="color:var(--green);font-size:20px;font-weight:700">${fmt(i.bags)}</span></div>
      <div class="info-row"><span class="info-key">Challan</span><span class="info-val"><code>${i.challanNo}</code></span></div>
      <div class="info-row"><span class="info-key">Issued By</span><span class="info-val">${i.issuedBy}</span></div>
      <div class="info-row"><span class="info-key">Date & Time</span><span class="info-val">${fmtDateTime(i.issuedAt)}</span></div>
      <div class="info-row"><span class="info-key">GPS</span><span class="info-val">${i.gps?`${i.gps.lat}, ${i.gps.lng}`:'Not captured'}</span></div>
      ${i.photos?.length?`<hr class="divider"><div class="section-title">Photos</div><div class="photo-grid">${i.photos.map(p=>`<img src="${p}" class="photo-thumb">`).join('')}</div>`:''}
    `,[
      {label:'Close',         cls:'btn-outlined', fn:'UI.closeModal()'},
      {label:'BT Print',      cls:'btn-outlined', fn:`Printer.printReceipt(${JSON.stringify(i).replace(/"/g,"'")})`},
      {label:'Print / PDF',   cls:'btn-primary',  fn:`IssuancePage.printSlip('${i.id}')`},
    ]);
  }

  function _scanBeneficiary() {
    Scanner.scan(value => {
      const match = _allots.find(a =>
        a.status === 'Approved' && (
          (a.workId   && a.workId.toLowerCase()   === value.toLowerCase()) ||
          (a.id       && a.id.toLowerCase()        === value.toLowerCase()) ||
          (a.beneficiaryName && a.beneficiaryName.toLowerCase().includes(value.toLowerCase()))
        )
      );
      if (match) {
        const sel = document.getElementById('if_allot');
        if (sel) { sel.value = match.id; UI.showToast(`Matched: ${match.beneficiaryName}`, 'success'); }
      } else {
        // put scanned value into received-by as fallback
        const rcvd = document.getElementById('if_rcvd');
        if (rcvd) rcvd.value = value;
        UI.showToast('No allotment matched – ID placed in Received By', 'info');
      }
    });
  }

  function openIssueModal() {
    const readyAllots = _allots.filter(a=>a.status==='Approved');
    if(!readyAllots.length){UI.showToast('No approved allotments available','warning');return;}
    _gps=null; _photos=[];
    const opts = readyAllots.map(a=>`<option value="${a.id}">${a.beneficiaryName} – ${a.village} (${fmt(a.bags)} bags)</option>`).join('');
    UI.openModalWithButtons('Issue Cement',`
      <div style="margin-bottom:12px">
        <button class="btn btn-outlined" onclick="IssuancePage._scanBeneficiary()" style="width:100%;justify-content:center">
          <span class="material-icons-round">qr_code_scanner</span> Scan Beneficiary ID
        </button>
      </div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Allotment *</label><select class="form-control" id="if_allot">${opts}</select></div>
        <div class="form-group"><label class="form-label">Bags to Issue *</label><input class="form-control" type="number" id="if_bags" placeholder="Enter bag count" min="1"></div>
        <div class="form-group"><label class="form-label">Received By</label><input class="form-control" id="if_rcvd" placeholder="Beneficiary / representative name"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Remarks</label><input class="form-control" id="if_remarks" placeholder="Optional…"></div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">Photos <span style="color:var(--red)">*</span></label>
        <input type="file" accept="image/*" capture="environment" id="if_photo_input" multiple style="display:none" onchange="IssuancePage._onPhoto(event)">
        <div class="photo-grid" id="if_photos">
          <div class="photo-add" onclick="document.getElementById('if_photo_input').click()">
            <span class="material-icons-round">add_a_photo</span><span>Add Photo</span>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">GPS Location <span style="color:var(--red)">*</span></label>
        <button class="btn btn-outlined btn-sm" onclick="IssuancePage._captureGPS()" style="margin-top:4px">
          <span class="material-icons-round">my_location</span> Capture GPS
        </button>
        <div id="if_gps_status" style="font-size:12px;color:var(--grey-500);margin-top:6px">⚠ Not captured – GPS required</div>
      </div>
    `,[
      {label:'Cancel',       cls:'btn-outlined', fn:UI.closeModal},
      {label:'Issue Cement', cls:'btn-green',    fn:_submit},
    ]);
  }

  function _onPhoto(event) {
    Array.from(event.target.files||[]).forEach(file=>{
      const r=new FileReader();
      r.onload=e=>{_photos.push(e.target.result);_renderPhotoZone();};
      r.readAsDataURL(file);
    });
  }
  function _renderPhotoZone() {
    const zone=document.getElementById('if_photos');
    if(!zone)return;
    zone.innerHTML=_photos.map(src=>`<img src="${src}" class="photo-thumb">`).join('')+`
      <div class="photo-add" onclick="document.getElementById('if_photo_input').click()">
        <span class="material-icons-round">add_a_photo</span><span>Add Photo</span>
      </div>`;
  }
  async function _captureGPS() {
    try{_gps=await UI.captureGPS('if_gps_status');}catch{}
  }
  async function _submit() {
    const bags=parseInt(document.getElementById('if_bags').value);
    if(!bags||bags<=0){UI.showToast('Bags must be > 0','error');return;}
    if(!_photos.length){UI.showToast('At least one photo is required','error');return;}
    if(!_gps){UI.showToast('GPS location is required','error');return;}
    try{
      const issued = await API.post('/issuance',{
        allotmentId:document.getElementById('if_allot').value, bags,
        receivedBy:document.getElementById('if_rcvd').value,
        remarks:document.getElementById('if_remarks').value,
        photos:_photos, gps:_gps,
      });
      UI.closeModal();
      render();
      // Offer print options after successful issuance
      _offerPrint(issued || { bags, gps: _gps });
    }catch(e){UI.showToast(e.message,'error');}
  }

  function _offerPrint(issuance) {
    UI.openModalWithButtons('Cement Issued ✓', `
      <div style="text-align:center;padding:12px 0 8px">
        <span class="material-icons-round" style="font-size:56px;color:var(--green)">check_circle</span>
        <div style="font-size:20px;font-weight:700;margin-top:8px">${fmt(issuance.bags)} Bags Issued</div>
        ${issuance.challanNo ? `<div style="font-size:13px;color:var(--grey-700);margin-top:4px">Challan: <strong>${issuance.challanNo}</strong></div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button class="btn btn-outlined" style="justify-content:center" onclick="IssuancePage._btPrint(${JSON.stringify(issuance).replace(/"/g,'&quot;')})">
          <span class="material-icons-round">print</span> Print via Bluetooth
        </button>
        <button class="btn btn-text" style="justify-content:center" onclick="IssuancePage.printSlip('${issuance.id||''}')">
          <span class="material-icons-round">picture_as_pdf</span> Print / Save as PDF
        </button>
      </div>`,
      [{ label:'Done', cls:'btn-primary', fn: UI.closeModal }]
    );
  }

  async function _btPrint(issuance) {
    await Printer.printReceipt(issuance);
  }

  function printSlip(id) {
    const i=_data.find(x=>x.id===id);
    if(!i)return;
    const now=new Date(i.issuedAt);
    UI.printZone(`
      <div class="slip" style="max-width:600px;margin:20px auto">
        <div class="slip-id">${i.id}</div>
        <div class="slip-header">
          <div class="dept">Rural Development Department, Mayiladuthurai</div>
          <h2>Cement Issuance Slip</h2>
          <div class="sub">Government Housing Scheme · Official Record</div>
        </div>
        <div class="slip-row"><span class="slip-key">Beneficiary</span><span class="slip-val">${i.beneficiaryName}</span></div>
        <div class="slip-row"><span class="slip-key">Village</span><span class="slip-val">${i.village}</span></div>
        <div class="slip-row"><span class="slip-key">Block</span><span class="slip-val">${i.block}</span></div>
        <div class="slip-row"><span class="slip-key">Scheme</span><span class="slip-val">${i.scheme||'—'}</span></div>
        <div class="slip-row"><span class="slip-key">Challan No.</span><span class="slip-val"><strong>${i.challanNo}</strong></span></div>
        <div class="slip-row"><span class="slip-key">Date &amp; Time</span><span class="slip-val">${now.toLocaleString('en-IN')}</span></div>
        <hr class="slip-divider">
        <div class="slip-highlight">
          <div class="qty">${fmt(i.bags)}</div>
          <div class="qty-label">Cement Bags Issued</div>
        </div>
        <hr class="slip-divider">
        <div class="slip-row"><span class="slip-key">Issued By</span><span class="slip-val">${i.issuedBy}</span></div>
        <div class="slip-row"><span class="slip-key">GPS</span><span class="slip-val">${i.gps?`${i.gps.lat}, ${i.gps.lng}`:'N/A'}</span></div>
        <div class="slip-sign">
          <div class="slip-sign-box"><div class="slip-sign-line">Store Keeper / Issuing Officer</div></div>
          <div class="slip-sign-box"><div class="slip-sign-line">Beneficiary / Authorized Receiver</div></div>
        </div>
        <div class="slip-barcode">${i.challanNo.replace(/\//g,' ')}</div>
        <div class="slip-watermark">✓ Digitally Verified – MYL Cement Tracker</div>
      </div>`);
  }

  return { render, view, openIssueModal, printSlip, exportExcel, exportPDF, _onPhoto, _captureGPS, _scanBeneficiary, _btPrint };
})();
