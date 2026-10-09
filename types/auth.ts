/**
 * RBMI Library Management System — RBAC Types, Roles, and Permission Matrix
 * Derived from SRS Section 4.1 (FR-AU-01..04), Section 7.2 (NFR-S-01), and Section 10.3.
 */

export const ALL_PERMISSIONS = [
  // Desk and Viewing Operations (Available to all 4 roles)
  "DASHBOARD_VIEW",
  "PATRON_VIEW",
  "CATALOG_VIEW",
  "CIRC_ISSUE",
  "CIRC_RETURN",
  "CIRC_RENEW",
  "HOLD_MANAGE",
  "FINE_COLLECT",
  "REPORT_VIEW",

  // Librarian Operations (Librarian, Library Admin, Super Admin)
  "PATRON_MANAGE",
  "PATRON_IMPORT",
  "CATALOG_MANAGE",
  "CATALOG_IMPORT",
  "CIRC_LOST",
  "FINE_WAIVE",
  "NODUES_ISSUE",

  // Administration Operations (Library Admin, Super Admin)
  "ADMIN_RULES",
  "ADMIN_SETTINGS",
  "ADMIN_MASTERS",
  "AUDIT_VIEW",

  // Super Administrator Only
  "ADMIN_USERS",
] as const;

export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

export const ALL_ROLES = [
  "SUPER_ADMIN",
  "LIBRARY_ADMIN",
  "LIBRARIAN",
  "ASSISTANT_LIBRARIAN",
] as const;

export type RoleCode = (typeof ALL_ROLES)[number];

/**
 * Complete immutable Role-Permission Matrix specified by SRS Section 10.3.
 */
export const ROLE_PERMISSIONS_MATRIX: Record<RoleCode, readonly PermissionCode[]> = {
  SUPER_ADMIN: [
    "DASHBOARD_VIEW",
    "PATRON_VIEW",
    "CATALOG_VIEW",
    "CIRC_ISSUE",
    "CIRC_RETURN",
    "CIRC_RENEW",
    "HOLD_MANAGE",
    "FINE_COLLECT",
    "REPORT_VIEW",
    "PATRON_MANAGE",
    "PATRON_IMPORT",
    "CATALOG_MANAGE",
    "CATALOG_IMPORT",
    "CIRC_LOST",
    "FINE_WAIVE",
    "NODUES_ISSUE",
    "ADMIN_RULES",
    "ADMIN_SETTINGS",
    "ADMIN_MASTERS",
    "AUDIT_VIEW",
    "ADMIN_USERS",
  ],
  LIBRARY_ADMIN: [
    "DASHBOARD_VIEW",
    "PATRON_VIEW",
    "CATALOG_VIEW",
    "CIRC_ISSUE",
    "CIRC_RETURN",
    "CIRC_RENEW",
    "HOLD_MANAGE",
    "FINE_COLLECT",
    "REPORT_VIEW",
    "PATRON_MANAGE",
    "PATRON_IMPORT",
    "CATALOG_MANAGE",
    "CATALOG_IMPORT",
    "CIRC_LOST",
    "FINE_WAIVE",
    "NODUES_ISSUE",
    "ADMIN_RULES",
    "ADMIN_SETTINGS",
    "ADMIN_MASTERS",
    "AUDIT_VIEW",
  ],
  LIBRARIAN: [
    "DASHBOARD_VIEW",
    "PATRON_VIEW",
    "CATALOG_VIEW",
    "CIRC_ISSUE",
    "CIRC_RETURN",
    "CIRC_RENEW",
    "HOLD_MANAGE",
    "FINE_COLLECT",
    "REPORT_VIEW",
    "PATRON_MANAGE",
    "PATRON_IMPORT",
    "CATALOG_MANAGE",
    "CATALOG_IMPORT",
    "CIRC_LOST",
    "FINE_WAIVE",
    "NODUES_ISSUE",
  ],
  ASSISTANT_LIBRARIAN: [
    "DASHBOARD_VIEW",
    "PATRON_VIEW",
    "CATALOG_VIEW",
    "CIRC_ISSUE",
    "CIRC_RETURN",
    "CIRC_RENEW",
    "HOLD_MANAGE",
    "FINE_COLLECT",
    "REPORT_VIEW",
  ],
} as const;

/**
 * Type guard to check if a string is a valid PermissionCode.
 */
export function isPermissionCode(val: string): val is PermissionCode {
  return (ALL_PERMISSIONS as readonly string[]).includes(val);
}

/**
 * Type guard to check if a string is a valid RoleCode.
 */
export function isRoleCode(val: string): val is RoleCode {
  return (ALL_ROLES as readonly string[]).includes(val);
}

/**
 * Checks whether a given permission list satisfies a required permission.
 */
export function hasPermission(
  userPermissions: readonly string[],
  permission: PermissionCode,
): boolean {
  return userPermissions.includes(permission);
}
