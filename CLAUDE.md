# RBMI Library Management System — Claude Code Instructions

## PROJECT

Build the complete RBMI Library Management System from the supplied SRS.

This is a production-oriented library management application.

The supplied SRS and approved technical specification are the source of truth.

Do not invent missing business requirements.

Do not remove requirements because they appear inconvenient.

Do not replace an SRS rule with a "simpler" implementation.

If the SRS is ambiguous, stop and report the ambiguity instead of silently inventing behavior.

---

# SOURCE OF TRUTH

Read all files inside:

docs/

Before implementing a feature, identify the relevant:

- Functional requirements
- Business rules
- Non-functional requirements
- Use cases
- Acceptance tests
- Data model
- CSV specifications
- Permission matrix
- Status transitions
- Flow diagrams

Maintain traceability between requirements and implementation.

Create:

docs/requirements-traceability.md

with:

Requirement ID
Description
Implementation location
Test location
Status

---

# APPROVED TECHNOLOGY

Use:

- Node.js 26
- TypeScript 7 strict mode
- Next.js 16.x App Router
- React 19.x
- PostgreSQL 18.x
- Drizzle ORM
- Zod
- Tailwind CSS
- shadcn/ui
- Vitest
- Playwright
- Biome
- Pino
- pnpm

Do not introduce another framework unless explicitly required.

Do not introduce an unnecessary authentication library.

Use the approved session-table architecture.

---

# ARCHITECTURE

Use:

Next.js App Router
        ↓
Route/Page layer
        ↓
Service layer
        ↓
Repository/data-access layer
        ↓
PostgreSQL

Business rules must remain independent from database access wherever possible.

Rules such as circulation eligibility and fine calculations should be pure TypeScript functions.

---

# DIRECTORY STRUCTURE

Use this structure unless the SRS requires a justified change:

app/
components/
services/
repositories/
db/
rules/
imports/
reports/
tests/
public/

Also create supporting directories where useful:

lib/
types/
config/
scripts/
docs/

---

# SECURITY

Security is mandatory.

Implement:

- Argon2id password hashing
- Secure sessions
- HttpOnly cookies
- Server-side authorization
- Role-based permissions
- CSRF protection
- Input validation
- Parameterized database access
- PostgreSQL constraints
- Append-only audit log
- Safe error messages
- No sensitive information in logs

Never rely only on UI permission hiding.

Every protected operation must be authorized server-side.

Unauthorized requests must return HTTP 403 where required by the SRS.

---

# DATABASE

PostgreSQL is the source of persistent state.

Implement the complete SRS data model.

Do not arbitrarily redesign the database.

Preserve:

- Tables
- Relationships
- Constraints
- Views
- Sequences
- Status values
- Required indexes
- Required uniqueness rules

Use migrations.

Do not manually mutate production schema from application startup.

Seed only approved seed/reference data.

---

# TRANSACTIONS

Operations that change multiple related records must be atomic.

Especially:

- Issue
- Return
- Renew
- Lost
- Hold fulfillment
- Fine payment
- Fine waiver
- No-dues
- Imports where specified

Prevent race conditions.

Book-copy issuance must prevent two circulation desks from issuing the same copy simultaneously.

---

# AUDIT

Audit important actions.

Audit at minimum:

- Login
- Failed login
- Issue
- Return
- Renew
- Lost
- Hold
- Payment
- Waiver
- Import
- Settings changes
- Permission failures
- Other SRS-required actions

Audit records are append-only.

Never expose an endpoint that allows ordinary users to edit/delete audit records.

---

# UI

The system must work on the LAN without runtime internet access.

Do not depend on CDN assets.

Use local fonts/assets where required.

Use server-rendered HTML wherever practical.

Forms must continue to work without JavaScript where required by the SRS.

Client-side JavaScript should only be used where actually needed, such as scanner focus, tabs, confirmation dialogs, etc.

---

# ERROR HANDLING

Every operation must have:

- Validation
- Business-rule checking
- Transaction handling
- User-readable error
- Audit entry where required

Never silently swallow errors.

Never expose database stack traces to users.

Log technical errors server-side.

---

# TESTING

Every business rule requires unit tests.

Use Vitest for:

- BR-01 through BR-09
- Fine calculations
- Rule selection
- Eligibility
- State transitions

Use Playwright for end-to-end workflows.

Do not mark a feature complete until tests exist.

---

# QUALITY GATE

After every implementation phase:

1. Run formatting.
2. Run lint.
3. Run TypeScript checking.
4. Run unit tests.
5. Run relevant integration tests.
6. Run relevant Playwright tests.
7. Inspect database migrations.
8. Check authorization.
9. Check audit behavior.
10. Update requirements traceability.

Never proceed while there are failing tests unless the failure is explicitly documented.

---

# IMPORTANT

Do not generate fake placeholder functionality and call it complete.

Do not use TODO comments as a substitute for implementation.

Do not implement only the UI.

The system must include:

UI
business logic
database
validation
authorization
transactions
audit
tests
printing
imports
reports
deployment configuration

---

# DEVELOPMENT METHOD

Work phase by phase.

Before coding a phase:

1. Read the relevant SRS sections.
2. Identify dependencies.
3. State the files that will change.
4. Implement.
5. Test.
6. Verify against requirements.
7. Report completed requirements.
8. Report anything genuinely ambiguous.

Do not jump ahead to later phases.

---

# DEFINITION OF DONE

A feature is DONE only when:

- It is implemented.
- It is connected to PostgreSQL.
- Validation exists.
- Authorization exists.
- Error handling exists.
- Audit behavior exists where required.
- Unit tests exist where applicable.
- E2E tests exist where applicable.
- UI works.
- Accessibility is reasonable.
- TypeScript passes.
- Lint passes.
- Tests pass.
- Requirement traceability is updated.