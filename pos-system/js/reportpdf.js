/* ============================================================
   reportpdf.js — Generación de PDF profesionales (jsPDF)
   Depende de: jsPDF (lib/jspdf.umd.min.js), data.js (db, fmt)
   Exporta: exportReportPDF(opts)
   ============================================================ */

const COMPANY_HEADER = () => db.settings?.company || {};
const HDR_COLOR = [21, 128, 61];      // verde oscuro
const HDR_TXT = [255, 255, 255];
const ZEBRA = [246, 248, 250];
const LINE = [220, 226, 233];
const ACCENT = [21, 128, 61];
const MUTED = [107, 114, 128];
const PAD = 14;                        // margen (mm)

function _rgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _measure(doc, s, size) {
  doc.setFont('helvetica', 'normal').setFontSize(size);
  return doc.getTextWidth(String(s == null ? '' : s).split('\n')[0]) || 1;
}

/* Genera y descarga un PDF A4 profesional a partir de un reporte tabular.
   opts: { title, subtitle, columns:[...], rows:[[..]], align:[..], widthW:[..],
           totals:[...]|null, note, fileName, landscape } */
function exportReportPDF(opts) {
  const comp = COMPANY_HEADER();
  const doc = new jspdf.jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = PAD, right = pageW - PAD;
  const usableW = right - left;

  // ---------- Encabezado de la empresa ----------
  doc.setFillColor.apply(doc, ACCENT);
  doc.rect(0, 0, pageW, 8, 'F');
  doc.setFillColor(200, 230, 201);
  doc.rect(0, 8, pageW, 1, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(20, 24, 28);
  doc.text(comp.name || 'POSsystem Evolution', left, 16);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor.apply(doc, MUTED);
  const subLine = [comp.rif, comp.address, comp.phone, comp.email].filter(Boolean).join('  ·  ');
  doc.text(subLine, left, 21);
  // Sello "Reporte" a la derecha
  doc.setFillColor(240, 249, 243);
  doc.roundedRect(right - 44, 11, 42, 13, 2, 2, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor.apply(doc, ACCENT);
  doc.text('REPORTE', right - 23, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor.apply(doc, MUTED);
  doc.text('FECHA: ' + veDate(), right - 23, 20, { align: 'center' });

  let y = 30;
  // Título del reporte
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20, 24, 28);
  doc.text(opts.title, left, y);
  y += 5;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor.apply(doc, MUTED);
    doc.text(opts.subtitle, left, y);
    y += 4;
  }
  doc.setDrawColor.apply(doc, ACCENT); doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 5;

  const cols = opts.columns.length;
  const align = opts.align || [];
  const cellFont = 8.5;
  const headFont = 9;

  // ---------- Ancho de columnas (proporcional al contenido) ----------
  const widths = new Array(cols).fill(0);
  const padCell = 2.4;
  const colPadTotal = padCell * 2;
  for (let c = 0; c < cols; c++) {
    const headW = _measure(doc, opts.columns[c], headFont) + colPadTotal;
    let mx = headW;
    (opts.rows || []).slice(0, 60).forEach(r => {
      const w = _measure(doc, r[c], cellFont) + colPadTotal;
      if (w > mx) mx = w;
    });
    widths[c] = Math.max(headW, Math.min(mx, usableW * 0.4));
  }
  // Ajustar para que no desborden
  let totalW = widths.reduce((a, b) => a + b, 0);
  if (totalW > usableW) {
    const scale = usableW / totalW;
    for (let c = 0; c < cols; c++) widths[c] = widths[c] * scale;
  } else if (totalW < usableW) {
    // Repartir el sobrante proporcionalmente
    const extra = usableW - totalW;
    for (let c = 0; c < cols; c++) widths[c] += extra * (widths[c] / totalW);
  }

  // ---------- Dibujar una tabla que ocupa varias páginas ----------
  const rowH = 5.6;
  const headH = 7.5;
  const drawRow = (cells, h, bold, fill, txColor, hAlign, fsize) => {
    // celda a celda con wrap
    let lines = cells.map((c, ci) => {
      const s = String(c == null ? '' : c);
      const w = widths[ci] - padCell * 2;
      return { txt: doc.splitTextToSize(s, Math.max(4, w)), a: (hAlign && hAlign[ci]) || 'left', ci };
    });
    const maxLines = Math.max(1, ...lines.map(l => l.txt.length));
    const hh = Math.max(h, maxLines * (fsize + 0.8) + 2.6);
    // check space before page
    if (y + hh > pageH - 12) { footer(); newPage(); }
    let cx = left;
    // fondo de fila
    if (fill) { doc.setFillColor.apply(doc, fill); doc.rect(left, y, usableW, hh, 'F'); }
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(fsize).setTextColor.apply(doc, txColor);
    cells.forEach((cell, ci) => {
      const lw = widths[ci] - padCell * 2;
      const linesT = doc.splitTextToSize(String(cell == null ? '' : cell), Math.max(4, lw));
      const a = (hAlign && hAlign[ci]) || 'left';
      const lineH = fsize + 0.7;
      linesT.forEach((ln, li) => {
        const textX = a === 'center' ? cx + widths[ci] / 2 : a === 'right' ? cx + widths[ci] - padCell : cx + padCell;
        const yy = y + padCell + 2 + li * lineH;
        doc.text(ln, textX, yy, { align: a === 'center' ? 'center' : a === 'right' ? 'right' : 'left', baseline: 'top' });
      });
      cx += widths[ci];
    });
    // bordes laterales e inferiores suaves
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2);
    let bx = left;
    for (let ci = 0; ci < cols; ci++) { doc.rect(bx, y, widths[ci], hh); bx += widths[ci]; }
    y += hh;
  };

  const footer = () => {
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor.apply(doc, MUTED);
    const pageCount = doc.internal.getNumberOfPages();
    const cur = doc.internal.getCurrentPageInfo().pageNumber;
    doc.text('Generado por ' + (comp.name || 'POSsystem Evolution') + ' · ' + veStamp(), left, pageH - 6);
    doc.text('Página ' + cur + ' de ' + pageCount, right, pageH - 6, { align: 'right' });
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3);
    doc.line(left, pageH - 9, right, pageH - 9);
  };
  const newPage = () => {
    doc.addPage();
    doc.setFillColor.apply(doc, ACCENT); doc.rect(0, 0, pageW, 5, 'F');
    doc.setFillColor(200, 230, 201); doc.rect(0, 5, pageW, 0.8, 'F');
    y = PAD;
    // Repetir cabecera de la tabla en las páginas siguientes
    drawRow(opts.columns, headH, true, HDR_COLOR, HDR_TXT, align.map(() => 'center'), headFont);
  };

  // Cabecera de la tabla
  drawRow(opts.columns, headH, true, HDR_COLOR, HDR_TXT, align.map(() => 'center'), headFont);
  // Datos
  (opts.rows || []).forEach((r, i) => {
    drawRow(r, rowH, false, i % 2 ? ZEBRA : [255, 255, 255], [30, 41, 59], align, cellFont);
  });
  // Totales (fila resumen)
  if (opts.totals) {
    drawRow(opts.totals, rowH + 1, true, [236, 253, 245], ACCENT, align, 9);
  }
  // Nota / pie
  if (opts.note) {
    if (y + 8 > pageH - 12) { footer(); newPage(); }
    doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor.apply(doc, MUTED);
    doc.text(doc.splitTextToSize(opts.note, usableW), left, y + 2);
  }
  footer();
  doc.save(opts.fileName || 'reporte.pdf');
  return doc;
}

/* Muestra un toast breve indicando que el PDF se está generando/descargando. */
function toastPdf() { try { toast('Generando PDF…', 'info', 1200); } catch (e) {} }
