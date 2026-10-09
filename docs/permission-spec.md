# RBMI Library Management System — Permissions & Roles Specification

This document provides the definitive authorization specification for the RBMI Library Management System, derived from Section 4.1 (`FR-AU-01` to `FR-AU-04`), Section 7.2 (`NFR-S-01`, `NFR-S-05`), and Section 10.3 of the SRS.

---

## 1. Security Architecture Principles

1. **Mandatory Server-Side Enforcement (`NFR-S-01`):** Every protected URL, route handler, and state mutation must perform server-side authorization. Never rely solely on client-side or UI hiding.
2. **Explicit HTTP 403 Response (`FR-AU-02`, `T-03`, `T-15`):** Requests lacking the necessary permission must immediately fail with an HTTP 403 Forbidden status code and display a clear access-denied message.
3. **Session Boundary Separation (`NFR-S-05`):** Staff sessions and OPAC patron sessions are entirely distinct session entities in the database and cookie store. A patron session cannot access any staff endpoint.
4. **Audit Logging of Failures:** Every unauthorized attempt to access a protected operation is recorded in `audit_logs` with `actor_name`, `action = 'PERMISSION_DENIED'`, attempted URL/operation, and `ip_address`.

---

## 2. Catalog of All 21 Permissions

| Permission Code | Name | Functional Scope & Protected Operations |
| :--- | :--- | :--- |
| `DASHBOARD_VIEW` | Dashboard View | View staff landing dashboard, statistics counters, overdue alerts, and triggers hold expiry housekeeping (`FR-DB-01` to `03`). |
| `PATRON_VIEW` | Patron View | Search and view patron profiles, borrowing history, active loans, and outstanding fines (`FR-PA-04`, `FR-PA-05`, `NFR-L-01`). |
| `CATALOG_VIEW` | Catalogue View | Search bibliographic titles, inspect copy accession details, shelf locations, and availability (`FR-CA-04`, `FR-CA-05`). |
| `CIRC_ISSUE` | Circulation Issue | Perform book checkout transactions at the circulation desk (`FR-CI-01`, `FR-CI-02`, `UC-01`). |
| `CIRC_RETURN` | Circulation Return | Process book return check-in, calculate overdue fines, and trigger hold fulfillment (`FR-CI-03`, `UC-02`). |
| `CIRC_RENEW` | Circulation Renew | Extend due date for active eligible loans (`FR-CI-04`, `UC-03`). |
| `HOLD_MANAGE` | Hold Management | View title reservation queues, reorder, or cancel staff-managed holds (`FR-HO-01` to `04`). |
| `FINE_COLLECT` | Fine Collection | Receive fine payments (cash, UPI, card), issue payment receipts (`FR-FI-01` to `03`, `UC-08`). |
| `REPORT_VIEW` | Reports View | Access, view, print, and download all 13 operational and statutory reports as CSV (`FR-RP-01` to `03`, `NFR-L-01`). |
| `PATRON_MANAGE` | Patron Management | Register, edit, block, unblock, and update patron details and expiry dates (`FR-PA-01`, `FR-PA-06`). |
| `PATRON_IMPORT` | Patron Bulk Import | Upload and commit bulk student and faculty CSV rosters (`FR-PI-01` to `06`, `UC-05`). |
| `CATALOG_MANAGE` | Catalogue Management | Create, edit bibliographic records and add/modify copies and statuses (`FR-CA-01` to `03`, `FR-CA-06`, `FR-CA-08`). |
| `CATALOG_IMPORT` | Catalogue Bulk Import| Upload and commit bulk book CSV files (`FR-BI-01` to `05`, `UC-06`). |
| `CIRC_LOST` | Circulation Mark Lost | Declare an active checkout as lost, set copy to `LOST`, and levy lost charge (`FR-CI-05`, `UC-04`). |
| `FINE_WAIVE` | Fine Waiver | Authorize write-off of outstanding fine balances and issue waiver receipts (`FR-FI-04`, `UC-08`, `T-15`). |
| `NODUES_ISSUE` | No-Dues Clearance | Issue no-dues clearance certificate and mark patron graduated (`FR-ND-01`, `FR-ND-02`, `UC-09`). |
| `ADMIN_RULES` | Admin Rules | List, create, modify, and delete circulation policy rules (`FR-AD-01`, `UC-10`, `T-24`). |
| `ADMIN_SETTINGS` | Admin Settings | Modify system-wide configuration keys in `system_settings` (`FR-AD-02`, `T-23`). |
| `ADMIN_MASTERS` | Admin Master Data | Manage institutions, libraries, departments, courses, categories, item types, vendors (`FR-ST-03`). |
| `AUDIT_VIEW` | Audit Trail View | Browse and filter append-only audit trail logs (`FR-AD-04`, `T-26`). |
| `ADMIN_USERS` | Admin Staff Accounts | Create, edit, activate/deactivate staff user accounts and reset staff passwords (`FR-AU-04`, `UC-11`). |

---

## 3. Seeded Roles & Complete Permission Matrix (SRS Section 10.3)

The system seeds exactly 4 roles with immutable permission assignments:

| Permission Code | Super Administrator | Library Administrator | Librarian | Assistant Librarian |
| :--- | :---: | :---: | :---: | :---: |
| `DASHBOARD_VIEW` | **YES** | **YES** | **YES** | **YES** |
| `PATRON_VIEW` | **YES** | **YES** | **YES** | **YES** |
| `CATALOG_VIEW` | **YES** | **YES** | **YES** | **YES** |
| `CIRC_ISSUE` | **YES** | **YES** | **YES** | **YES** |
| `CIRC_RETURN` | **YES** | **YES** | **YES** | **YES** |
| `CIRC_RENEW` | **YES** | **YES** | **YES** | **YES** |
| `HOLD_MANAGE` | **YES** | **YES** | **YES** | **YES** |
| `FINE_COLLECT` | **YES** | **YES** | **YES** | **YES** |
| `REPORT_VIEW` | **YES** | **YES** | **YES** | **YES** |
| `PATRON_MANAGE` | **YES** | **YES** | **YES** | NO |
| `PATRON_IMPORT` | **YES** | **YES** | **YES** | NO |
| `CATALOG_MANAGE` | **YES** | **YES** | **YES** | NO |
| `CATALOG_IMPORT` | **YES** | **YES** | **YES** | NO |
| `CIRC_LOST` | **YES** | **YES** | **YES** | NO |
| `FINE_WAIVE` | **YES** | **YES** | **YES** | NO |
| `NODUES_ISSUE` | **YES** | **YES** | **YES** | NO |
| `ADMIN_RULES` | **YES** | **YES** | NO | NO |
| `ADMIN_SETTINGS` | **YES** | **YES** | NO | NO |
| `ADMIN_MASTERS` | **YES** | **YES** | NO | NO |
| `AUDIT_VIEW` | **YES** | **YES** | NO | NO |
| `ADMIN_USERS` | **YES** | NO | NO | NO |
| **Total Permissions** | **21 / 21** | **20 / 21** | **16 / 21** | **9 / 21** |

---

## 4. Default Seed Staff Accounts (Section 10.4)

| Username | Default Password | Role | Assigned Home Library | Permissions Count |
| :--- | :--- | :--- | :--- | :---: |
| `admin` | `Admin@123` | `SUPER_ADMIN` | `CL` (Central Library) | 21 |
| `librarian` | `Lib@123` | `LIBRARIAN` | `CL` (Central Library) | 16 |
| `assistant` | `Asst@123` | `ASSISTANT_LIBRARIAN`| `CL` (Central Library) | 9 |

*Note: In production and seed deployment, passwords are stored solely as Argon2id hashes (`DR-09`).*

---

## 5. UI Permission Rendering Rules (`UI-2`, `FR-AU-02`)

1. **Menu Visibility:**
   - The navigation sidebar dynamically queries the authenticated user's permissions.
   - If a user lacks `ADMIN_RULES`, `ADMIN_SETTINGS`, `ADMIN_MASTERS`, and `AUDIT_VIEW`, the entire **Administration** menu group is omitted from the UI (tested in `T-03`).
   - If a user lacks `ADMIN_USERS`, the **Staff Accounts** menu item is hidden.
2. **Action Buttons:**
   - `Waive Fine` button appears only if user holds `FINE_WAIVE`.
   - `Mark Lost` button appears only if user holds `CIRC_LOST`.
   - `No-Dues Certificate` button appears only if user holds `NODUES_ISSUE`.
   - `Bulk Import` tabs appear only if user holds `PATRON_IMPORT` or `CATALOG_IMPORT`.
3. **Defense in Depth:** Hiding UI elements is strictly cosmetic. Every corresponding POST route handler executes `await requirePermission(permission)` before parsing form data or invoking service operations.
