/* ═══════════════════════════════════════════════════════
   Exporter – shared Excel & PDF export utility
   Uses: XLSX (already loaded) + jsPDF + jsPDF-AutoTable
   ═══════════════════════════════════════════════════════ */
const Exporter = (() => {

  // ── Shared header branding ───────────────────────────────────
  const DEPT  = 'Rural Development Department – Mayiladuthurai District';
  const STAMP = () => `Exported on ${new Date().toLocaleString('en-IN')}`;

  // ─────────────────────────────────────────────────────────────
  // EXCEL
  // sheets = [{ name, headers:[], rows:[[]] }]
  // ─────────────────────────────────────────────────────────────
  function toExcel(filename, sheets) {
    if (typeof XLSX === 'undefined') { UI.showToast('XLSX library not loaded', 'error'); return; }
    const wb = XLSX.utils.book_new();

    sheets.forEach(({ name, headers, rows }) => {
      // Title rows
      const titleRows = [
        ['MYL Cement Tracker – ' + name],
        [DEPT],
        [STAMP()],
        [],
        headers,
        ...rows,
      ];
      const ws = XLSX.utils.aoa_to_sheet(titleRows);

      // Style header row (row index 4 = 0-based)
      const headerRowIdx = 4;
      headers.forEach((_, ci) => {
        const cell = XLSX.utils.encode_cell({ r: headerRowIdx, c: ci });
        if (!ws[cell]) return;
        ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: '1A73E8' } } };
      });

      // Auto column widths
      const colWidths = headers.map((h, ci) => ({
        wch: Math.max(h.length, ...rows.map(r => String(r[ci] ?? '').length), 10),
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });

    XLSX.writeFile(wb, `${filename}_${_dateTag()}.xlsx`);
    UI.showToast('Excel exported successfully');
  }

  // ─────────────────────────────────────────────────────────────
  // PDF
  // ─────────────────────────────────────────────────────────────
  function toPDF(filename, title, headers, rows, opts = {}) {
    if (typeof window.jspdf === 'undefined') { UI.showToast('jsPDF library not loaded', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const orientation = opts.landscape || headers.length > 6 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

    // Header band
    doc.setFillColor(26, 115, 232);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('MYL Cement Tracker', 14, 9);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(DEPT, 14, 15);

    // Title
    doc.setTextColor(32, 33, 36);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 30);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(95, 99, 104);
    doc.text(STAMP(), 14, 36);

    // Table
    doc.autoTable({
      head:       [headers],
      body:       rows,
      startY:     40,
      margin:     { left: 14, right: 14 },
      styles:     { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      didDrawPage(data) {
        // Footer on every page
        const pgW = doc.internal.pageSize.getWidth();
        const pgH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setTextColor(154, 160, 166);
        doc.text(`Page ${data.pageNumber}`, pgW / 2, pgH - 6, { align: 'center' });
        doc.text('MYL Cement Tracker – Rural Development Dept', 14, pgH - 6);
      },
    });

    doc.save(`${filename}_${_dateTag()}.pdf`);
    UI.showToast('PDF exported successfully');
  }

  // ─────────────────────────────────────────────────────────────
  // Dropdown button HTML (insert into page-header)
  // ─────────────────────────────────────────────────────────────
  function dropdownBtn(onExcel, onPdf) {
    const id = 'expDrop_' + Math.random().toString(36).slice(2, 7);
    return `
      <div style="position:relative;display:inline-block">
        <button class="btn btn-outlined btn-sm" onclick="document.getElementById('${id}').classList.toggle('hidden')" style="gap:4px">
          <span class="material-icons-round">download</span> Export
          <span class="material-icons-round" style="font-size:14px;margin-left:-4px">arrow_drop_down</span>
        </button>
        <div id="${id}" class="hidden" style="position:absolute;right:0;top:38px;background:#fff;border:1px solid var(--grey-200);border-radius:8px;box-shadow:var(--shadow-2);z-index:90;min-width:160px;overflow:hidden">
          <button onclick="${onExcel};document.getElementById('${id}').classList.add('hidden')"
            style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-family:var(--font);color:var(--grey-900)" onmouseover="this.style.background='var(--grey-50)'" onmouseout="this.style.background='none'">
            <span class="material-icons-round" style="font-size:18px;color:#1e8e3e">table_chart</span> Excel (.xlsx)
          </button>
          <button onclick="${onPdf};document.getElementById('${id}').classList.add('hidden')"
            style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-family:var(--font);color:var(--grey-900)" onmouseover="this.style.background='var(--grey-50)'" onmouseout="this.style.background='none'">
            <span class="material-icons-round" style="font-size:18px;color:#d93025">picture_as_pdf</span> PDF
          </button>
        </div>
      </div>`;
  }

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('[id^="expDrop_"]') && !e.target.closest('button[onclick*="expDrop_"]')) {
      document.querySelectorAll('[id^="expDrop_"]').forEach(el => el.classList.add('hidden'));
    }
  });

  function _dateTag() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  return { toExcel, toPDF, dropdownBtn };
})();
