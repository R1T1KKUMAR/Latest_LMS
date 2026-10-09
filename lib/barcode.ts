/**
 * Pure TypeScript Code 128 Barcode Generator.
 * Produces standards-compliant SVG Code 128 (Subset B) barcodes with zero external dependencies.
 * Satisfies FR-PR-01, FR-CA-07, FR-PA-07, C-2, NFR-C-02.
 */

// Code 128 Patterns (107 symbols). Each string represents the widths of 3 bars and 3 spaces (or 4 bars for Stop).
const CODE128_PATTERNS: string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213", // 0-9
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132", // 10-19
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211", // 20-29
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313", // 30-39
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331", // 40-49
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111", // 50-59
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214", // 60-69
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111", // 70-79
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141", // 80-89
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141", // 90-99
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112", // 100-106 (106 is STOP)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeSvgOptions {
  height?: number;
  barWidth?: number;
  quietZone?: boolean;
  includeText?: boolean;
  fontSize?: number;
  className?: string;
}

/**
 * Generates an SVG string representation of a Code 128 barcode for the given text.
 */
export function generateCode128Svg(text: string, options: BarcodeSvgOptions = {}): string {
  const height = options.height ?? 50;
  const barWidth = options.barWidth ?? 2;
  const includeText = options.includeText ?? true;
  const fontSize = options.fontSize ?? 12;
  const textPadding = includeText ? fontSize + 4 : 0;
  const totalHeight = height + textPadding;

  const characters = text.trim();
  if (!characters) {
    throw new Error("Cannot generate barcode for empty text");
  }

  // Encode using Code 128 Subset B (ASCII 32 to 127)
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < characters.length; i++) {
    const charCode = characters.charCodeAt(i);
    if (charCode < 32 || charCode > 127) {
      throw new Error(
        `Character '${characters[i]}' (code ${charCode}) is outside Code 128 Subset B range`,
      );
    }
    const val = charCode - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  // Convert codes to widths
  const widths: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let j = 0; j < pattern.length; j++) {
      widths.push(Number.parseInt(pattern[j], 10));
    }
  }

  // Calculate total units
  const quietZoneUnits = options.quietZone !== false ? 10 : 0;
  let totalUnits = quietZoneUnits * 2;
  for (const w of widths) {
    totalUnits += w;
  }

  const totalPixelWidth = totalUnits * barWidth;

  // Build SVG rects
  let currentUnit = quietZoneUnits;
  let rects = "";

  for (let idx = 0; idx < widths.length; idx++) {
    const w = widths[idx];
    const isBar = idx % 2 === 0;
    if (isBar) {
      const x = currentUnit * barWidth;
      const widthPx = w * barWidth;
      rects += `<rect x="${x}" y="0" width="${widthPx}" height="${height}" fill="black" />`;
    }
    currentUnit += w;
  }

  let textElement = "";
  if (includeText) {
    const textX = totalPixelWidth / 2;
    const textY = height + fontSize;
    textElement = `<text x="${textX}" y="${textY}" text-anchor="middle" font-family="monospace, monospace" font-size="${fontSize}" fill="#1e293b" font-weight="600">${escapeXml(characters)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalPixelWidth} ${totalHeight}" width="${totalPixelWidth}" height="${totalHeight}" class="${options.className ?? "barcode-svg"}">${rects}${textElement}</svg>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
