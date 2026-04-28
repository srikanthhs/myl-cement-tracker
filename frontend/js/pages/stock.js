const StockPage = (() => {
  let _cache = { summary:{}, ledger:[], bdoEntries:[] };

  async function render() {
    const el = document.getElementById('mainContent');
    const user = Auth.getUser();
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Stock Management</div><div class="page-sub">Central depot & block-level stock tracking</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Exporter.dropdownBtn('StockPage.exportExcel()','StockPage.exportPDF()')}
          ${Auth.can('addStock')?`<button class="btn btn-outlined" onclick="StockPage.openBlockReceipt()"><span class="material-icons-round">add_box</span> Block Receipt</button>`:''}
          ${user?.role==='admin'?`<button class="btn btn-primary" onclick="StockPage.openCentralReceipt()"><span class="material-icons-round">warehouse</span> Central Receipt</button>`:''}
        </div>
      </div>
      <div id="stockBody"><div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div></div>`;

    try {
      const [summary, ledger, bdoEntries] = await Promise.all([
        API.get('/stock/summary'),
        API.get('/stock/ledger'),
        API.get('/stock/bdo-entries'),
      ]);
      _cache = { summary, ledger, bdoEntries };

      el.querySelector('#stockBody').innerHTML = `
        <div class="stat-grid">
          <div class="stat-card" style="cursor:default">
            <div class="stat-icon blue"><span class="material-icons-round">warehouse</span></div>
            <div><div class="stat-val">${fmt(summary.centralBal)}</div><div class="stat-label">Central Stock Balance</div><div class="stat-sub">${fmt(summary.centralRecv)} received · ${fmt(summary.centralIss)} issued</div></div>
          </div>
          <div class="stat-card" style="cursor:default">
            <div class="stat-icon green"><span class="material-icons-round">inventory_2</span></div>
            <div><div class="stat-val">${fmt(summary.blockBal)}</div><div class="stat-label">Block Stock Balance</div><div class="stat-sub">${fmt(summary.blockRecv)} received · ${fmt(summary.blockIssd)} issued</div></div>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="section-title">Block Stock Receipts</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Receipt ID</th><th>Block</th><th style="text-align:right">Bags</th><th>Invoice No.</th><th>Lorry No.</th><th>Date</th><th>Entered By</th></tr></thead>
            <tbody>
              ${bdoEntries.length===0
                ?`<tr><td colspan="7"><div class="empty-state"><span class="material-icons-round">inventory_2</span><p>No block receipts yet</p></div></td></tr>`
                :[...bdoEntries].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1).map(e=>`
                    <tr>
                      <td><code style="font-size:11px">${e.id.slice(-8)}</code></td>
                      <td>${e.block}</td>
                      <td style="text-align:right;font-weight:700;color:var(--green)">${fmt(e.bags)}</td>
                      <td>${e.invoiceNo||'—'}</td>
                      <td>${e.lorryNo||'—'}</td>
                      <td>${fmtDate(e.date)}</td>
                      <td>${e.by}</td>
                    </tr>`).join('')}
            </tbody>
          </table></div>
        </div>

        ${user?.role==='admin'?`
        <div class="card" style="margin-top:16px">
          <div class="section-title">Central Stock Ledger</div>
          <div class="table-wrap"><table>
            <thead><tr><th>ID</th><th>Type</th><th style="text-align:right">Bags</th><th>Block</th><th>Date</th><th>By</th><th>Remarks</th></tr></thead>
            <tbody>
              ${ledger.length===0
                ?`<tr><td colspan="7"><div class="empty-state"><p>No ledger entries</p></div></td></tr>`
                :[...ledger].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1).map(e=>`
                    <tr>
                      <td><code style="font-size:11px">${e.id.slice(-8)}</code></td>
                      <td><span class="chip ${e.type==='RECEIPT'?'chip-issued':'chip-partial'}">${e.type}</span></td>
                      <td style="text-align:right;font-weight:700">${fmt(e.bags)}</td>
                      <td>${e.block||'—'}</td>
                      <td>${fmtDate(e.date)}</td>
                      <td>${e.by}</td>
                      <td style="font-size:12px;color:var(--grey-700)">${e.remarks||'—'}</td>
                    </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`:''}`;
    } catch(e) {
      el.querySelector('#stockBody').innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    const { summary, ledger, bdoEntries } = _cache;
    const sheets = [
      {
        name: 'Summary',
        headers: ['Metric','Value'],
        rows: [
          ['Central Stock Received', summary.centralRecv||0],
          ['Central Stock Issued',   summary.centralIss||0],
          ['Central Stock Balance',  summary.centralBal||0],
          ['Block Stock Received',   summary.blockRecv||0],
          ['Block Stock Issued',     summary.blockIssd||0],
          ['Block Stock Balance',    summary.blockBal||0],
        ],
      },
      {
        name: 'Block Receipts',
        headers: ['Receipt ID','Block','Bags','Invoice No.','Lorry No.','Date','Entered By'],
        rows: [...bdoEntries].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1)
          .map(e=>[e.id, e.block, e.bags, e.invoiceNo||'', e.lorryNo||'', fmtDate(e.date), e.by]),
      },
    ];
    if (Auth.getUser()?.role==='admin') {
      sheets.push({
        name: 'Central Ledger',
        headers: ['ID','Type','Bags','Block','Date','By','Remarks'],
        rows: [...ledger].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1)
          .map(e=>[e.id, e.type, e.bags, e.block||'', fmtDate(e.date), e.by, e.remarks||'']),
      });
    }
    Exporter.toExcel('Stock_Report', sheets);
  }

  function exportPDF() {
    const { summary, bdoEntries } = _cache;
    Exporter.toPDF('Stock_Report', 'Stock Management Report',
      ['Block','Bags Received','Invoice No.','Date','Entered By'],
      [...bdoEntries].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1)
        .map(e=>[e.block, e.bags, e.invoiceNo||'—', fmtDate(e.date), e.by]),
      { landscape: false }
    );
  }

  // ── Modals ────────────────────────────────────────────────────
  function openBlockReceipt() {
    const user = Auth.getUser();
    UI.openModalWithButtons('Add Block Stock Receipt',`
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Block</label><input class="form-control" id="br_block" value="${user.block||''}" ${user.role!=='admin'?'readonly':''}></div>
        <div class="form-group"><label class="form-label">Bags Received *</label><input class="form-control" type="number" id="br_bags" placeholder="e.g. 500" min="1"></div>
        <div class="form-group"><label class="form-label">Invoice No.</label><input class="form-control" id="br_invoice"></div>
        <div class="form-group"><label class="form-label">Lorry No.</label><input class="form-control" id="br_lorry"></div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-control" type="date" id="br_date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Remarks</label><input class="form-control" id="br_remarks"></div>
      </div>`,[
      {label:'Cancel',      cls:'btn-outlined', fn:UI.closeModal},
      {label:'Save Receipt',cls:'btn-green',    fn:async()=>{
        const bags=parseInt(document.getElementById('br_bags').value);
        if(!bags||bags<=0){UI.showToast('Bags must be > 0','error');return;}
        try{
          await API.post('/stock/block-receipt',{block:document.getElementById('br_block').value,bags,invoiceNo:document.getElementById('br_invoice').value,lorryNo:document.getElementById('br_lorry').value,date:document.getElementById('br_date').value,remarks:document.getElementById('br_remarks').value});
          UI.showToast('Stock receipt added');UI.closeModal();render();
        }catch(e){UI.showToast(e.message,'error');}
      }},
    ]);
  }

  function openCentralReceipt() {
    UI.openModalWithButtons('Add Central Receipt',`
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Bags *</label><input class="form-control" type="number" id="cr_bags" placeholder="e.g. 5000" min="1"></div>
        <div class="form-group"><label class="form-label">Supplier</label><input class="form-control" id="cr_supplier"></div>
        <div class="form-group"><label class="form-label">Invoice No.</label><input class="form-control" id="cr_invoice"></div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-control" type="date" id="cr_date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Remarks</label><input class="form-control" id="cr_remarks"></div>
      </div>`,[
      {label:'Cancel',cls:'btn-outlined',fn:UI.closeModal},
      {label:'Save', cls:'btn-primary',  fn:async()=>{
        const bags=parseInt(document.getElementById('cr_bags').value);
        if(!bags||bags<=0){UI.showToast('Bags must be > 0','error');return;}
        try{
          await API.post('/stock/central-receipt',{bags,supplier:document.getElementById('cr_supplier').value,invoiceNo:document.getElementById('cr_invoice').value,date:document.getElementById('cr_date').value,remarks:document.getElementById('cr_remarks').value});
          UI.showToast('Central receipt added');UI.closeModal();render();
        }catch(e){UI.showToast(e.message,'error');}
      }},
    ]);
  }

  return { render, exportExcel, exportPDF, openBlockReceipt, openCentralReceipt };
})();
