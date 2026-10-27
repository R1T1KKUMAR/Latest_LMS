/**
 * downloadTemplate.ts
 *
 * Zero-dependency browser utility that builds a minimal but valid .xlsx
 * workbook (Open XML / OOXML) and triggers a file download.
 *
 * Supports two rows: a header row and one example/sample row.
 * Cells are plain text (shared strings are inlined for simplicity).
 */

/** Escape XML special characters inside cell text */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Convert a 0-based column index to an Excel column letter (A, B, … Z, AA, …) */
function colLetter(index: number): string {
  let col = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

/** Build the worksheet XML for the given rows */
function buildSheetXml(rows: string[][]): string {
  const maxCols = Math.max(...rows.map((r) => r.length));
  let sheetData = "";
  rows.forEach((row, ri) => {
    const rowIndex = ri + 1;
    let cells = "";
    for (let ci = 0; ci < maxCols; ci++) {
      const cellRef = `${colLetter(ci)}${rowIndex}`;
      const value = escapeXml(row[ci] ?? "");
      // Use inline string type (t="inlineStr") — no shared strings table needed
      cells += `<c r="${cellRef}" t="inlineStr"><is><t>${value}</t></is></c>`;
    }
    // Style index 1 for header row (bold), 0 for rest
    const styleAttr = ri === 0 ? ' s="1"' : "";
    sheetData += `<row r="${rowIndex}"${styleAttr}>${cells}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

/** Minimal styles XML with one bold font style for the header row */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Template" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

// ---------------------------------------------------------------------------
// Tiny ZIP builder (store-only, no compression — valid for small XLSX files)
// ---------------------------------------------------------------------------

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint32LE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function uint16LE(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  // Precomputed CRC32 table
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralDirs: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = toBytes(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    const lh = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
      uint16LE(20), // version needed
      uint16LE(0), // general purpose bit flag
      uint16LE(0), // compression method (store)
      uint16LE(0), // last mod time
      uint16LE(0), // last mod date
      uint32LE(crc),
      uint32LE(size),
      uint32LE(size),
      uint16LE(nameBytes.length),
      uint16LE(0), // extra field length
      nameBytes,
      data,
    );
    localHeaders.push(lh);

    // Central directory entry
    const cd = concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
      uint16LE(20), // version made by
      uint16LE(20), // version needed
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint32LE(crc),
      uint32LE(size),
      uint32LE(size),
      uint16LE(nameBytes.length),
      uint16LE(0), // extra
      uint16LE(0), // comment
      uint16LE(0), // disk start
      uint16LE(0), // internal attr
      uint32LE(0), // external attr
      uint32LE(offset),
      nameBytes,
    );
    centralDirs.push(cd);
    offset += lh.length;
  }

  const centralDir = concat(...centralDirs);
  const cdSize = centralDir.length;
  const cdOffset = offset;
  const count = entries.length;

  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]), // end of central dir signature
    uint16LE(0), // disk number
    uint16LE(0), // disk with cd
    uint16LE(count),
    uint16LE(count),
    uint32LE(cdSize),
    uint32LE(cdOffset),
    uint16LE(0), // comment length
  );

  return concat(...localHeaders, centralDir, eocd);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TemplateSpec {
  /** Headers row (column names) */
  headers: string[];
  /** One sample data row */
  sample: string[];
  /** File name without extension */
  fileName: string;
}

/**
 * Generates a .xlsx file with a bold header row + sample row and
 * triggers a browser download.
 */
export function downloadXlsxTemplate(spec: TemplateSpec): void {
  const sheetXml = buildSheetXml([spec.headers, spec.sample]);

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: toBytes(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: toBytes(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: toBytes(WORKBOOK_XML) },
    { name: "xl/_rels/workbook.xml.rels", data: toBytes(WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: toBytes(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: toBytes(sheetXml) },
  ];

  const zipBytes = buildZip(entries);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${spec.fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
