# RBMI Library Management System — Testing Specification

This document provides the formal testing strategy, complete test scenario mapping (`T-01` to `T-28`), test harnesses, and quality gate standards for the RBMI Library Management System, derived from Sections 7, 8, 9, and 10 of the SRS and adapted to Vitest and Playwright per the approved technical stack.

---

## 1. Testing Frameworks & Architecture

- **Unit & Business Logic Testing:** **Vitest 5.x**
  - Pure TypeScript tests for `rules/` (`BR-01` to `BR-09`, rule resolution, scoring, fine mathematics, eligibility, state machine transitions).
  - Fast execution in-memory with zero database or network dependencies.
- **Integration & Transaction Testing:** **Vitest 5.x** (with transactional test database)
  - Database service tests verifying atomicity, concurrency locking (`SELECT ... FOR UPDATE`), transaction rollback, and constraints.
- **End-to-End Workflow Testing:** **Playwright 1.63+**
  - Headless browser tests simulating real operator workflows: barcode scanner input, OPAC patron workflows, bulk import preview/commit, and report downloads.
- **Load & Performance Testing:** **k6** or Vitest concurrency harness (verifying `T-27`).

---

## 2. Complete Acceptance Test Matrix (`T-01` to `T-28`)

Every acceptance scenario from SRS Section 9 is catalogued below with its implementation and verification target:

| Test ID | Test Scenario | Steps | Expected Outcome | Requirements Covered | Test Type & Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `T-01` | First start on empty database | Start application with empty PostgreSQL database. | Migrations and seed data applied; 73+ statements run; login page loads; `admin` / `Admin@123` signs in. | `FR-ST-01`, `FR-AU-01` | Integration: `tests/integration/startup.test.ts` |
| `T-02` | Database unreachable & recovery | Start app with DB down, verify UI, then start DB and reload. | Login page displays "Database not reachable" error; after DB starts, login recovers without process restart. | `FR-ST-02`, `NFR-R-03` | Integration: `tests/integration/db-failover.test.ts` |
| `T-03` | Assistant Librarian role restriction | Sign in as `assistant` and navigate to `/admin/rules`. | HTTP 403 Forbidden page returned; sidebar menu shows no Administration group. | `FR-AU-02`, `NFR-S-01` | Playwright: `tests/e2e/auth-roles.spec.ts` |
| `T-04` | CSRF & unpermitted direct URL POST | Submit state-changing POST to `/admin/users` as assistant or without CSRF token. | Request refused with HTTP 403 Forbidden; no user created; failure logged in audit trail. | `FR-AU-02`, `FR-AU-07`, `NFR-S-01`, `NFR-S-04` | Playwright: `tests/e2e/csrf-guard.spec.ts` |
| `T-05` | Standard book checkout | Issue copy `CL000009` to student `2301430100062` (no overdues). | Loan created, due today + 14 days; message names rule #1; copy status becomes `ISSUED`. | `FR-CI-02`, `BR-02`, `BR-05` | Integration: `tests/integration/circulation.test.ts` |
| `T-06` | Reference item issue refusal | Issue copy `CL000021` (reference) to B.Tech student `2301430100062`. | Refused: *"Reference Book items are not issued to B.Tech Student (rule #16)"*. | `BR-04`, `FR-CI-02` | Unit: `tests/unit/rules-engine.test.ts` |
| `T-07` | Reference item issue to faculty | Issue copy `CL000021` to faculty `E1001`. | Loan created for 3 days per winning rule (*Faculty + Reference*, score 3). | `BR-02`, `BR-04` | Unit: `tests/unit/rules-engine.test.ts` |
| `T-08` | Overdue issue blocking | Issue any copy to student `2301430100045` (has overdue loan). | Refused: *"Patron has overdue books. Return them before issuing new ones"*. | `BR-08`, `FR-CI-02` | Unit: `tests/unit/rules-engine.test.ts` |
| `T-09` | Overdue return fine calculation | Return copy `CL000001` (12 days overdue, ₹2/day). | Loan marked `RETURNED`; fine of ₹24.00 created with status `OUTSTANDING`; message notes 12 days late. | `FR-CI-03`, `BR-06` | Integration: `tests/integration/fines.test.ts` |
| `T-10` | Hold assignment upon return | Return copy `CL000007` while a hold is `WAITING` for the title. | Copy becomes `RESERVED`; hold becomes `AVAILABLE_FOR_PICKUP` with expiry today + 2; desk alert names patron and mobile. | `FR-HO-03`, `FR-CI-03` | Integration: `tests/integration/holds.test.ts` |
| `T-11` | Reserved copy issue control | Attempt to issue `CL000007` to other patron, then to hold patron. | First attempt refused naming hold patron; second attempt succeeds with *"Reservation fulfilled"*; hold `COMPLETED`. | `FR-CI-02`, `FR-HO-03` | Integration: `tests/integration/holds.test.ts` |
| `T-12` | Consecutive renewal limit | Renew loan 3 times where `max_renewals = 2`. | Third renewal refused: *"Maximum renewals (2) already used"*. | `FR-CI-04`, `BR-05` | Unit: `tests/unit/rules-engine.test.ts` |
| `T-13` | Mark book lost | Mark loan lost for copy priced ₹750, processing fee ₹50, on time. | Copy status `LOST`; loan `LOST`; fine `LOST` created for ₹800.00 (`750 + 50`). | `FR-CI-05`, `BR-07` | Integration: `tests/integration/circulation.test.ts` |
| `T-14` | Cash fine payment & receipt | Pay ₹12.00 fine in cash by assistant librarian. | Receipt `RCPT-YYYY-00001` generated; fine status becomes `PAID`; payment row records staff name. | `FR-FI-02`, `FR-FI-03` | Integration: `tests/integration/fines.test.ts` |
| `T-15` | Fine waiver authorization | Attempt to waive fine as assistant, then waive as librarian. | Assistant receives HTTP 403; Librarian succeeds: fine becomes `WAIVED`, waiver receipt generated. | `FR-FI-04`, `FR-AU-02` | Playwright: `tests/e2e/fines-waiver.spec.ts` |
| `T-16` | Hold placement refusal on shelf copy | Place hold from OPAC on title with an available copy on shelf. | Refused: *"Copies are available on the shelf"*. | `FR-HO-01`, `FR-OP-03` | Playwright: `tests/e2e/opac-holds.spec.ts` |
| `T-17` | Hold placement & cancellation | Place hold on fully issued title, view account, then cancel. | Hold created `WAITING`, queue position 1 displayed; cancellation succeeds and hold status becomes `CANCELLED`. | `FR-HO-01`, `FR-OP-03` | Playwright: `tests/e2e/opac-holds.spec.ts` |
| `T-18` | Bulk book import validation & commit | Upload `books_sample.csv` (16 rows, 3 bad rows). | Preview shows 13 OK, 3 ERROR; commit creates 13 titles / 26 copies; accession numbers allocated sequentially. | `FR-BI-02` to `05` | Integration: `tests/integration/import-books.test.ts` |
| `T-19` | Bulk student import & deduplication | Upload `students_sample.csv` (15 rows, 3 bad), then upload same file again. | First run: 12 imported, 3 skipped; Second run: all 15 rejected as duplicates, 0 new rows written. | `FR-PI-03` to `05` | Integration: `tests/integration/import-students.test.ts` |
| `T-20` | Student initial OPAC login | Sign in to OPAC as newly imported student using roll number as password. | Forces password change modal; password change succeeds; old password rejected on subsequent login. | `FR-AU-05`, `FR-OP-03` | Playwright: `tests/e2e/opac-auth.spec.ts` |
| `T-21` | No-dues clearance verification | Run no-dues for patron with active loan, then after return & payment. | First: dues pending, certificate blocked; Second: certificate generated, account marked `GRADUATED`; audit `NODUES`. | `FR-ND-01`, `FR-ND-02` | Playwright: `tests/e2e/nodues.spec.ts` |
| `T-22` | All 13 reports verification | Open every report on screen and download as CSV. | HTTP 200 for all 13; CSV files contain UTF-8 BOM, valid headers, and dates formatted `dd-mm-yyyy`. | `FR-RP-01` to `03` | Integration: `tests/integration/reports.test.ts` |
| `T-23` | System setting dynamic update | Modify `LIBRARY_NAME` in Administration $\to$ Settings. | New library name immediately renders in sidebar and OPAC without server restart. | `FR-AD-02` | Playwright: `tests/e2e/settings.spec.ts` |
| `T-24` | Dynamic circulation rule addition | Add rule *Faculty + Journal* (3 books, 7 days), then issue journal to faculty. | Journal issued immediately per the new rule without application restart. | `FR-AD-01`, `BR-02` | Integration: `tests/integration/circulation.test.ts` |
| `T-25` | Barcode label & ID card printing | Generate barcode labels for `CL000001`–`CL000010` and print library card. | Code 128 SVG barcodes render crisp lines; scans accurately into desk input via physical scanner. | `FR-PR-01`, `FR-CA-07`, `FR-PA-07` | Playwright: `tests/e2e/printing.spec.ts` |
| `T-26` | Append-only audit trail verification | Inspect audit trail after running `T-05` to `T-15`. | Every transaction and refusal logged with timestamp, actor, entity, entity ID, and client IP. | `FR-AT-01`, `FR-AT-02` | Integration: `tests/integration/audit.test.ts` |
| `T-27` | High-concurrency load test | 20 concurrent staff sessions issuing and returning for 10 minutes on design volume. | 95th percentile response time $< 1.0\text{ s}$; 0 concurrency errors or deadlock exceptions. | `NFR-P-01`, `NFR-P-04` | Performance: `tests/load/circulation-load.test.ts` |
| `T-28` | Database backup & restore | Perform online `pg_dump`, restore to fresh PostgreSQL instance, restart app. | All tables and sequences present; sequence continuation verified without receipt collisions. | `NFR-R-04` | Integration: `tests/integration/backup-restore.test.ts` |

---

## 3. Dedicated Rule Engine Unit Test Plan (`tests/unit/rules-engine.test.ts`)

Pure Vitest test suites executing against TypeScript functions in `rules/`:
1. **Scoring Algorithm:**
   - Library match (4) + Item type match (2) + Category match (1) = 7 (maximum score).
   - Test fallback to default rules when score is 0.
   - Verify tie-breaking rules.
2. **Zero-Limit Rules (`BR-03`):**
   - Assert `max_books = 0` rejects issue with proper message.
   - Assert `loan_days = 0` rejects issue with proper message.
3. **Reference Item Restriction (`BR-04`):**
   - Assert non-named reference item is rejected even if patron category rule has high score.
   - Assert named reference item rule successfully issues.
4. **Fine Math & Edge Cases (`BR-06`, `BR-07`):**
   - Return within due date $\to$ ₹0.00 fine.
   - Return within grace days $\to$ ₹0.00 fine.
   - Return after grace days $\to$ `(days_late - grace_days) * fine_per_day`.
   - Capping at `max_fine` when fine exceeds cap.
   - Lost fee calculation with copy price, fallback to title price, plus processing fee and late fine.
5. **Issue & Renewal Eligibility (`BR-08`, `BR-09`):**
   - Block on patron expired card date.
   - Block on patron non-active status.
   - Block on overdue loan when `BLOCK_ISSUE_IF_OVERDUE = true`.
   - Block on outstanding fines $\ge$ `FINE_BLOCK_LIMIT`.
   - Block on renewal when consecutive limit reached or title is held by another patron.

---

## 4. Quality Gate & Definition of Done (CLAUDE.md)

Before marking any phase or requirement complete:
1. **Code Formatting:** `pnpm biome format .` executes cleanly.
2. **Linting:** `pnpm biome lint .` produces 0 errors and 0 warnings.
3. **Type Checking:** `pnpm tsc --noEmit` passes in strict mode.
4. **Unit Tests:** `pnpm vitest run tests/unit` passes 100%.
5. **Integration Tests:** `pnpm vitest run tests/integration` passes 100%.
6. **E2E Playwright Tests:** `pnpm playwright test` passes 100%.
7. **Traceability:** Corresponding requirement rows in `docs/requirements-traceability.md` are updated to `Implemented` and `Verified`.
