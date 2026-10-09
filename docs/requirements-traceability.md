# RBMI Library Management System — Requirements Traceability Matrix

This document provides end-to-end traceability between every requirement in the SRS (`SRS_RBMI_Library_Management_System.pdf`, v1.0), the approved technical stack, the implementation architecture, and the automated verification suite.

As mandated by `CLAUDE.md`, every requirement preserves its exact requirement ID and tracks its implementation location, test location, and completion status.

---

## 1. Summary of Requirements & Traceability Counts

| Requirement Type | Identifier Prefix / Scope | Count | Status |
| :--- | :--- | :---: | :--- |
| **Functional Requirements** | `FR-*` (Section 4) | **73** | Planned |
| **Business Rules** | `BR-*` (Section 5) | **9** | Planned |
| **Non-Functional Requirements** | `NFR-*` (Section 7) | **33** | Planned |
| **Use Cases** | `UC-*` (Section 8) | **12** | Planned |
| **Acceptance Tests** | `T-*` (Section 9) | **28** | Planned |
| **Data Requirements & Integrity** | `DR-*` (Section 6) | **9** | Planned |
| **Constraints** | `C-*` (Section 2.5) | **6** | Planned |
| **User Interfaces** | `UI-*` (Section 3.2) | **7** | Implemented (Phase 5) |
| **Hardware Interfaces** | `HW-*` (Section 3.3) | **2** | Planned |
| **Communication Interfaces** | `CI-*` (Section 3.5) | **3** | Implemented |
| **Database Tables** | Section 6.1 (22 Domain + 1 Session) | **23** | Implemented |
| **SQL Views** | Section 6.1 | **6** | Implemented |
| **Sequences** | Section 6.1 | **2** | Implemented |
| **Permissions** | Section 10.3 | **21** | Implemented |
| **Seeded Roles** | Section 10.3 | **4** | Implemented |
| **CSV Formats** | Section 10.1 (Books, Students, Faculty) | **3** | Planned |
| **Total Traceable Requirements** | FR + BR + NFR + UC + T + DR + C + UI + HW + CI | **182** | In Progress |

---

## 2. Functional Requirements (`FR-*`) — 73 Requirements

### 2.1 Authentication & Authorisation (`FR-AU`) — 8 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-AU-01` | Staff sign in with username and password; failed attempt shows one generic message and records attempted username in audit log. | `services/auth.ts`, `app/api/auth/staff/login/route.ts` | `tests/integration/auth.test.ts`, `tests/integration/auth-routes.test.ts` | Implemented |
| `FR-AU-02` | Every staff user has exactly one role; menu entries and actions shown only when permitted; unpermitted requests refused server-side (HTTP 403). | `lib/auth.ts` (`requirePermission`), `app/api/auth/test-permission/route.ts` | `tests/integration/auth.test.ts`, `tests/integration/auth-routes.test.ts` | Implemented |
| `FR-AU-03` | Four roles seeded: Super Administrator (all), Library Administrator (all but staff accounts), Librarian (all operations, no admin), Assistant Librarian (desk operations, view-only). | `db/seed.ts`, `db/schema/security.ts` | `tests/integration/db-schema.test.ts`, `tests/integration/auth.test.ts` | Implemented |
| `FR-AU-04` | Super Administrator creates, edits, deactivates, and sets password of any staff account; staff users are never deleted. | `app/(staff)/admin/users/`, `services/user.ts`, `app/api/admin/users/` | `tests/integration/rbac.test.ts`, `tests/integration/rbac-routes.test.ts` | Implemented |
| `FR-AU-05` | Patrons sign in to OPAC with card number (or roll number / employee id / username) and password; first login forces password change; initial password equals card number. | `services/auth.ts`, `app/api/auth/patron/login/route.ts` | `tests/integration/auth.test.ts`, `tests/integration/auth-routes.test.ts` (`T-20`) | Implemented |
| `FR-AU-06` | Sessions expire after 60 minutes of inactivity; session ID renewed at login. | `services/session.ts`, `lib/auth.ts` | `tests/integration/auth.test.ts` | Implemented |
| `FR-AU-07` | Every state-changing request (POST) carries a per-session CSRF token and is refused (HTTP 403) without it. | `lib/csrf.ts`, `app/api/auth/` routes | `tests/integration/auth.test.ts`, `tests/integration/auth-routes.test.ts` (`T-04`) | Implemented |
| `FR-AU-08` | Passwords stored only as salted Argon2id hashes (superseding PBKDF2 per approved stack); no function exposes plaintext passwords. | `lib/crypto.ts` | `tests/unit/crypto.test.ts` | Implemented |

### 2.2 Dashboard (`FR-DB`) — 3 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-DB-01` | Landing page after staff login shows counts of titles, copies, active students/faculty, loans out, overdue loans, fines collected this month. | `app/(staff)/dashboard/`, `services/dashboard.ts` | `tests/e2e/dashboard.spec.ts` | Planned |
| `FR-DB-02` | Dashboard lists ten most overdue loans with patron mobile numbers and return shortcut, and loans due today. | `app/(staff)/dashboard/overdue-list.tsx` | `tests/e2e/dashboard.spec.ts` | Planned |
| `FR-DB-03` | Opening dashboard runs housekeeping: reservations past pickup deadline set EXPIRED and copies reassigned. | `services/holds.ts` (`expireUncollectedHolds`) | `tests/integration/holds.test.ts` | Planned |

### 2.3 Patron Management (`FR-PA`) — 8 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-PA-01` | Staff registers patron with type (STUDENT/FACULTY/STAFF/GUEST), category, institution, course/department, dates, contacts. | `app/(staff)/patrons/`, `services/patron.ts` | `tests/integration/patron.test.ts` | Implemented |
| `FR-PA-02` | Card number defaults to roll number (students) or employee id (others), else CARD_PREFIX + 6 digits from sequence; unique. | `services/patron.ts`, `lib/numbering.ts` | `tests/integration/patron.test.ts` | Implemented |
| `FR-PA-03` | Card expiry defaults to course end date, else admission date (or today) plus category card validity years. | `services/patron.ts`, `lib/numbering.ts` | `tests/unit/patron-validation.test.ts`, `tests/integration/patron.test.ts` | Implemented |
| `FR-PA-04` | Staff searches patrons by name, card, roll, employee id, mobile, email, and filters by category, status, library. | `app/(staff)/patrons/`, `services/patron.ts` | `tests/integration/patron.test.ts`, `tests/integration/catalogue-patron-routes.test.ts` | Implemented |
| `FR-PA-05` | Patron page shows profile, current loans (overdue highlighted), outstanding fines, loan history, hold queue. | `app/(staff)/patrons/`, `services/patron.ts` | `tests/integration/patron.test.ts` | Implemented |
| `FR-PA-06` | Staff with Patron manage edits fields, sets status (ACTIVE, BLOCKED, EXPIRED, GRADUATED, LEFT), extends expiry, resets OPAC password. | `app/(staff)/patrons/`, `services/patron.ts` | `tests/integration/patron.test.ts`, `tests/integration/catalogue-patron-routes.test.ts` | Implemented |
| `FR-PA-07` | System prints ISO ID-1 library card (86x54 mm) with name, category, department, id, validity, barcode. | `app/(staff)/patrons/PatronsClient.tsx`, `lib/barcode.ts` | `tests/unit/barcode.test.ts` | Implemented |
| `FR-PA-08` | Patrons never deleted; status changes retain all history. | `services/patron.ts`, PostgreSQL FK constraints | `tests/integration/patron.test.ts` | Implemented |

### 2.4 Bulk Import of Students & Faculty (`FR-PI`) — 6 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-PI-01` | Staff uploads CSV of students or faculty and chooses default category, institution, course. | `app/(staff)/imports/patrons/` | `tests/e2e/import-patrons.spec.ts` | Planned |
| `FR-PI-02` | Validates every row before writing; displays preview with per-row status (OK, WARN, ERROR), messages, counts. | `imports/patron-validator.ts` | `tests/unit/import-patrons.test.ts` | Planned |
| `FR-PI-03` | Errors (row skipped): missing roll/employee id/first name, unknown category, duplicate roll/employee id in DB or file. | `imports/patron-validator.ts` | `tests/integration/import-students.test.ts` (`T-19`) | Planned |
| `FR-PI-04` | On confirmation, valid rows inserted one transaction each; password defaults to card number (must change). | `services/patron-import.ts` | `tests/integration/import-students.test.ts` (`T-19`) | Planned |
| `FR-PI-05` | Each import recorded in import_batches (type, filename, totals, user, time); re-import creates no duplicates. | `repositories/import-batch.ts`, `services/patron-import.ts` | `tests/integration/import-students.test.ts` (`T-19`) | Planned |
| `FR-PI-06` | Templates and sample CSV files downloadable from import page. | `app/(staff)/imports/templates/` | `tests/e2e/import-patrons.spec.ts` | Planned |

### 2.5 Catalogue (`FR-CA`) — 8 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-CA-01` | Staff creates and edits titles with ISBN (normalised), title, subtitle, authors, editors, edition, publisher, year, ddc, classification, price. | `app/(staff)/catalogue/`, `services/catalogue.ts` | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-02` | Staff adds 1–200 copies to a title in one action, choosing library; each copy receives unique accession number and barcode. | `services/catalogue.ts`, `lib/validations/catalogue.ts` | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-03` | Copies carry library, location, price, vendor, invoice number, acquisition date, status, condition note. | `db/schema/catalogue.ts`, `services/catalogue.ts` | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-04` | Search matches title, subtitle, authors, subject, keywords, publisher, call number, accession, barcode, ISBN. | `services/catalogue.ts` (`listBibRecords`) | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-05` | Title page shows copy counts (total, available, waiting holds), copy table with shelf location, status, loan history. | `app/(staff)/catalogue/`, `services/catalogue.ts` | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-06` | Copies of reference item types created with status REFERENCE_ONLY. | `services/catalogue.ts` (`addCopiesToTitle`) | `tests/integration/catalogue.test.ts` | Implemented |
| `FR-CA-07` | Staff prints barcode labels for accession range or title copies: library name, call number, accession, barcode SVG. | `app/(staff)/catalogue/CatalogueClient.tsx`, `lib/barcode.ts` | `tests/unit/barcode.test.ts` | Implemented |
| `FR-CA-08` | Titles and copies never deleted; WITHDRAWN copies stay in accession register. | `services/catalogue.ts` | `tests/integration/catalogue.test.ts` | Implemented |

### 2.6 Bulk Import of Books (`FR-BI`) — 5 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-BI-01` | Staff uploads CSV where one row is one title plus number of copies, choosing default library. | `app/(staff)/imports/books/` | `tests/e2e/import-books.spec.ts` | Planned |
| `FR-BI-02` | Validation and preview per FR-PI-02. Errors: missing title, unknown item type/library, duplicate accession in DB/file. | `imports/book-validator.ts` | `tests/integration/import-books.test.ts` (`T-18`) | Planned |
| `FR-BI-03` | Row whose ISBN (or title + authors) exists adds copies to existing title; preview indicates new title vs added copies. | `imports/book-validator.ts`, `services/book-import.ts` | `tests/integration/import-books.test.ts` (`T-18`) | Planned |
| `FR-BI-04` | Supplied accession numbers and barcodes accepted as pipe-delimited list; missing ones generated automatically. | `services/book-import.ts` | `tests/integration/import-books.test.ts` (`T-18`) | Planned |
| `FR-BI-05` | Each row committed in own transaction; result page lists title id, copies added, accession range, link to labels. | `services/book-import.ts` | `tests/integration/import-books.test.ts` (`T-18`) | Planned |

### 2.7 Circulation (`FR-CI`) — 7 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-CI-01` | Desk loads patron by scanning/typing card, roll, employee id, username; displays profile, loans, overdues, fines, holds. | `app/(staff)/circulation/`, `app/api/circulation/patron-lookup/`, `services/circulation.ts` | `tests/integration/circulation.test.ts`, `tests/e2e/circulation-desk.spec.ts` | Implemented |
| `FR-CI-02` | Issue runs 9 checks in order (patron active, card valid, copy available/held, rule resolved, non-zero limits, reference check, max books, overdue block, fines block); creates loan, sets copy ISSUED, fulfills hold. | `app/(staff)/circulation/issue/`, `app/api/circulation/issue/`, `services/circulation.ts` (`issueCopy`), `rules/eligibility.ts` | `tests/integration/circulation.test.ts` (`T-05` to `T-08`, `T-11`), `tests/integration/circulation-routes.test.ts` | Implemented |
| `FR-CI-03` | Return closes active loan, computes BR-06 overdue fine, assigns copy to waiting hold (RESERVED) or sets AVAILABLE/REFERENCE_ONLY. | `app/(staff)/circulation/return/`, `app/api/circulation/return/`, `services/circulation.ts` (`returnCopy`), `rules/fines.ts` | `tests/integration/circulation.test.ts` (`T-09`, `T-10`), `tests/integration/circulation-routes.test.ts` | Implemented |
| `FR-CI-04` | Renew extends due date by loan days; refused if overdue, renewals >= max, title reserved, or fines >= limit. | `app/(staff)/circulation/renew/`, `app/api/circulation/renew/`, `services/circulation.ts` (`renewLoan`), `rules/engine.ts` | `tests/integration/circulation.test.ts` (`T-12`), `tests/integration/circulation-routes.test.ts` | Implemented |
| `FR-CI-05` | Lost closes loan as LOST, copy as LOST, creates BR-07 fine (copy price + fee + overdue to date); requires CIRC_LOST. | `app/(staff)/circulation/lost/`, `app/api/circulation/mark-lost/`, `services/circulation.ts` (`markCopyLost`), `rules/fines.ts` | `tests/integration/circulation.test.ts` (`T-13`), `tests/integration/circulation-routes.test.ts` | Implemented |
| `FR-CI-06` | All circulation operations execute as single atomic database transactions with SELECT ... FOR UPDATE row locks, audited. | `services/circulation.ts` (`db.transaction`, `for("update")`, `recordAuditLog`) | `tests/integration/circulation.test.ts`, `tests/integration/circulation-routes.test.ts` | Implemented |
| `FR-CI-07` | Desk shows current loans with Return, Renew, Lost buttons, days remaining / days overdue highlighted in red. | `app/(staff)/circulation/CirculationDeskClient.tsx` | `tests/e2e/circulation-desk.spec.ts` | Implemented |

### 2.8 Reservations (`FR-HO`) — 5 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-HO-01` | Patron (OPAC) or staff places hold on title only when no copy is AVAILABLE, patron ACTIVE, no existing hold/loan for title, rule allows holds. | `services/holds.ts` (`placeHold`), `app/api/holds/route.ts` | `tests/integration/holds.test.ts` (`T-16`, `T-17`), `tests/integration/holds-routes.test.ts` | Implemented |
| `FR-HO-02` | Holds queued by request time; queue position visible to staff and patron. | `services/holds.ts` (`listHolds`), `app/(staff)/reservations/`, `app/account/` | `tests/integration/holds.test.ts` (`T-17`), `tests/integration/holds-routes.test.ts` | Implemented |
| `FR-HO-03` | On return or cancellation of pickup-ready hold, copy passes to next waiting hold or becomes AVAILABLE / REFERENCE_ONLY; completed upon issue. | `services/circulation.ts` (`returnCopy`, `issueCopy`), `services/holds.ts` (`cancelHold`) | `tests/integration/holds.test.ts` (`T-10`, `T-11`) | Implemented |
| `FR-HO-04` | Holds not collected by expiry date set EXPIRED automatically (dashboard/reservations access); copy released per FR-HO-03. | `services/holds.ts` (`processExpiredHolds`), `app/api/holds/process-expired/` | `tests/integration/holds.test.ts` (`T-11`), `tests/integration/holds-routes.test.ts` | Implemented |
| `FR-HO-05` | Active hold may be cancelled by reserving patron or staff; promotes next waiting hold or releases copy to shelf. | `services/holds.ts` (`cancelHold`), `app/api/holds/[id]/cancel/`, `app/account/AccountClient.tsx` | `tests/integration/holds.test.ts`, `tests/integration/holds-routes.test.ts` | Implemented |

### 2.9 Fines and Payments (`FR-FI`) — 5 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-FI-01` | Staff looks up patron outstanding fines (type, reason, amount, paid, balance) with total balance. | `app/(staff)/fines/`, `v_outstanding_fines`, `services/fines.ts` (`listFines`), `app/api/fines/route.ts` | `tests/integration/fines.test.ts`, `tests/integration/fines-routes.test.ts` | Implemented |
| `FR-FI-02` | Staff with Fine collect records payment of any amount between 0.01 and balance (CASH/UPI/CARD/ONLINE); updates paid amount/status. | `services/fines.ts` (`collectPayment`), `app/api/fines/pay/route.ts`, `app/(staff)/fines/FinesClient.tsx` | `tests/integration/fines.test.ts` (`T-14`), `tests/integration/fines-routes.test.ts` | Implemented |
| `FR-FI-03` | Payment or waiver receives unique receipt RECEIPT_PREFIX-YYYY-NNNNN; printable receipt with breakdown. | `services/fines.ts` (`generateReceiptNumber`, `getReceiptDetails`), `seq_receipt_no`, `app/(staff)/fines/receipt/[receiptNo]/` | `tests/integration/fines.test.ts` (`T-14`), `tests/integration/fines-routes.test.ts`, `tests/e2e/fines.spec.ts` | Implemented |
| `FR-FI-04` | Staff with Fine waive waives remaining balance; fine becomes WAIVED; waiver receipt generated. | `services/fines.ts` (`waiveFine`), `app/api/fines/waive/route.ts`, `app/(staff)/fines/FinesClient.tsx` | `tests/integration/fines.test.ts` (`T-15`), `tests/integration/fines-routes.test.ts`, `tests/e2e/fines.spec.ts` | Implemented |
| `FR-FI-05` | Fines and payments never deleted or edited after creation; database role revokes UPDATE/DELETE on payments. | `db/schema/circulation.ts`, immutable append-only ledger | `tests/integration/fines.test.ts` | Implemented |

### 2.10 No-Dues Clearance (`FR-ND`) — 2 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-ND-01` | Staff checks patron and views loans and fines pending with shortcuts to return books and collect fines. | `app/(staff)/nodues/`, `services/nodues.ts` | `tests/e2e/nodues.spec.ts` (`T-21`) | Planned |
| `FR-ND-02` | When no active loans and no outstanding fines, staff with No-dues issues printable certificate and optionally sets status GRADUATED; audited. | `app/(staff)/nodues/certificate/[id]/`, `services/nodues.ts`| `tests/e2e/nodues.spec.ts` (`T-21`) | Planned |

### 2.11 Reports (`FR-RP`) — 3 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-RP-01` | System provides all 13 reports: stock by copy status, stock/value by department, stock by library, accession register, copies never issued, daily issues/returns, department-wise circulation, most borrowed titles, overdue books with contacts, top borrowers, patrons by category/status, outstanding fines, fine collection register. | `app/(staff)/reports/`, `reports/` modules | `tests/integration/reports.test.ts` (`T-22`) | Planned |
| `FR-RP-02` | Date-based reports accept from/to range (default last 30 days); viewable on screen, printable, downloadable as CSV with UTF-8 BOM. | `reports/csv-export.ts`, `app/api/reports/` | `tests/integration/reports.test.ts` (`T-22`) | Planned |
| `FR-RP-03` | Dates in reports display dd-mm-yyyy and monetary values with two decimal places. | `lib/formatters.ts` | `tests/unit/formatters.test.ts` | Planned |

### 2.12 Administration (`FR-AD`) — 3 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-AD-01` | Staff with Admin rules lists, adds, edits, deletes circulation rules (library, category, item type, limits). | `app/(staff)/admin/rules/`, `services/admin-rules.ts`| `tests/integration/admin.test.ts` (`T-24`) | Planned |
| `FR-AD-02` | Staff with Admin settings edits system settings of appendix 10.2; changes take effect immediately without restart. | `app/(staff)/admin/settings/`, `services/settings.ts` | `tests/e2e/settings.spec.ts` (`T-23`) | Planned |
| `FR-AD-04` | Staff with Audit view browses last 300 audit entries filtered by action and actor. *(Note: FR-AD-03 omitted in SRS)* | `app/(staff)/admin/audit/`, `repositories/audit.ts` | `tests/e2e/audit.spec.ts` (`T-26`) | Planned |

### 2.13 OPAC Public Catalogue (`FR-OP`) — 4 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-OP-01` | Public search on LAN without login; browse new arrivals (NEW_ARRIVAL_DAYS), most borrowed titles, departments; view copy shelf locations. | `app/opac/`, `services/opac.ts` | `tests/e2e/opac-public.spec.ts` | Planned |
| `FR-OP-02` | Signed-in patron sees card details, validity, current loans with due dates, outstanding fines, hold queue positions, borrowing history. | `app/opac/account/`, `services/opac-account.ts` | `tests/e2e/opac-auth.spec.ts` | Planned |
| `FR-OP-03` | Signed-in patron places hold (FR-HO-01), cancels own holds, changes password. | `app/opac/holds/`, `services/opac-holds.ts` | `tests/e2e/opac-holds.spec.ts` (`T-16`, `T-17`) | Planned |
| `FR-OP-04` | OPAC uses separate public layout; never exposes staff functions or other patrons' private data. | `app/opac/layout.tsx` | `tests/e2e/opac-public.spec.ts` | Planned |

### 2.14 Printing and Barcodes (`FR-PR`) — 2 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-PR-01` | System generates Code 128 barcodes server-side as SVG for text up to 40 characters via `/barcode` endpoint. | `app/barcode/route.ts` (using `bwip-js`) | `tests/integration/barcode.test.ts` (`T-25`) | Planned |
| `FR-PR-02` | Labels, cards, receipts, certificates carry LIBRARY_NAME / INSTITUTE_NAME / LABEL_TITLE system settings. | `components/print/` print templates | `tests/e2e/printing.spec.ts` | Planned |

### 2.15 Audit (`FR-AT`) — 2 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-AT-01` | Records timestamp, actor, action, entity, entity id, details, client IP for logins, circulation, refusals, payments, waivers, imports, settings. | `services/audit.ts`, `db/schema/audit.ts` | `tests/integration/audit.test.ts` (`T-26`) | Planned |
| `FR-AT-02` | Audit records are append-only; database permissions prevent UPDATE and DELETE by application role. | `db/schema/audit.ts`, PostgreSQL grants | `tests/integration/audit.test.ts` | Planned |

### 2.16 Start-up & Installation (`FR-ST`) — 3 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `FR-ST-01` | On start, application checks database connection and executes versioned migrations and seed data if schema absent. | `scripts/startup.ts`, `db/migrations/` | `tests/integration/startup.test.ts` (`T-01`) | Planned |
| `FR-ST-02` | When database unreachable, login page shows clear error with URL and recovers without restart once database is online. | `lib/db-health.ts`, `app/(auth)/login/page.tsx` | `tests/integration/db-failover.test.ts` (`T-02`) | Planned |
| `FR-ST-03` | Seed data includes master data for 5 institutions, roles, permissions, default rules, settings, 3 staff accounts, sample training set. | `db/seeds/baseline-seed.ts` | `tests/integration/startup.test.ts` (`T-01`) | Planned |

---

## 3. Business Rules (`BR-*`) — 9 Rules

| Requirement ID | Rule Summary | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| `BR-01` | Rule binds optional (library, category, item type) to max books, loan days, max renewals, fine per day, grace days, max fine, holds allowed. | `rules/engine.ts`, `rules/types.ts` | `tests/unit/rules-engine.test.ts` | Implemented |
| `BR-02` | Rule selection scoring: Library 4 + Item Type 2 + Category 1. Unmatched falls back to system settings defaults. | `rules/engine.ts` (`selectRule`) | `tests/unit/rules-engine.test.ts` (`T-05`, `T-07`) | Implemented |
| `BR-03` | Max books = 0 or loan days = 0 means item is not issued to this category/item type. | `rules/engine.ts` (`checkZeroLimits`) | `tests/unit/rules-engine.test.ts` | Implemented |
| `BR-04` | Reference item types never issued unless selected rule explicitly names that item type, regardless of score. | `rules/engine.ts` (`checkReferenceIssuable`) | `tests/unit/rules-engine.test.ts` (`T-06`, `T-07`) | Implemented |
| `BR-05` | Due date = issue date + loan days; renewal due date = today + loan days; renewals capped at max renewals. | `rules/engine.ts` (`calculateDueDate`, `checkRenewalEligibility`) | `tests/unit/rules-engine.test.ts` (`T-05`, `T-12`) | Implemented |
| `BR-06` | Overdue fine = max(0, days late - grace days) * fine per day, capped at max fine; computed at return/lost, never accrued daily. | `rules/fines.ts` (`calculateOverdueFine`) | `tests/unit/rules-fines.test.ts` (`T-09`) | Implemented |
| `BR-07` | Lost charge = copy price (title price fallback) + LOST_PROCESSING_FEE + overdue fine to date. | `rules/fines.ts` (`calculateLostCharge`) | `tests/unit/rules-fines.test.ts` (`T-13`) | Implemented |
| `BR-08` | Issue blocked on overdue loans (BLOCK_ISSUE_IF_OVERDUE) or fines >= FINE_BLOCK_LIMIT; renewal blocked on fines, overdues, holds. | `rules/eligibility.ts` (`evaluateIssueEligibility`), `rules/engine.ts` | `tests/unit/rules-eligibility.test.ts` (`T-08`), `tests/unit/rules-engine.test.ts` | Implemented |
| `BR-09` | Max books quota counts active loans across all titles and libraries in group. | `rules/eligibility.ts` (`checkLoanQuota`, `evaluateIssueEligibility`) | `tests/unit/rules-eligibility.test.ts` | Implemented |

---

## 4. Non-Functional Requirements (`NFR-*`) — 33 Requirements

### 4.1 Performance (`NFR-P`) — 5 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-P-01` | Desk transactions complete within 1 second at design volumes of DR-07. | Indexed queries, optimized transaction locks | `tests/load/circulation-load.test.ts` (`T-27`) | Planned |
| `NFR-P-02` | Search/list pages render within 2 seconds; dashboard within 3 seconds. | Server component streaming, indexed SQL views | `tests/load/rendering-perf.test.ts` | Planned |
| `NFR-P-03` | Bulk import processes >= 100 rows/sec; accepts up to 10 MB (patrons) and 20 MB (books). | Streaming parser (`csv-parse`), bulk inserts | `tests/integration/import-perf.test.ts` | Planned |
| `NFR-P-04` | Supports 20 concurrent staff sessions and 200 concurrent OPAC users on 4-core, 4 GB RAM server. | Node.js lightweight event loop + PostgreSQL pool | `tests/load/circulation-load.test.ts` (`T-27`) | Planned |
| `NFR-P-05` | Cold start on existing database under 30 seconds; first start under 2 minutes. | Next.js standalone build, drizzle migrations | `tests/integration/startup.test.ts` (`T-01`) | Planned |

### 4.2 Security (`NFR-S`) — 6 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-S-01` | Role-based authorization enforced on every server request; no client-side-only checks. | `lib/auth.ts` (`requirePermission`, `requireAuthenticatedUser`) | `tests/integration/auth.test.ts` (`T-03`) | Implemented |
| `NFR-S-02` | Passwords hashed via Argon2id; zero passwords in logs, exports, audit details. | `lib/crypto.ts`, `services/audit.ts` sanitization | `tests/unit/crypto.test.ts`, `tests/integration/auth.test.ts` | Implemented |
| `NFR-S-03` | All SQL parameterized through Drizzle ORM; HTML escaping on output; uploads treated as data. | Drizzle ORM query builders, React escaping | Code audit & Vitest | Implemented |
| `NFR-S-04` | CSRF tokens on all forms; HttpOnly session cookies; session renewal at login. | `lib/csrf.ts`, `services/session.ts`, `lib/auth.ts` | `tests/integration/auth.test.ts`, `tests/integration/auth-routes.test.ts` (`T-04`) | Implemented |
| `NFR-S-05` | Staff and OPAC sessions are distinct objects; OPAC login never grants staff access. | `lib/auth.ts`, `services/session.ts` | `tests/integration/auth.test.ts` | Implemented |
| `NFR-S-06` | Database port not exposed beyond server; credentials only in server environment variables. | `DATABASE_URL` environment configuration | Infrastructure audit | Implemented |

### 4.3 Reliability & Data Integrity (`NFR-R`) — 5 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-R-01` | Atomic business operations: failure rolls back entire transaction. | `db.transaction` wrappers across services | `tests/integration/circulation.test.ts` | Planned |
| `NFR-R-02` | Import rows are independent transactions; one bad row never stops others. | Per-row try/catch in import commit service | `tests/integration/import-students.test.ts` | Planned |
| `NFR-R-03` | Application recovers from database restart without app restart. | PostgreSQL client pool auto-reconnect | `tests/integration/db-failover.test.ts` (`T-02`) | Planned |
| `NFR-R-04` | Online database backup procedure tested and documented; sequences continue. | `pg_dump` backup and recovery scripts | `tests/integration/backup-restore.test.ts` (`T-28`) | Planned |
| `NFR-R-05` | High availability: unplanned downtime under 1 hour per month during opening hours. | Robust error boundary, systemd / service monitoring | Production runbook | Planned |

### 4.4 Usability (`NFR-U`) — 6 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-U-01` | Librarian completes issue/return in two barcode scans without touching mouse. | Autofocus cycle, Enter-key submission | `tests/e2e/circulation-desk.spec.ts` | Planned |
| `NFR-U-02` | Plain-language refusals and guidance ("Return them before issuing new ones"). | Business rule exception message strings | `tests/unit/rules-engine.test.ts` | Planned |
| `NFR-U-03` | Plain-language error messages (pagination split noted). | Global error handler, flash notification strip | `tests/e2e/ui-ux.spec.ts` | Planned |
| `NFR-U-04` | Consistent navigation: sidebar, page title, message strip; form values preserved on failure. | `app/layout.tsx`, `app/error.tsx` | `tests/integration/health.test.ts` | Implemented |
| `NFR-U-05` | Printouts usable on plain A4, label sheets, and card stock without custom drivers. | `app/globals.css` print media rules | `tests/e2e/printing.spec.ts` | Implemented |
| `NFR-U-06` | OPAC needs no instruction for students to search, view availability, and reserve. | Intuitive search bar and clear status badges | `tests/e2e/opac-public.spec.ts` | Planned |

### 4.5 Maintainability (`NFR-M`) — 5 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-M-01` | Layered code (routes / services / repositories / db); clean separation. | Directory architecture per `CLAUDE.md` | Architecture review | Implemented |
| `NFR-M-02` | Adding report, setting, or permission requires changes in at most 3 files. | Modular view queries, settings table | Architecture review | Planned |
| `NFR-M-03` | All configuration in environment variables and system_settings table; zero hard-coded limits. | `config/env.ts`, `system_settings` table | Code audit | Planned |
| `NFR-M-04` | Strict TypeScript mode, TSDoc comments, numbered idempotent SQL migrations. | `tsconfig.json`, `biome.json` | `pnpm tsc --noEmit`, `pnpm run lint` | Implemented |
| `NFR-M-05` | Automated test suite covering circulation rules, imports, and full HTTP user flows. | `vitest.config.mts`, `playwright.config.ts` | `pnpm test`, `pnpm test:e2e` | Implemented |

### 4.6 Portability & Compatibility (`NFR-C`) — 4 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-C-01` | Runs unchanged on Windows 10/11 and Linux on Node.js 26 and PostgreSQL 18. | Cross-platform Node.js runtime scripts | Windows Node.js verification | Implemented |
| `NFR-C-02` | Deterministic offline build using pnpm; zero external CDN runtime dependencies. | `pnpm-lock.yaml`, local bundled assets | `pnpm build` standalone verification | Implemented |
| `NFR-C-03` | Relational database compatibility via standard SQL and connection pool. | `db/client.ts`, PostgreSQL connection pool | `tests/integration/db-schema.test.ts` | Implemented |
| `NFR-C-04` | Browser support (Chrome, Edge, Firefox); all critical functions usable without JS. | Server-rendered HTML layout & forms | Playwright multi-browser setup | Implemented |

### 4.7 Legal & Institutional (`NFR-L`) — 2 Requirements

| Requirement ID | Description | Implementation Target | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `NFR-L-01` | Patron personal data visible only to staff with Patron view; exports restricted to Report view. | `requirePermission('PATRON_VIEW')`, export guard | `tests/e2e/auth-roles.spec.ts` | Planned |
| `NFR-L-02` | Accession register and fine collection register printable in form acceptable for institutional audit. | Statutory report templates with signatures | `tests/e2e/printing.spec.ts` | Planned |

---

## 5. Use Cases (`UC-*`) — 12 Use Cases

| Use Case ID | Name | Primary Actor | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `UC-01` | Issue a book | Librarian (`CIRC_ISSUE`) | `app/(staff)/circulation/issue/`, `services/circulation.ts` | `tests/integration/circulation.test.ts` (`T-05`), `tests/e2e/circulation-desk.spec.ts` | Implemented |
| `UC-02` | Return a book | Librarian (`CIRC_RETURN`) | `app/(staff)/circulation/return/`, `services/circulation.ts` | `tests/integration/circulation.test.ts` (`T-09`, `T-10`), `tests/e2e/circulation-desk.spec.ts` | Implemented |
| `UC-03` | Renew a book | Librarian (`CIRC_RENEW`) | `app/(staff)/circulation/renew/`, `services/circulation.ts` | `tests/integration/circulation.test.ts` (`T-12`), `tests/e2e/circulation-desk.spec.ts` | Implemented |
| `UC-04` | Mark a book lost | Librarian (`CIRC_LOST`) | `app/(staff)/circulation/lost/`, `services/circulation.ts` | `tests/integration/circulation.test.ts` (`T-13`), `tests/e2e/circulation-desk.spec.ts` | Implemented |
| `UC-05` | Bulk import students | Librarian (`PATRON_IMPORT`) | `app/(staff)/imports/patrons/`, `services/patron-import.ts` | `tests/integration/import-students.test.ts` (`T-19`) | Planned |
| `UC-06` | Bulk import books | Librarian (`CATALOG_IMPORT`)| `app/(staff)/imports/books/`, `services/book-import.ts` | `tests/integration/import-books.test.ts` (`T-18`) | Planned |
| `UC-07` | Reserve a title (OPAC)| Patron (authenticated) | `app/opac/OpacClient.tsx`, `services/holds.ts` | `tests/integration/holds.test.ts` (`T-16`, `T-17`), `tests/e2e/reservations.spec.ts` | Implemented |
| `UC-08` | Collect or waive a fine| Librarian (`FINE_COLLECT`/`WAIVE`)| `app/(staff)/fines/`, `services/fines.ts`, `app/api/fines/` | `tests/integration/fines.test.ts` (`T-14`, `T-15`), `tests/integration/fines-routes.test.ts`, `tests/e2e/fines.spec.ts` | Implemented |
| `UC-09` | Issue a no-dues certificate| Librarian (`NODUES_ISSUE`)| `app/(staff)/nodues/`, `services/nodues.ts` | `tests/e2e/nodues.spec.ts` (`T-21`) | Planned |
| `UC-10` | Configure a circulation rule| Admin (`ADMIN_RULES`) | `app/(staff)/admin/rules/`, `services/admin-rules.ts`| `tests/integration/admin.test.ts` (`T-24`) | Planned |
| `UC-11` | Manage staff accounts | Admin (`ADMIN_USERS`) | `app/(staff)/admin/users/`, `services/user.ts`, `app/api/admin/users/` | `tests/integration/rbac.test.ts`, `tests/integration/rbac-routes.test.ts` | Implemented |
| `UC-12` | First start of the system | System / Developer | `scripts/startup.ts`, `db/migrations/` | `tests/integration/startup.test.ts` (`T-01`) | Planned |

---

## 6. Acceptance Tests (`T-*`) — 28 Scenarios

| Test ID | Test Scenario | Covered Requirements | Test Harness & File | Status |
| :--- | :--- | :--- | :--- | :---: |
| `T-01` | First start on empty database | `FR-ST-01`, `FR-AU-01` | Vitest: `tests/integration/startup.test.ts` | Planned |
| `T-02` | Database unreachable & recovery | `FR-ST-02`, `NFR-R-03` | Vitest: `tests/integration/db-failover.test.ts` | Planned |
| `T-03` | Assistant Librarian role restriction | `FR-AU-02`, `NFR-S-01` | Vitest: `tests/integration/auth.test.ts` / `auth-routes.test.ts` | Implemented |
| `T-04` | CSRF & unpermitted direct URL POST | `FR-AU-02`, `FR-AU-07`, `NFR-S-01`, `NFR-S-04` | Vitest: `tests/integration/auth.test.ts` / `auth-routes.test.ts` | Implemented |
| `T-05` | Standard book checkout | `FR-CI-02`, `BR-02`, `BR-05` | Vitest: `tests/integration/circulation.test.ts` | Implemented |
| `T-06` | Reference item issue refusal | `BR-04`, `FR-CI-02` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-engine.test.ts` | Implemented |
| `T-07` | Reference item issue to faculty | `BR-02`, `BR-04` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-engine.test.ts` | Implemented |
| `T-08` | Overdue issue blocking | `BR-08`, `FR-CI-02` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-eligibility.test.ts` | Implemented |
| `T-09` | Overdue return fine calculation | `FR-CI-03`, `BR-06` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-fines.test.ts` | Implemented |
| `T-10` | Hold assignment upon return | `FR-HO-03`, `FR-CI-03` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-reservations.test.ts` | Implemented |
| `T-11` | Reserved copy issue control | `FR-CI-02`, `FR-HO-03` | Vitest: `tests/integration/circulation.test.ts` | Implemented |
| `T-12` | Consecutive renewal limit | `FR-CI-04`, `BR-05` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-engine.test.ts` | Implemented |
| `T-13` | Mark book lost | `FR-CI-05`, `BR-07` | Vitest: `tests/integration/circulation.test.ts`, `tests/unit/rules-fines.test.ts` | Implemented |
| `T-14` | Cash fine payment & receipt | `FR-FI-02`, `FR-FI-03` | Vitest: `tests/integration/fines.test.ts`, `tests/integration/fines-routes.test.ts` | Implemented |
| `T-15` | Fine waiver authorization | `FR-FI-04`, `FR-AU-02` | Vitest: `tests/integration/fines.test.ts`, `tests/integration/fines-routes.test.ts`, `tests/e2e/fines.spec.ts` | Implemented |
| `T-16` | Hold placement refusal on shelf copy | `FR-HO-01`, `FR-OP-03` | Vitest: `tests/integration/holds.test.ts`, `tests/integration/holds-routes.test.ts` | Implemented |
| `T-17` | Hold placement & cancellation | `FR-HO-01`, `FR-HO-05`, `FR-OP-03` | Vitest: `tests/integration/holds.test.ts`, `tests/integration/holds-routes.test.ts` | Implemented |
| `T-18` | Bulk book import validation & commit | `FR-BI-02` to `05` | Vitest: `tests/integration/import-books.test.ts` | Planned |
| `T-19` | Bulk student import & deduplication | `FR-PI-03` to `05` | Vitest: `tests/integration/import-students.test.ts` | Planned |
| `T-20` | Student initial OPAC login | `FR-AU-05`, `FR-OP-03` | Vitest: `tests/integration/auth.test.ts` / `auth-routes.test.ts` | Implemented |
| `T-21` | No-dues clearance verification | `FR-ND-01`, `FR-ND-02` | Playwright: `tests/e2e/nodues.spec.ts` | Planned |
| `T-22` | All 13 reports verification | `FR-RP-01` to `03` | Vitest: `tests/integration/reports.test.ts` | Planned |
| `T-23` | System setting dynamic update | `FR-AD-02` | Playwright: `tests/e2e/settings.spec.ts` | Planned |
| `T-24` | Dynamic circulation rule addition | `FR-AD-01`, `BR-02` | Vitest: `tests/integration/circulation.test.ts` | Planned |
| `T-25` | Barcode label & ID card printing | `FR-PR-01`, `FR-CA-07`, `FR-PA-07` | Playwright: `tests/e2e/printing.spec.ts` | Planned |
| `T-26` | Append-only audit trail verification | `FR-AT-01`, `FR-AT-02` | Vitest: `tests/integration/audit.test.ts` | Planned |
| `T-27` | High-concurrency load test | `NFR-P-01`, `NFR-P-04` | Concurrency harness: `tests/load/circulation-load.test.ts` | Planned |
| `T-28` | Database backup & restore | `NFR-R-04` | Vitest: `tests/integration/backup-restore.test.ts` | Planned |

---

## 7. Data Requirements (`DR-*`) — 9 Requirements

| Requirement ID | Description | Implementation Location | Test Location | Status |
| :--- | :--- | :--- | :--- | :---: |
| `DR-01` | Unique constraints: card_no, roll_no, employee_id, username, accession_no, barcode, receipt_no, master codes; partial unique index on active holds. | `db/schema/` | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-02` | Foreign key referential integrity; referenced master rows cannot be deleted (is_active flag used). | `db/schema/` (`ON DELETE RESTRICT`) | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-03` | Status columns accept only defined enum values via CHECK constraints. | `db/schema/` (`CHECK` constraints) | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-04` | Money as NUMERIC(10,2); dates as DATE; timestamps as TIMESTAMPTZ with created_at/updated_at. | `db/schema/` | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-05` | Text limits: title/subtitle/authors/keywords 500, publisher 200, names 60, address 500, summary 4000; importers truncate. | `imports/truncate.ts` | `tests/unit/truncate.test.ts` | Planned |
| `DR-06` | Operational data retained indefinitely; nothing is ever physically deleted. | Repositories & database grants | `tests/integration/audit.test.ts` | Planned |
| `DR-07` | 5-year design volumes: 60k copies, 25k titles, 15k patrons, 300k loans, 1M audit logs supported via lookup indexes. | `db/schema/` indexes | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-08` | First start installs 5 institutions, 5 libraries, 12 depts, 11 courses, 15 categories, 7 item types, 2 vendors, 4 roles, 21 permissions, 3 staff, 20 rules, 17 settings, training set. | `db/seed.ts` | `tests/integration/db-schema.test.ts` | Implemented |
| `DR-09` | Seed passwords stored only as hashes generated at build time. | `db/seed.ts` (Argon2id) | `tests/unit/crypto.test.ts` | Implemented |

---

## 8. Constraints & Interface Requirements

| Identifier | Requirement Scope | Specification Details | Implementation Target | Status |
| :--- | :--- | :--- | :--- | :---: |
| `C-1` | Runtime Environment | Superseded: Node.js 26, TypeScript 7 strict mode, pnpm. | Workspace root | Implemented |
| `C-2` | Bundled Dependencies | Next.js standalone build; zero runtime external CDN assets. | `next.config.ts`, `public/` | Implemented |
| `C-3` | Data Access | Drizzle ORM typed queries; 100% parameterized SQL. | `db/`, `db/schema/` | Implemented |
| `C-4` | Persistent State | All persistent state stored in PostgreSQL 18. | PostgreSQL 18, `db/migrations/` | Implemented |
| `C-5` | User Interface | Server-rendered React components with Next.js App Router. | `app/`, layouts, UI shell | Implemented |
| `C-6` | Currency & Date Format | Indian Rupees (`₹`) with 2 decimals; dates displayed `dd-mm-yyyy`. | `lib/utils.ts`, UI displays | Implemented |
| `UI-1` | Dual Interfaces | Distinct staff interface (login required) and public OPAC. | `app/(staff)/`, `app/opac/`, `app/account/` | Implemented |
| `UI-2` | Role-Filtered Menus | Menus and actions shown only when permitted; confirmation/refusal messages. | `components/layout/StaffSidebar.tsx`, `ForbiddenCard.tsx` | Implemented |
| `UI-3` | Scanner-Driven Desk | Autofocus patron and copy inputs; Enter submits form without mouse. | `app/(staff)/circulation/` | Implemented |
| `UI-4` | Filterable Paged Lists | Lists paged at 25 rows; links to record detail pages. | `components/ui/Table.tsx`, filters | Implemented |
| `UI-5` | Print Stylesheets | Print stylesheets hiding navigation/buttons; `@page` sizes. | `app/globals.css`, `components/print/` | Implemented |
| `UI-6` | Responsive Layout | Works at >= 1024 px; degrades to single column below 800 px. | `app/globals.css`, `app/layout.tsx`, `components/layout/` | Implemented |
| `UI-7` | UTF-8 Text Support | Full UTF-8 support for Indian names and rupee symbol (`₹`). | `app/globals.css`, Next.js HTML config | Implemented |
| `HW-1` | Barcode Scanners | USB keyboard-wedge reading Code 128 without custom drivers. | Standard input events | Planned |
| `HW-2` | Printing Devices | Browser print dialog; A4 label sheets, ID-1 cards, A5 receipts, A4 certificates. | Browser print integration | Planned |
| `CI-1` | LAN HTTP Communication| LAN HTTP communication on port 8080 or 3000; reverse proxy ready. | `config/env.ts`, Next.js server | Implemented |
| `CI-2` | Database Protocol | PostgreSQL protocol on port 5432 local to server. | `db/client.ts` connection pool | Implemented |
| `CI-3` | Offline Operation | Zero outbound internet required at runtime. | Standalone build, local assets | Implemented |
