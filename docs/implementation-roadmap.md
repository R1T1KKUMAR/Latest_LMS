# RBMI Library Management System — Implementation Roadmap

This document outlines the phased, step-by-step implementation strategy for the RBMI Library Management System in accordance with the development workflow specified in `CLAUDE.md`.

In compliance with project directives:
- Work proceeds **strictly phase by phase**.
- No later phase is started until all dependencies and tests of the preceding phase are verified and green.
- Every phase updates `docs/requirements-traceability.md`.

---

## Roadmap Overview

```
Phase 0: Project Foundations & Tooling
   ↓
Phase 1: Database Architecture, Drizzle Schema & Seed Scripts
   ↓
Phase 2: Authentication, Sessions & Authorization Guards
   ↓
Phase 3: Pure TypeScript Circulation Rules Engine
   ↓
Phase 4: Master Data & Administration
   ↓
Phase 5: Patron Management & Bulk Roster Import
   ↓
Phase 6: Catalogue Management & Bulk Book Import
   ↓
Phase 7: Circulation Desk & Concurrency-Safe Transactions
   ↓
Phase 8: Reservations & Fine Management
   ↓
Phase 9: No-Dues Clearance & Public OPAC Portal
   ↓
Phase 10: Operational & Statutory Reports (13 Views & CSV BOM)
   ↓
Phase 11: End-to-End Acceptance (T-01 to T-28) & Hardening
```

---

## Detailed Phase Breakdown

### Phase 0: Project Setup, Tooling & Foundations
- **Objective:** Establish the development environment, baseline Next.js 16 project, package dependencies, and quality tooling.
- **SRS Scope:** `C-1`, `C-2`, `NFR-M-04`, `NFR-M-05`.
- **Key Deliverables:**
  - Initialize project with `pnpm`, Next.js 16 (App Router), React 19, TypeScript 7 (strict mode).
  - Configure Tailwind CSS 4 and initialize `shadcn/ui` foundation.
  - Setup Biome 2.5 (`biome.json`) for linting and formatting.
  - Setup Vitest 5.0 and Playwright 1.63 configuration.
  - Setup Pino logger and global error handling utilities.
- **Exit Criteria:** `pnpm build`, `pnpm biome check`, and `pnpm vitest run` execute with zero errors.

---

### Phase 1: Database Infrastructure & Migrations
- **Objective:** Model and deploy the persistent relational schema in PostgreSQL 18.
- **SRS Scope:** Section 6, `DR-01` to `DR-09`, `FR-ST-01`, `FR-ST-03`.
- **Key Deliverables:**
  - Drizzle ORM schema defining all **22 tables** + **sessions table**.
  - PostgreSQL sequences: `seq_card_no`, `seq_receipt_no`.
  - All **6 SQL views**: `v_bib_availability`, `v_active_loans`, `v_overdue_loans`, `v_outstanding_fines`, `v_accession_register`, `v_patron_summary`.
  - Referential integrity, foreign key constraints (`ON DELETE RESTRICT`), unique constraints, and check constraints.
  - Initial migration scripts generated via `drizzle-kit`.
  - Baseline seed data script (`db/seeds/baseline-seed.ts`) installing master data, 4 roles, 21 permissions, default settings, and test entities (`DR-08`, Section 10.4).
- **Exit Criteria:** Migrations run cleanly on fresh database; views and sequences queryable; seed data matches `DR-08` requirements.

---

### Phase 2: Authentication, Sessions & Security
- **Objective:** Build secure multi-role authentication and server-side authorization.
- **SRS Scope:** `FR-AU-01` to `FR-AU-08`, `NFR-S-01` to `NFR-S-06`, `UI-1`, `UI-2`.
- **Key Deliverables:**
  - Argon2id hashing utility in `lib/crypto.ts` (`FR-AU-08`).
  - Session manager with `sessions` table in database, HttpOnly cookies, 60-minute expiration (`FR-AU-06`).
  - Staff login (`/login`) and OPAC patron login (`/opac/login`) with strict session object isolation (`NFR-S-05`).
  - Per-session CSRF token generation and validation middleware for all POST routes (`FR-AU-07`).
  - `requirePermission()` server-side guard returning real HTTP 403 Forbidden on unpermitted requests (`FR-AU-02`, `NFR-S-01`).
  - Role-based dynamic navigation sidebar rendering permitted menu options only (`UI-2`).
  - Audit logging integration for login successes, failures, and access denials (`FR-AT-01`).
- **Tests:** `tests/integration/auth.test.ts`, `tests/e2e/auth-roles.spec.ts` (`T-03`, `T-04`).
- **Exit Criteria:** `T-01`, `T-03`, `T-04` pass; unauthorized access blocked with HTTP 403; sessions securely persisted.

---

### Phase 3: Core Circulation Rules Engine
- **Objective:** Implement the pure TypeScript business logic engine for borrowing terms and fine calculations.
- **SRS Scope:** `BR-01` to `BR-09`, Section 5.1, Section 5.2.
- **Key Deliverables:**
  - `rules/engine.ts`: Candidate rule filtering, scoring algorithm (Library 4 + Item Type 2 + Category 1), and tie-breaking (`BR-01`, `BR-02`).
  - Fallback logic to `system_settings` defaults (`BR-02`).
  - Zero-limit validation (`BR-03`).
  - Reference item check (`BR-04`).
  - Due date calculation and renewal limits (`BR-05`).
  - Overdue fine calculation with grace days and cap (`BR-06`).
  - Lost book fee calculation (`BR-07`).
  - Issue and renewal blocking eligibility checks (`BR-08`, `BR-09`).
- **Tests:** Comprehensive Vitest unit tests in `tests/unit/rules-engine.test.ts` covering all worked examples from Section 5.1 and scenarios `T-06`, `T-07`, `T-08`, `T-12`.
- **Exit Criteria:** 100% test coverage on `rules/` module; zero database imports in rules engine.

---

### Phase 4: Master Data & System Administration
- **Objective:** Administrative management for system settings, circulation rules, master entities, staff accounts, and audit inspection.
- **SRS Scope:** `FR-AD-01`, `FR-AD-02`, `FR-AD-04`, `FR-ST-01`, `FR-ST-02`, `UC-10`, `UC-11`, `UC-12`.
- **Key Deliverables:**
  - Circulation rules administration (`/admin/rules`): list, add, edit, delete rules (`FR-AD-01`, `UC-10`).
  - System settings editor (`/admin/settings`): live updates to 17 configuration keys without restart (`FR-AD-02`).
  - Staff user accounts management (`/admin/users`): add, edit, activate/deactivate, password reset (`FR-AU-04`, `UC-11`).
  - Master data viewers/editors (`/admin/masters`): institutions, libraries, departments, courses, categories, item types, vendors.
  - Audit trail viewer (`/admin/audit`): browse last 300 entries with action and actor filters (`FR-AD-04`).
  - First-start database check and failover banner (`FR-ST-01`, `FR-ST-02`).
- **Tests:** `tests/integration/admin.test.ts`, `tests/e2e/settings.spec.ts` (`T-02`, `T-23`, `T-24`, `T-26`).
- **Exit Criteria:** `T-02`, `T-23`, `T-24`, `T-26` pass; settings update dynamically.

---

### Phase 5: Patron Management & Bulk Roster Import
- **Objective:** Patron registration, card generation, and bulk student/faculty CSV import workflows.
- **SRS Scope:** `FR-PA-01` to `FR-PA-08`, `FR-PI-01` to `FR-PI-06`, `UC-05`, `NFR-L-01`.
- **Key Deliverables:**
  - Patron profile CRUD (`/patrons`), search with multi-field filtering (`FR-PA-04`, `FR-PA-05`).
  - Status management (Active, Blocked, Expired, Graduated, Left) (`FR-PA-06`).
  - ISO ID-1 printable library card ($86 \times 54\text{ mm}$) with Code 128 barcode (`FR-PA-07`, `UI-5`).
  - CSV parser and validator for students and faculty (`imports/patrons.ts`) supporting UTF-8 BOM and Windows-1252 (`FR-PI-01` to `03`).
  - Two-stage import UI (`/patrons/import`): upload preview with OK/WARN/ERROR row classification, followed by commit (`UC-05`).
  - Per-row transactional isolation and deduplication logic (`FR-PI-04`, `FR-PI-05`).
- **Tests:** `tests/integration/import-students.test.ts`, `tests/e2e/patrons.spec.ts` (`T-19`, `T-20`).
- **Exit Criteria:** `T-19`, `T-20` pass; duplicate CSV uploads safely rejected; card prints with proper CSS dimensions.

---

### Phase 6: Catalogue Management & Bulk Book Import
- **Objective:** Bibliographic records, physical copy tracking, barcode generation, label printing, and book CSV imports.
- **SRS Scope:** `FR-CA-01` to `FR-CA-08`, `FR-BI-01` to `FR-BI-05`, `FR-PR-01`, `FR-PR-02`, `UC-06`.
- **Key Deliverables:**
  - Bibliographic records CRUD (`/catalogue`) with ISBN normalisation (`FR-CA-01`).
  - Batch copy addition (1–200 copies) with automatic accession number generation per library prefix (`FR-CA-02`, `FR-CA-03`).
  - Copy status management (Reference, Withdrawn, Damaged, Repair, Processing) (`FR-CA-06`, `FR-CA-08`).
  - Barcode SVG generator route handler at `/barcode` via `bwip-js` (`FR-PR-01`).
  - Printable A4 label sheets (4 labels per row) (`FR-CA-07`, `HW-2`).
  - Book CSV import workflow (`/catalogue/import`) with preview, new title vs copy addition detection, and sequential accession allocation (`FR-BI-01` to `05`, `UC-06`).
- **Tests:** `tests/integration/import-books.test.ts`, `tests/e2e/catalogue.spec.ts` (`T-18`, `T-25`).
- **Exit Criteria:** `T-18`, `T-25` pass; accession sequence increments safely; SVG barcodes scan accurately.

---

### Phase 7: Circulation Desk & Transaction Processing
- **Objective:** Fast, keyboard/scanner-driven circulation desk processing book checkouts, check-ins, renewals, and lost copy declarations with atomic concurrency control.
- **SRS Scope:** `FR-CI-01` to `FR-CI-07`, `BR-02` to `BR-09`, `UI-3`, `NFR-U-01`, `NFR-R-01`, `UC-01` to `UC-04`.
- **Key Deliverables:**
  - Circulation desk interface (`/circulation`) with scanner autofocus and native form submission (`UI-3`, `NFR-U-01`).
  - Checkout service (`services/circulation.ts`) applying all 9 checks in strict sequence (`FR-CI-02`).
  - Concurrency lock using `SELECT ... FOR UPDATE` on `items` row during checkout and check-in (`NFR-R-01`).
  - Check-in workflow closing active loan, calculating late fines per `BR-06`, and evaluating hold reservation queues (`FR-CI-03`, `UC-02`).
  - Renewal workflow validating consecutive limits and overdue status (`FR-CI-04`, `UC-03`).
  - Mark Lost workflow charging copy price, processing fee, and late fines (`FR-CI-05`, `UC-04`).
- **Tests:** `tests/integration/circulation.test.ts`, `tests/e2e/circulation-desk.spec.ts` (`T-05`, `T-06`, `T-07`, `T-08`, `T-09`, `T-12`, `T-13`).
- **Exit Criteria:** `T-05` through `T-09`, `T-12`, `T-13` pass; race condition test confirms no double issuance.

---

### Phase 8: Reservations & Fine Management
- **Objective:** Title hold queues, automatic hold assignment on return, hold expiration housekeeping, fine collection, and waivers.
- **SRS Scope:** `FR-HO-01` to `FR-HO-04`, `FR-FI-01` to `FR-FI-05`, `FR-DB-03`, `UC-07`, `UC-08`.
- **Key Deliverables:**
  - Reservation service (`services/holds.ts`) managing FIFO queues and partial unique index constraints (`FR-HO-01`, `FR-HO-02`).
  - Automatic assignment of returned copies to the oldest waiting hold, setting copy to `RESERVED` and hold to `AVAILABLE_FOR_PICKUP` (`FR-HO-03`).
  - Housekeeping procedure expiring unclaimed holds past `HOLD_PICKUP_DAYS` upon dashboard or reservations page access (`FR-HO-04`, `FR-DB-03`).
  - Fine collection desk (`/fines`): partial and full payment recording (`FR-FI-01`, `FR-FI-02`).
  - Unique receipt numbering via `seq_receipt_no` (`RCPT-YYYY-NNNNN`) and printable A5 receipts (`FR-FI-03`, `UI-5`).
  - Fine waiver workflow restricted to `FINE_WAIVE` permission (`FR-FI-04`, `T-15`).
  - Immutable database constraints on fines and payments (`FR-FI-05`).
- **Tests:** `tests/integration/holds.test.ts`, `tests/integration/fines.test.ts` (`T-10`, `T-11`, `T-14`, `T-15`).
- **Exit Criteria:** `T-10`, `T-11`, `T-14`, `T-15` pass; hold lifecycle runs smoothly from creation to fulfillment or expiry.

---

### Phase 9: No-Dues Clearance & Public OPAC Portal
- **Objective:** Statutory no-dues clearance verification and the public OPAC search portal.
- **SRS Scope:** `FR-ND-01`, `FR-ND-02`, `FR-OP-01` to `FR-OP-04`, `UC-07`, `UC-09`, `UI-1`.
- **Key Deliverables:**
  - No-dues verification screen (`/nodues`): checks active loans and unpaid fines, shortcuts to return/pay (`FR-ND-01`, `UC-09`).
  - Printable A4 No-Dues Clearance Certificate and optional account closure to `GRADUATED` (`FR-ND-02`).
  - Public OPAC portal (`/opac`): catalogue search without login, new arrivals, most borrowed titles, shelf locations (`FR-OP-01`, `FR-OP-04`).
  - Patron OPAC account dashboard: view current checkouts, due dates, fines, queue positions (`FR-OP-02`).
  - Patron hold placement and self-cancellation in OPAC (`FR-OP-03`, `UC-07`).
  - Mandatory password change on initial student/faculty OPAC login (`FR-AU-05`, `T-20`).
- **Tests:** `tests/e2e/opac-public.spec.ts`, `tests/e2e/nodues.spec.ts` (`T-16`, `T-17`, `T-20`, `T-21`).
- **Exit Criteria:** `T-16`, `T-17`, `T-20`, `T-21` pass; public OPAC strictly isolated from staff endpoints.

---

### Phase 10: Operational & Statutory Reports
- **Objective:** Implement all 13 reports viewable on screen, printable, and downloadable as CSV with UTF-8 BOM.
- **SRS Scope:** `FR-RP-01` to `FR-RP-03`, `NFR-L-02`.
- **Key Deliverables:**
  - Reports dashboard (`/reports`) providing access to all 13 required reports (`FR-RP-01`):
    1. Stock by copy status
    2. Stock and value by department
    3. Stock by library
    4. Accession register (filtered by library)
    5. Copies never issued
    6. Daily issues and returns
    7. Department-wise circulation
    8. Most borrowed titles
    9. Overdue books with days overdue and patron contacts
    10. Top borrowers
    11. Patrons by category and status
    12. Outstanding fines
    13. Fine collection register
  - Date filtering (from/to range with 30-day default) (`FR-RP-02`).
  - Formatting rules: dates display `dd-mm-yyyy`, monetary values with 2 decimal places (`FR-RP-03`).
  - CSV streaming route handler with UTF-8 BOM (`\uFEFF`) for spreadsheet compatibility (`FR-RP-02`).
- **Tests:** `tests/integration/reports.test.ts` (`T-22`).
- **Exit Criteria:** `T-22` passes; all 13 reports return HTTP 200 on screen and produce valid CSV downloads with proper date formats.

---

### Phase 11: End-to-End Acceptance, Hardening & Quality Gate
- **Objective:** Final system verification, high-concurrency performance testing, disaster recovery verification, and final quality gate sign-off.
- **SRS Scope:** All requirements, `T-01` to `T-28`, `NFR-P-01` to `05`, `NFR-R-04`.
- **Key Deliverables:**
  - Automated execution of all 28 acceptance tests (`T-01` to `T-28`).
  - Concurrency load test harness (`tests/load/circulation-load.test.ts`) validating 20 concurrent staff sessions for 10 minutes ($95\text{th percentile} < 1\text{ s}$) (`T-27`).
  - Database backup and recovery verification script validating sequence integrity (`T-28`).
  - Full Biome lint and format audit.
  - Strict TypeScript check (`tsc --noEmit`).
  - Complete verification of `docs/requirements-traceability.md`.
- **Exit Criteria:** 100% green tests; zero open defects; quality gate passed.
