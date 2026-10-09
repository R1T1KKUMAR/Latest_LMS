# RBMI Library Management System — Implementation Specification

This document provides the foundational engineering and architectural specification for the RBMI Library Management System. It establishes how the approved technical stack maps to and fulfills the SRS requirements, following the directives of `CLAUDE.md` and `tech-stack-recommendation.pdf`.

---

## 1. System Architecture & Layering

The system is structured as a monolithic server application running locally on a campus LAN server alongside PostgreSQL:

```
[ Browser Clients (Staff Desk / Student OPAC / Scanners) ]
                         │
                         ▼ HTTP (Port 8080 or 3000)
┌────────────────────────────────────────────────────────┐
│              Next.js 16 App Router                     │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Route & Page Layer (App Router / Route Handlers) │  │
│  │ - Server Components (HTML rendering, zero JS)    │  │
│  │ - Route Handlers (POST mutations, real HTTP 403) │  │
│  │ - Proxy / Middleware (Session & Role guards)     │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │                            │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │ Service Layer (app/services/)                    │  │
│  │ - Atomic transactions (db.transaction)           │  │
│  │ - Concurrency locks (SELECT ... FOR UPDATE)      │  │
│  │ - Audit trail emission                           │  │
│  └──────────┬───────────────────────────┬───────────┘  │
│             │                           │              │
│  ┌──────────▼───────────────┐ ┌─────────▼───────────┐  │
│  │ Pure Rules Engine        │ │ Data Access Layer   │  │
│  │ (rules/)                 │ │ (repositories/ & db)│  │
│  │ - BR-01 to BR-09         │ │ - Drizzle ORM       │  │
│  │ - Fine maths & caps      │ │ - Parameterized SQL │  │
│  │ - Zero DB dependencies   │ │ - PostgreSQL 18     │  │
│  └──────────────────────────┘ └─────────┬───────────┘  │
│                                         │              │
└─────────────────────────────────────────┼──────────────┘
                                          ▼ Port 5432
                         ┌────────────────────────────────┐
                         │   PostgreSQL 18 Database       │
                         │   (22 Tables, 6 Views, 2 Seqs) │
                         └────────────────────────────────┘
```

---

## 2. Approved Technical Stack & SRS Evolution

The legacy SRS stack (Java 8, Tomcat 8, Apache Derby 10.14, JSP/JSTL, Ant) has been superseded by the modern production stack approved in `CLAUDE.md`:

| Functional Layer | Approved Stack Component | Version | Rationale & SRS Fulfillment |
| :--- | :--- | :---: | :--- |
| **Runtime** | Node.js | 26.10 LTS | Unified JavaScript/TypeScript runtime for server, rules, and scripts; active LTS through April 2029. |
| **Language** | TypeScript (Strict Mode) | 7.0 | Type safety, strict null checks, eliminates runtime casting bugs (`NFR-M-04`). |
| **Web Framework**| Next.js App Router | 16.3 | Server-rendered HTML, native `<form>` handling, robust route handlers (`UI-1` to `UI-7`). |
| **UI Library** | React | 19.3 | Server Components for streaming and templating without client JS bundle overhead. |
| **Database** | PostgreSQL | 18.6 | Production relational database, robust transaction isolation, partial indexes, active LTS (`DR-01` to `DR-07`). |
| **Data Access** | Drizzle ORM & drizzle-kit | 0.45 / 0.31 | Fully typed SQL queries, zero hidden magic, migration generation, 100% parameterized SQL (`C-3`, `NFR-S-03`). |
| **Validation** | Zod | 4.6 | Schema parsing and validation for CSV imports and form payloads (`FR-PA-01`, `FR-PI-03`, `FR-BI-02`). |
| **Styling** | Tailwind CSS & shadcn/ui | 4.3 | Locally bundled design system, responsive layouts (`UI-5`, `UI-6`), print stylesheets (`@page`). |
| **Auth / Crypto** | Argon2id (`node:crypto`) | Node native | Built-in password hashing; session table with HttpOnly cookies (`FR-AU-08`, `NFR-S-02`, `NFR-S-04`). |
| **CSV Parsing** | `csv-parse` & `iconv-lite` | 7.0 / 0.7 | RFC 4180 parsing, UTF-8 BOM stripping, Windows-1252 decoding (`FR-PI`, `FR-BI`, Section 3.4). |
| **Barcodes** | `bwip-js` | 4.11 | Server-side Code 128 SVG barcode generation (`FR-PR-01`, `FR-CA-07`, `FR-PA-07`). |
| **Unit Testing** | Vitest | 5.0 | High-speed unit tests for rules engine and isolated business logic (`BR-01` to `BR-09`, `NFR-M-05`). |
| **E2E Testing** | Playwright | 1.63 | Multi-browser workflow tests for scanner input, OPAC, and reports (`Section 9`). |
| **Linter / Format**| Biome | 2.5 | Fast linter and formatter enforcing code standards across the project. |
| **Logging** | Pino | 10.3 | High-throughput structured JSON logging without leaking sensitive data (`FR-ST-01`, `NFR-S-02`). |
| **Package Mgr** | pnpm | 12 | Deterministic workspace package management with reproducible lockfiles. |

---

## 3. Directory & Module Structure (CLAUDE.md)

```
LMS/
├── app/                  # Next.js App Router (Pages, Layouts, Route Handlers)
│   ├── (auth)/           # Staff & OPAC login routes
│   ├── (staff)/          # Protected staff back-office & desk routes
│   │   ├── dashboard/    # Staff landing page & metrics
│   │   ├── circulation/  # Issue, return, renew, lost desk
│   │   ├── catalogue/    # Bib records, copies, labels
│   │   ├── patrons/      # Patron records, card printing
│   │   ├── imports/      # Bulk CSV import workflows
│   │   ├── fines/        # Fine collection & waiver
│   │   ├── nodues/       # No-dues clearance certificate
│   │   ├── reports/      # 13 operational & statutory reports
│   │   └── admin/        # Rules, settings, masters, users, audit
│   ├── opac/             # Public catalogue search & patron account
│   ├── barcode/          # Code 128 SVG generation endpoint (/barcode)
│   └── api/              # Route handlers for POST transactions & CSV streaming
├── components/           # UI components (shadcn/ui, navigation, print layouts)
├── services/             # Business transaction orchestrators (db.transaction)
├── repositories/         # Drizzle database queries and data mappers
├── db/                   # Database schema, migrations, connection pool, seed data
│   ├── schema/           # Drizzle table and view definitions
│   └── migrations/       # Versioned SQL migration files
├── rules/                # Pure TypeScript circulation rules engine (BR-01 to BR-09)
├── imports/              # CSV parsing, mapping, and validation logic
├── reports/              # SQL report aggregations and CSV streaming generators
├── tests/                # Test suites
│   ├── unit/             # Vitest pure business rule tests
│   ├── integration/      # Vitest database transaction tests
│   ├── e2e/              # Playwright browser workflow tests
│   └── fixtures/         # Sample CSV files (books_sample.csv, etc.)
├── public/               # Local fonts, static images, favicon (zero CDN dependencies)
├── lib/                  # Utilities (Argon2id, date helpers, money formatting)
├── types/                # Shared TypeScript models and interfaces
├── config/               # App configuration and environment variable schemas
├── scripts/              # Migration runners, backup/restore scripts, seed runners
└── docs/                 # Specifications and requirements traceability
```

---

## 4. Authentication, Session & Authorization Architecture

### 4.1 Argon2id Password Security (`FR-AU-08`, `NFR-S-02`)
- Hashes are created using Node's built-in `crypto.argon2` (or approved fallback algorithm if runtime constraints dictate).
- Passwords are never logged, exported, or exposed in error messages.
- Plaintext passwords in database seeds are prohibited (`DR-09`).

### 4.2 Database-Backed Session Architecture (`NFR-S-04`, `NFR-S-05`)
- Sessions are stored in the `sessions` table in PostgreSQL.
- Two distinct session classes:
  - `STAFF`: Associated with `users(id)`. Authenticates access to staff menus and actions.
  - `PATRON`: Associated with `patrons(id)`. Authenticates access to OPAC My Account and Hold creation.
- Session IDs are cryptographically secure 128-bit strings renewed upon login to eliminate session fixation.
- Delivered to clients via `HttpOnly`, `SameSite=Lax`, secure cookies.
- Idle session timeout: 60 minutes (`FR-AU-06`).

### 4.3 CSRF Protection (`FR-AU-07`, `T-04`)
- Every active session generates a cryptographic CSRF token.
- Every state-mutating form `<form method="post">` carries a `<input type="hidden" name="csrf_token" value="..." />` field.
- Route handlers verify the submitted token against the session token. Requests with missing or invalid tokens are rejected with **HTTP 403 Forbidden**.

### 4.4 Server-Side Authorization (`FR-AU-02`, `NFR-S-01`)
- Every route handler and server action evaluates permissions via a server-side helper:
  ```typescript
  export async function requirePermission(permission: PermissionCode): Promise<StaffSession> {
    const session = await getStaffSession();
    if (!session || !session.permissions.includes(permission)) {
      await logAudit({
        actor_type: session ? 'STAFF' : 'ANONYMOUS',
        actor_name: session?.username ?? 'Anonymous',
        action: 'PERMISSION_DENIED',
        details: `Access denied for required permission: ${permission}`
      });
      throw new HttpError(403, 'Access Denied: Missing required permission');
    }
    return session;
  }
  ```

---

## 5. Concurrency Control & Database Transactions

### 5.1 Concurrency Prevention on Desk Checkout
To prevent two circulation desks from issuing the same physical copy simultaneously (`CLAUDE.md`, `NFR-R-01`):
```typescript
await db.transaction(async (tx) => {
  // 1. Lock the copy row with SELECT FOR UPDATE
  const [copy] = await tx
    .select()
    .from(items)
    .where(eq(items.barcode, barcode))
    .for('update');

  if (copy.status !== 'AVAILABLE' && copy.status !== 'RESERVED') {
    throw new Error(`Copy cannot be issued (status: ${copy.status})`);
  }

  // 2. Perform business checks and create loan
  // 3. Update copy status to ISSUED
  // 4. Record audit entry
});
```

### 5.2 Transactional Atomicity (`NFR-R-01`)
The following multi-table workflows run inside atomic `db.transaction` blocks:
- **Issue:** Insert `loans`, update `items.status = 'ISSUED'`, update `holds.status = 'COMPLETED'` (if fulfilling hold), insert `audit_logs`.
- **Return:** Update `loans.status = 'RETURNED'`, update `items.status`, create `fines` (if late), assign `holds` (if waiting), insert `audit_logs`.
- **Renew:** Update `loans.due_date` and `renewal_count`, insert `audit_logs`.
- **Lost:** Update `loans.status = 'LOST'`, update `items.status = 'LOST'`, insert `fines` (LOST), insert `audit_logs`.
- **Payment:** Update `fines.paid_amount` and `status`, insert `payments`, allocate receipt sequence, insert `audit_logs`.
- **Waiver:** Update `fines.status = 'WAIVED'`, insert waiver `payments`, allocate receipt sequence, insert `audit_logs`.
- **No-Dues Clearance:** Update `patrons.status = 'GRADUATED'` (if chosen), insert `audit_logs`.

---

## 6. Scanner-First UX & Offline Operation

1. **Zero Runtime Internet Access (`C-2`, `CI-1`, `CI-3`):**
   - Zero CDN links (`<link>` or `<script>`).
   - Fonts bundled locally via `next/font/local`.
   - Application build is standalone (`output: 'standalone'`).
2. **Scanner-Optimized Desk (`UI-3`, `NFR-U-01`):**
   - Circulation desk inputs default autofocus to Patron ID field on page load.
   - Upon patron scan, focus moves to Copy Barcode field.
   - Barcode scanners emit a trailing `Enter` keypress, immediately submitting the native HTML form without mouse interaction.
3. **Graceful No-JavaScript Operation (`NFR-C-04`):**
   - All state mutations are standard HTML `<form method="post">` submissions targeting Route Handlers.
   - Handlers respond with redirect status codes (`303 See Other`) and cookie/flash notifications, functioning seamlessly even if client JavaScript is disabled.

---

## 7. Printing & Report Export Specifications

### 7.1 Printing Implementations (`HW-2`, `UI-5`)
Print operations utilize the browser's standard print dialog with dedicated CSS `@page` media rules:
- **Spine & Barcode Labels (`FR-CA-07`, `T-25`):** Standard A4 label sheets (4 labels across per row, 24–30 labels per sheet). Includes library name, call number, accession number, title, and SVG Code 128 barcode.
- **Library Cards (`FR-PA-07`, `T-25`):** Standard ISO ID-1 card dimensions ($86 \times 54\text{ mm}$). Features institution name, library title, patron photo placeholder, card number, roll/employee ID, department, validity dates, and barcode.
- **Payment & Waiver Receipts (`FR-FI-03`, `T-14`):** A5 format detailing receipt number (`RCPT-YYYY-NNNNN`), patron details, payment date, fine breakdown, amount received, payment method, cashier name, and institutional seal.
- **No-Dues Certificate (`FR-ND-02`, `T-21`):** A4 certificate certifying all library items returned and dues cleared. Contains student details, verification timestamp, issuing authority signature block, and account status closure note.

### 7.2 Barcode Endpoint (`FR-PR-01`)
- Endpoint: `GET /barcode?text={text}&w={width}&h={height}&label={label}`
- Implementation: Invokes `bwip-js` server-side to generate pure Code 128 `image/svg+xml`.

### 7.3 Report Data Streaming (`FR-RP-02`, `T-22`)
- Endpoint: `GET /reports/{reportName}?format=csv&from={fromDate}&to={toDate}`
- Implementation: Streams data directly from SQL views using `csv-stringify` or formatted buffer. Prefixes the stream with UTF-8 BOM (`\uFEFF`) to ensure seamless character rendering in Microsoft Excel. Displays dates as `dd-mm-yyyy` and monetary values with two decimals (`FR-RP-03`).

---

## 8. Backup & Disaster Recovery Architecture (`NFR-R-04`, `T-28`)

1. **Online Backup Procedure:**
   - Backups are taken while the application is active using PostgreSQL's standard tooling:
     ```bash
     pg_dump -U lms_app -F c -b -v -f /backups/lms_backup_$(date +%Y%m%d_%H%M%S).dump lms
     ```
2. **Automated Scheduled Retention:**
   - Nightly backup script retaining daily snapshots for 30 days and weekly snapshots for 1 year.
3. **Disaster Recovery Restoration:**
   - Database restore executed via:
     ```bash
     pg_restore -U postgres -d lms_restored -v /backups/lms_backup_target.dump
     ```
   - Automated integration test `tests/integration/backup-restore.test.ts` executes a full dump, restores into a temporary test database, and validates that sequence values (`seq_card_no`, `seq_receipt_no`) continue sequentially without generating duplicate primary or receipt numbers (`T-28`).
