const UploadPage = (() => {
  let _previewRows = [], _previewHeaders = [];

  function render() {
    const el   = document.getElementById('mainContent');
    const user = Auth.getUser();
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Master Upload</div><div class="page-sub">Bulk import beneficiary records from Excel</div></div>
        <div style="display:flex;gap:8px">
          ${Exporter.dropdownBtn('UploadPage.exportTemplate()','UploadPage.exportTemplatePDF()')}
          <a class="btn btn-outlined" href="/api/upload/template"><span class="material-icons-round">download</span> Download Template</a>
        </div>
      </div>
      <div class="card">
        <div class="alert alert-info"><span class="material-icons-round">info</span>
          Upload an .xlsx file with columns: <strong>TNRD Work ID, Beneficiary Name, Village/Panchayat, Scheme, Year, Sanctioned Bags, Issued Bags, Mobile, Aadhaar, House No, Address</strong>
        </div>
        <div class="form-grid" style="margin-top:16px">
          <div class="form-group">
            <label class="form-label">Block</label>
            <select class="form-control" id="up_block">
              ${['Mayiladuthurai','Sirkali','Sembanarkoil','Kuthalam','Papanasam','Sirkazhi','Tarangambadi'].map(b=>
                `<option ${user.block===b?'selected':''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Excel File (.xlsx / .csv)</label>
            <input type="file" class="form-control" id="up_file" accept=".xlsx,.xls,.csv">
          </div>
        </div>
        <div id="up_preview" style="margin-top:16px"></div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outlined" onclick="UploadPage.preview()"><span class="material-icons-round">preview</span> Preview</button>
          <button class="btn btn-primary" id="up_submitBtn" onclick="UploadPage.submit()" disabled><span class="material-icons-round">upload</span> Import to Database</button>
          <button class="btn btn-text" id="up_exportBtn" onclick="UploadPage.exportPreviewExcel()" style="display:none"><span class="material-icons-round">table_chart</span> Export Preview</button>
        </div>
        <div id="up_result" style="margin-top:12px"></div>
      </div>`;
  }

  function preview() {
    const file = document.getElementById('up_file').files[0];
    if (!file) { UI.showToast('Please select a file first', 'error'); return; }
    if (typeof XLSX === 'undefined') { UI.showToast('XLSX library not loaded', 'error'); return; }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb    = XLSX.read(e.target.result, { type:'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows  = XLSX.utils.sheet_to_json(sheet, { defval:'' });
        if (!rows.length) { UI.showToast('File is empty', 'error'); return; }

        _previewHeaders = Object.keys(rows[0]);
        _previewRows    = rows;
        const preview   = rows.slice(0, 10);

        document.getElementById('up_preview').innerHTML = `
          <div class="section-title">Preview – first ${Math.min(10, rows.length)} of ${rows.length} rows</div>
          <div class="table-wrap"><table>
            <thead><tr>${_previewHeaders.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${preview.map(r=>`<tr>${_previewHeaders.map(c=>`<td>${r[c]??''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
          <div style="margin-top:8px;font-size:13px;color:var(--grey-700)">
            <strong>${rows.length}</strong> rows detected · Block: <strong>${document.getElementById('up_block').value}</strong>
          </div>`;

        document.getElementById('up_submitBtn').disabled = false;
        document.getElementById('up_exportBtn').style.display = 'inline-flex';
      } catch(err) { UI.showToast('Could not parse file: ' + err.message, 'error'); }
    };
    reader.readAsBinaryString(file);
  }

  async function submit() {
    const file  = document.getElementById('up_file').files[0];
    const block = document.getElementById('up_block').value;
    if (!file) { UI.showToast('No file selected', 'error'); return; }

    const btn = document.getElementById('up_submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Importing…';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('block', block);

    try {
      const result = await API.upload('/upload/beneficiaries', formData);
      document.getElementById('up_result').innerHTML = `
        <div class="alert alert-success">
          <span class="material-icons-round">check_circle</span>
          <strong>${result.message}</strong>
        </div>`;
      UI.showToast(result.message);
    } catch(e) {
      document.getElementById('up_result').innerHTML = `
        <div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons-round">upload</span> Import to Database';
    }
  }

  // ── Export helpers ────────────────────────────────────────────
  function exportPreviewExcel() {
    if (!_previewRows.length) { UI.showToast('Preview the file first', 'warning'); return; }
    const block = document.getElementById('up_block')?.value || '';
    Exporter.toExcel(`Upload_Preview_${block}`, [{
      name: 'Preview',
      headers: _previewHeaders,
      rows: _previewRows.map(r => _previewHeaders.map(h => r[h] ?? '')),
    }]);
  }

  // Export blank template as Excel
  function exportTemplate() {
    Exporter.toExcel('Beneficiary_Template', [{
      name: 'Beneficiaries',
      headers: ['TNRD Work ID','Beneficiary Name','Village/Panchayat','Scheme','Year','Sanctioned Bags','Issued Bags','Mobile','Aadhaar','House No','Address'],
      rows: [
        ['W/12345','Sample Name','Panchayat Name','PMAY','2024-25','30','0','9000000000','1234-5678-9012','H.No.1','Village, Block'],
      ],
    }]);
  }

  // Export blank template outline as PDF
  function exportTemplatePDF() {
    Exporter.toPDF('Beneficiary_Template', 'Beneficiary Upload Template – Column Guide',
      ['Column Name','Description','Example'],
      [
        ['TNRD Work ID',      'Unique work order number',              'W/12345'],
        ['Beneficiary Name',  'Full name of beneficiary',              'R. Murugan'],
        ['Village/Panchayat', 'Village or panchayat name',             'Agarakeerangudi'],
        ['Scheme',            'Housing scheme name',                   'PMAY'],
        ['Year',              'Financial year',                        '2024-25'],
        ['Sanctioned Bags',   'Number of cement bags sanctioned',      '30'],
        ['Issued Bags',       'Already issued (0 for new records)',    '0'],
        ['Mobile',            '10-digit mobile number',               '9400001001'],
        ['Aadhaar',           '12-digit Aadhaar number',              '1234-5678-9012'],
        ['House No',          'House/door number',                     'H.No. 1'],
        ['Address',           'Full address',                          'Village, Block, District'],
      ]
    );
  }

  return { render, preview, submit, exportPreviewExcel, exportTemplate, exportTemplatePDF };
})();
