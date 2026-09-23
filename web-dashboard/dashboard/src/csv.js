// CSV building for exports. Pure (no DOM), checked by csv.check.js:
//     node src/csv.check.js

// Spreadsheet apps run cells that start with = + - @ as formulas, so a note
// like "=HYPERLINK(...)" is prefixed with ' to stay plain text.
export function csvCell(value, sep = ',') {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(sep)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// rows: array of arrays. The BOM makes Excel read the file as UTF-8, and
// `sep` should be ';' where the locale uses a decimal comma (e.g. German).
export function toCsv(rows, sep = ',') {
  return '﻿' + rows.map(r => r.map(c => csvCell(c, sep)).join(sep)).join('\r\n');
}

export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
