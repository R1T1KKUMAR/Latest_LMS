/**
 * Department Barcode Prefix Mappings & Transfer Utilities
 *
 * Each college department in the RBMI Central Library uses a dedicated barcode prefix convention:
 * - BTECH:      DENGGD-
 * - DIPLOMA:    DENGGDDP-
 * - BCA:        C-
 * - MBA:        M-
 * - BBA:        AM-
 * - BCOM:       BC- (or B.C- )
 * - BSC:        BSCS-
 * - BED:        BEDE-
 * - BPHARM:     BPH-
 * - DPHARM:     DPH-
 * - BSCNURS:    NURS-
 * - MCA:        MCA-
 */

export const DEPARTMENT_BARCODE_PREFIXES: Record<string, string> = {
  BTECH: "DENGGD-",
  DIPLOMA: "DENGGDDP-",
  BCA: "C-",
  MBA: "M-",
  BBA: "AM-",
  BCOM: "BC-",
  BSC: "BSCS-",
  BED: "BEDE-",
  BPHARM: "BPH-",
  DPHARM: "DPH-",
  BSCNURS: "NURS-",
  MCA: "MCA-",
};

/**
 * Returns standard barcode prefix for a department code.
 */
export function getDepartmentBarcodePrefix(deptCode: string): string {
  const norm = (deptCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (DEPARTMENT_BARCODE_PREFIXES[norm]) {
    return DEPARTMENT_BARCODE_PREFIXES[norm];
  }
  // Fallback prefix from department code
  return `${norm.slice(0, 6)}-`;
}

/**
 * Extracts the numeric sequence suffix from a barcode.
 * E.g. "DENGGD-0145" -> { prefix: "DENGGD-", num: 145, padLength: 4, rawNum: "0145" }
 * E.g. "C-01" -> { prefix: "C-", num: 1, padLength: 2, rawNum: "01" }
 */
export function parseBarcodeParts(barcode: string): {
  prefix: string;
  num: number | null;
  padLength: number;
  rawNum: string;
} {
  if (!barcode) {
    return { prefix: "", num: null, padLength: 2, rawNum: "" };
  }

  const match = barcode.trim().match(/^([A-Za-z\.\-\s]+?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const rawNum = match[2];
    const num = parseInt(rawNum, 10);
    return {
      prefix,
      num: isNaN(num) ? null : num,
      padLength: rawNum.length,
      rawNum,
    };
  }

  return {
    prefix: barcode.replace(/\d+$/, ""),
    num: null,
    padLength: 2,
    rawNum: "",
  };
}

/**
 * Generates a new barcode when transferring a book to a target department.
 * Preserves the numeric sequence if collision-free, or allocates the next available sequence.
 */
export function generateDepartmentBarcode(
  currentBarcode: string,
  targetDeptCode: string,
  existingBarcodes: Set<string> = new Set(),
): string {
  const targetPrefix = getDepartmentBarcodePrefix(targetDeptCode);
  const parsed = parseBarcodeParts(currentBarcode);

  // If the barcode has a numeric sequence, attempt to reuse it under the new prefix
  if (parsed.num !== null) {
    const padded = parsed.num.toString().padStart(Math.max(2, parsed.padLength), "0");
    const candidate = `${targetPrefix}${padded}`;
    if (!existingBarcodes.has(candidate.toUpperCase())) {
      return candidate;
    }
  }

  // If collision or non-numeric, find the next highest number for this target prefix
  let maxNum = 0;
  for (const bar of existingBarcodes) {
    if (bar.toUpperCase().startsWith(targetPrefix.toUpperCase())) {
      const p = parseBarcodeParts(bar);
      if (p.num !== null && p.num > maxNum) {
        maxNum = p.num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padLen = Math.max(2, parsed.padLength);
  let candidate = `${targetPrefix}${nextNum.toString().padStart(padLen, "0")}`;

  // Ensure collision-free
  while (existingBarcodes.has(candidate.toUpperCase())) {
    maxNum++;
    candidate = `${targetPrefix}${(maxNum + 1).toString().padStart(padLen, "0")}`;
  }

  return candidate;
}
