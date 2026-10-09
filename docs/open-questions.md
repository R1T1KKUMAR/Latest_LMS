# RBMI Library Management System — Open Questions & Ambiguities

This document records all genuine gaps, ambiguities, inconsistencies, and formatting defects identified in `SRS_RBMI_Library_Management_System.pdf` (version 1.0, dated 28 September 2026), compared alongside `tech-stack-recommendation.pdf` and `flow-diagrams.pdf`.

Per instructions, **no answers or assumptions have been invented**. These items must be clarified by the system owner or library stakeholders.

---

## 1. Requirement ID Gaps & Formatting Defects

### 1.1 Omission of `FR-AD-03`
- **Location:** SRS Section 4.12 (*Administration (AD)*), Pages 24–25.
- **Observation:** The functional requirement IDs jump directly from `FR-AD-02` (System settings editing) to `FR-AD-04` (Audit trail browse).
- **Impact:** `FR-AD-03` is completely missing from the specification table. It is unclear whether `FR-AD-03` was intended to specify Master Data management (corresponding to permission `ADMIN_MASTERS`) or Staff Account management (corresponding to `ADMIN_USERS` / UC-11), or was accidentally deleted during drafting.

### 1.2 Truncated Text between `NFR-U-02` and `NFR-U-03`
- **Location:** SRS Section 7.4 (*Usability*), Page 37 (bottom) and Page 38 (top).
- **Observation:** At the page break, the text is split across rows:
  - `NFR-U-02`: *"Every refusal or error shall state the reason in plain language and, where possible, what to do ("Return them before"*
  - `NFR-U-03`: *"issuing new ones")."*
- **Impact:** The sentence for `NFR-U-02` was accidentally severed by table pagination, leaving `NFR-U-03` populated only with the tail of the sentence from `NFR-U-02`. The actual requirement intended for `NFR-U-03` is lost.

### 1.3 Missing Main Flow in `UC-01` (Issue a Book)
- **Location:** SRS Section 8 (*Key use cases*), Page 39–40.
- **Observation:** Use Case `UC-01` defines `Actor`, `Preconditions`, `Alternatives` (3a, 4a, 4b), and `Postconditions`, but the `Main flow` table row was omitted during layout formatting.
- **Impact:** While the main flow can be inferred from Section 4.7 (`FR-CI-02`) and the circulation desk flow diagram, the formal step-by-step text for `UC-01.Main flow` is missing in the SRS use case table.

### 1.4 Acceptance Test Table Pagination Splitting `T-03` and `T-04`
- **Location:** SRS Section 9 (*Acceptance criteria and test scenarios*), Pages 44–45.
- **Observation:** At the page break between pages 44 and 45:
  - Bottom of Page 44: `T-03` | Steps: *"Sign in as assistant"* | Expected: *"HTTP 403 page; menu shows no"* | Covers: *"FR-AU-02, NFR-"*
  - Top of Page 45: `T-04` | Steps: *"and request /admin/users"* | Expected: *"Administration group"* | Covers: *"S-01"*
  - Notice that the phrase *"Sign in as assistant and request /admin/users"* is a single continuous sentence split across two test rows labeled `T-03` and `T-04`.
  - Conversely, `tech-stack-recommendation.pdf` (Page 3, lines 116–117 & 132–133) states: *"Tests T-03, T-04 and T-15 also expect a real HTTP 403 at a named URL such as /circulation/issue... Every form carries a per-session token in a hidden field and the route handler refuses a POST without it. FR-AU-07 and test T-04 stay as written."*
- **Impact:** There is an ambiguity whether `T-04` was intended to be an explicit CSRF rejection test (testing `FR-AU-07`) or whether `T-03` and `T-04` are separate authorization checks (e.g., UI menu suppression vs direct URL access to `/admin/users`).

### 1.5 Reference to Non-Existent `FR-HO-05` in Flow Diagrams
- **Location:** `flow-diagrams.pdf`, Page 1 (line 69) and Page 4 (line 296).
- **Observation:** The flow diagram references *"FR-HO-01 to 05"*.
- **Impact:** SRS Section 4.8 only defines requirements up to `FR-HO-04`. There is no `FR-HO-05` in the SRS document.

---

## 2. Incomplete Seed and Master Data Enumeration

### 2.1 Incomplete Specification of 22 Master Data Entities in Seed Data
- **Location:** SRS Section 6.4 (`DR-08`), Section 10.4 (*Seed data used by the acceptance tests*).
- **Observation:** `DR-08` mandates that first start shall install:
  - 5 institutions
  - 5 libraries (`CL`, `ML`, `PL`, `NL`, `TL`)
  - 12 departments
  - 11 courses
  - 15 patron categories
  - 7 item types
  - 2 vendors
  - 4 roles
  - 21 permissions
  - 3 staff users
  - 20 circulation rules
  - 17 system settings
  - A training set of 17 titles, 24 copies, and 10 patrons.
  However, Section 10.4 only specifies:
  - 3 staff accounts (`admin`, `librarian`, `assistant`)
  - 4 named test patrons (`2301430100045`, `2301430100062`, `2201430100033`, `E1001`)
  - 5 named test copies (`CL000001`, `CL000007`, `CL000008`, `CL000009`, `CL000021`)
- **Impact:** The exact codes, names, and parameters for the remaining:
  - 5 institutions
  - 12 departments
  - 11 courses
  - 15 patron categories
  - 7 item types
  - 2 vendors
  - 20 circulation rules
  are not listed in the SRS text. Only a subset are referenced in examples (e.g., categories: `B.Tech Student`, `Faculty`, `Guest`; item types: `Textbook`, `Reference Book`, `General Book`, `Journal`; rule `#1`, rule `#16`). The exact canonical baseline SQL seed values must be formally supplied or confirmed.

---

## 3. Business Rule and Scope Ambiguities

### 3.1 Creation of `DAMAGE` and `MANUAL` Fines in Release 1.0
- **Location:** SRS Section 10.6 (*Glossary of status codes*) vs Section 10.5 (*Future scope*).
- **Observation:** Section 10.6 includes `DAMAGE` and `MANUAL` as valid fine types. However, Section 10.5 explicitly lists *"Manual/damage fine entry screen"* under Future Scope (not in release 1.0).
- **Impact:** Are `DAMAGE` and `MANUAL` fines purely enum values reserved for future database schema compatibility, or is there a minimal UI required in release 1.0 for staff to levy manual or damage fines?

### 3.2 Patron Hold Cancellation vs Staff Permissions
- **Location:** SRS Section 4.13 (`FR-OP-03`) vs Section 10.3 (*Permissions and default roles*).
- **Observation:** `FR-OP-03` allows a logged-in patron on the OPAC to cancel their own holds. Appendix 10.3 defines permission `HOLD_MANAGE` as a staff permission.
- **Impact:** Does patron hold cancellation in OPAC require any permission from `permissions` table, or is it strictly governed by session ownership (patron can cancel only holds where `patron_id == current_session.patron_id`)?

### 3.3 Card Expiry Calculation Precedence
- **Location:** SRS Section 4.3 (`FR-PA-03`), Section 6.1 (`courses`, `patron_categories`), Section 10.1 (*Students CSV*).
- **Observation:** `FR-PA-03` states: *"Card expiry shall default to the course end date, else admission date (or today) plus the category's validity years."*
  However:
  - The `courses` table contains `duration_years`.
  - The `patron_categories` table contains `card_validity_years`.
  - The CSV import for students contains `course_end_date` and `admission_date`.
- **Impact:** When `course_end_date` is not provided in a patron registration or CSV row, does the system calculate the expiry as `admission_date + courses.duration_years` or `admission_date + patron_categories.card_validity_years`?

### 3.4 Inactive Staff User Audit Association on Deletion/Deactivation
- **Location:** SRS Section 4.1 (`FR-AU-04`), Section 6.1 (`users`), Section 6.2 (`DR-02`).
- **Observation:** Staff accounts are never physically deleted (`DR-02`, `is_active` flag).
- **Impact:** If an inactive user has historical records (loans, payments, audit logs), the schema enforces referential integrity. What occurs if a library administrator attempts to change a user's role while they have active loans or sessions? The spec specifies session expiry and server-side authorization check per request, but immediate termination of active sessions upon staff deactivation is not explicitly specified.

---

## 4. Technical Stack Differences (SRS vs Approved Stack)

As documented in `tech-stack-recommendation.pdf` and approved in `CLAUDE.md`, the following clauses of SRS v1.0 are superseded:

| SRS Clause | SRS v1.0 Mandate | Approved Technical Stack | Status |
| :--- | :--- | :--- | :--- |
| **C-1** | Java 8, Servlet 3.0, Ant project for NetBeans 8.0.2 | Node.js 26.x, TypeScript 7 (strict mode), pnpm 12 | Superseded |
| **C-2** | Dependencies bundled in WAR; no CDN | Dependencies bundled in Next.js standalone build; no CDN | Superseded |
| **C-3** | JDBC with prepared statements; no ORM | Drizzle ORM (typed queries, parameterized SQL) with drizzle-kit | Superseded |
| **C-4** | State in Derby database | State in PostgreSQL 18.x database | Superseded |
| **C-5** | Server-rendered JSP and JSTL | Server-rendered React 19 / Next.js 16 App Router | Superseded |
| **Sec 2.4** | Tomcat on 8080, Derby on 1527, NetBeans | Node.js 26, PostgreSQL 18 on 5432, Next.js | Superseded |
| **Sec 3.4** | `derbyclient.jar`, `web.xml` parameters | PostgreSQL client driver (`postgres`), environment variables | Superseded |
| **CI-2** | DRDA protocol on port 1527 | PostgreSQL protocol on port 5432 (local to server) | Superseded |
| **CI-3** | No internet at build or run time | Connected build allowed; strictly offline at runtime | Superseded |
| **FR-AU-08** | PBKDF2-SHA256, 65,536 iterations | Argon2id via `node:crypto` | Superseded |
| **FR-ST-01** | Schema installation via bundled SQL scripts | Drizzle migrations (`drizzle-kit migrate`) & seed script | Superseded |
| **DR-07** | Derby responsive at design volume | PostgreSQL responsive at design volume with indexes | Superseded |
| **NFR-C-01..03** | Tomcat 7–9, Derby 10.11–10.14 | Node.js 26 on Windows/Linux, PostgreSQL 18 | Superseded |
| **NFR-M-01** | One servlet, service, DAO per module; no framework | Next.js App Router (route handlers, services, repositories) | Superseded |
| **NFR-M-04** | Java 8 level, Javadoc | TypeScript strict mode, TSDoc | Superseded |
| **NFR-R-03** | Connections opened per request | Connection pool with automatic reconnection | Superseded |
| **NFR-R-04 / T-28** | Derby `SYSCS_BACKUP_DATABASE` | `pg_dump` / `pg_basebackup` | Superseded |
| **Section 9** | Acceptance on JDK 8, Tomcat 8, Derby 10.14 | Acceptance on Node.js 26, PostgreSQL 18 on Windows | Superseded |
