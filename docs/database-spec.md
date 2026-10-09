# RBMI Library Management System — Database Specification

This document provides the definitive database specification for the RBMI Library Management System, derived from Section 6 and Section 10 of the SRS and adapted to PostgreSQL 18.x with Drizzle ORM per the approved technical stack.

---

## 1. Summary of Database Objects

- **Tables:** 22 domain tables (as defined in SRS Section 6.1) + 1 authentication `sessions` table (as approved in `CLAUDE.md` and `tech-stack-recommendation.pdf`). Total: 23 tables.
- **Views:** 6 read-only SQL views supporting reports, dashboards, and circulation.
- **Sequences:** 2 distinct sequences for numbering (`seq_card_no`, `seq_receipt_no`).
- **Storage Engine:** PostgreSQL 18.x.

---

## 2. Global Data Conventions & Integrity Rules

1. **Identity Keys:** Every table has an auto-incrementing integer identity primary key named `id` (`SERIAL` or `INTEGER GENERATED ALWAYS AS IDENTITY`).
2. **Foreign Keys:** Foreign keys are explicitly typed and named `<entity>_id` referencing the target entity's `id`.
3. **Codes:** Master and reference codes are uppercase unique strings (`VARCHAR(30)` or `VARCHAR(50)`).
4. **Money:** Monetary columns use `NUMERIC(10, 2)` (Indian Rupees, `₹`).
5. **Dates & Timestamps:**
   - Calendar dates use `DATE`.
   - Audit/event timestamps use `TIMESTAMP WITH TIME ZONE` (default `CURRENT_TIMESTAMP`).
   - Mutable domain tables include `created_at` and `updated_at`.
6. **Deletion Rule (DR-02, DR-06):** No operational data is ever physically deleted. Foreign keys use `ON DELETE RESTRICT` (or `NO ACTION`). Inactivation is handled via `is_active` flags or domain status codes.
7. **Text Limits (DR-05):**
   - Title / Subtitle / Authors / Keywords / Address: 500 characters.
   - Publisher: 200 characters.
   - Names (First, Middle, Last, Full Name): 60 characters.
   - Summary / Notes: 4000 characters.
   - Reason / Remarks / Details: 500 characters.

---

## 3. Sequences

```sql
-- Sequence for auto-generating library card numbers when roll/employee ID is absent (FR-PA-02, 5.2)
CREATE SEQUENCE IF NOT EXISTS seq_card_no
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;

-- Sequence for auto-generating unique receipt numbers across payments and waivers (FR-FI-03, 5.2)
CREATE SEQUENCE IF NOT EXISTS seq_receipt_no
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;
```

---

## 4. Complete Table Definitions (22 Tables + Sessions)

### Group 1: Master Data (8 Tables)

#### 1. `institutions`
Represents educational institutions in the RBMI Group.
```sql
CREATE TABLE institutions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'RBMI-ENG', 'RBMI-MGMT'
    name VARCHAR(200) NOT NULL,
    address VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. `libraries`
Represents physical library branches across institutions.
```sql
CREATE TABLE libraries (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'CL', 'ML', 'PL', 'NL', 'TL'
    name VARCHAR(200) NOT NULL,
    accession_prefix VARCHAR(10) NOT NULL UNIQUE, -- 2–5 letters (e.g., 'CL', 'ML')
    next_accession_no INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. `departments`
Academic and administrative departments within institutions.
```sql
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'CSE', 'ME', 'IT', 'MBA', 'PHARM'
    name VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. `courses`
Academic degree/diploma programs offered.
```sql
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'BTECH-CS', 'MBA', 'BPHARM'
    name VARCHAR(200) NOT NULL,
    duration_years INTEGER NOT NULL CHECK (duration_years > 0 AND duration_years <= 10),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 5. `patron_categories`
Membership classifications governing circulation entitlements.
```sql
CREATE TABLE patron_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'BTECH', 'FACULTY', 'STAFF', 'GUEST'
    name VARCHAR(100) NOT NULL,
    patron_type VARCHAR(20) NOT NULL CHECK (patron_type IN ('STUDENT', 'FACULTY', 'STAFF', 'GUEST')),
    card_validity_years INTEGER NOT NULL DEFAULT 1 CHECK (card_validity_years > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. `item_types`
Media and material classes for catalogued works.
```sql
CREATE TABLE item_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,       -- e.g., 'BOOK', 'REF', 'JOURNAL', 'GEN'
    name VARCHAR(100) NOT NULL,
    is_reference BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 7. `vendors`
Suppliers and book distributors.
```sql
CREATE TABLE vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    gst_no VARCHAR(30),
    address VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 8. `system_settings`
System-wide configuration parameters (Section 10.2).
```sql
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description VARCHAR(500),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### Group 2: Security & Audit (5 Tables)

#### 9. `roles`
Staff security roles (Section 4.1, 10.3).
```sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,       -- 'SUPER_ADMIN', 'LIBRARY_ADMIN', 'LIBRARIAN', 'ASSISTANT_LIBRARIAN'
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 10. `permissions`
Granular operational capabilities (Section 10.3, DR-08).
```sql
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,       -- 21 distinct permission codes
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255)
);
```

#### 11. `role_permissions`
Many-to-many junction binding roles to permissions.
```sql
CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
```

#### 12. `users`
Staff operator accounts (Section 4.1, 6.1).
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,     -- Argon2id hash
    full_name VARCHAR(100) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 13. `audit_logs`
Append-only log of every system transaction and access failure (FR-AT-01, FR-AT-02, DR-06).
```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('STAFF', 'PATRON', 'SYSTEM', 'ANONYMOUS')),
    actor_id INTEGER,                       -- references users(id) or patrons(id)
    actor_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,            -- 'LOGIN', 'LOGOUT', 'ISSUE', 'RETURN', 'RENEW', 'LOST', 'HOLD', etc.
    entity VARCHAR(50),                     -- 'LOAN', 'ITEM', 'PATRON', 'FINE', etc.
    entity_id VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Note: Database permissions for audit_logs must strictly permit only INSERT and SELECT to application users.
```

---

### Group 3: Membership (1 Table)

#### 14. `patrons`
Students, faculty, staff, and guests entitled to library privileges.
```sql
CREATE TABLE patrons (
    id SERIAL PRIMARY KEY,
    card_no VARCHAR(50) NOT NULL UNIQUE,     -- Primary circulation identifier / OPAC login
    patron_type VARCHAR(20) NOT NULL CHECK (patron_type IN ('STUDENT', 'FACULTY', 'STAFF', 'GUEST')),
    category_id INTEGER NOT NULL REFERENCES patron_categories(id) ON DELETE RESTRICT,
    institution_id INTEGER REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
    course_id INTEGER REFERENCES courses(id) ON DELETE RESTRICT,
    roll_no VARCHAR(50) UNIQUE,              -- Required for students, unique
    employee_id VARCHAR(50) UNIQUE,          -- Required for faculty/staff, unique
    first_name VARCHAR(60) NOT NULL,
    middle_name VARCHAR(60),
    last_name VARCHAR(60),
    gender VARCHAR(10),                      -- 'M', 'F', 'O'
    dob DATE,
    father_name VARCHAR(100),
    mobile VARCHAR(20),
    email VARCHAR(100),
    address VARCHAR(500),
    academic_year INTEGER,
    semester INTEGER,
    section VARCHAR(10),
    admission_date DATE,
    course_end_date DATE,
    card_expiry DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'GRADUATED', 'LEFT')),
    username VARCHAR(50) NOT NULL UNIQUE,    -- Defaults to card_no
    password_hash VARCHAR(255) NOT NULL,     -- Argon2id hash
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patrons_status ON patrons(status);
CREATE INDEX idx_patrons_card_no ON patrons(card_no);
CREATE INDEX idx_patrons_roll_no ON patrons(roll_no);
CREATE INDEX idx_patrons_employee_id ON patrons(employee_id);
```

---

### Group 4: Catalogue (2 Tables)

#### 15. `bib_records`
Bibliographic master records (titles) shared across libraries.
```sql
CREATE TABLE bib_records (
    id SERIAL PRIMARY KEY,
    isbn VARCHAR(20),                        -- Normalised (hyphens stripped)
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    authors VARCHAR(500) NOT NULL,
    editors VARCHAR(500),
    edition VARCHAR(50),
    publisher VARCHAR(200),
    place_of_publication VARCHAR(100),
    pub_year INTEGER CHECK (pub_year >= 1500 AND pub_year <= 2100),
    pages VARCHAR(50),
    language VARCHAR(50) DEFAULT 'English',
    subject VARCHAR(500),
    keywords VARCHAR(500),
    ddc_number VARCHAR(50),
    call_number VARCHAR(100),
    item_type_id INTEGER NOT NULL REFERENCES item_types(id) ON DELETE RESTRICT,
    department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
    summary TEXT,
    price NUMERIC(10, 2) DEFAULT 0.00 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bib_records_isbn ON bib_records(isbn);
CREATE INDEX idx_bib_records_title ON bib_records(title);
CREATE INDEX idx_bib_records_authors ON bib_records(authors);
CREATE INDEX idx_bib_records_subject ON bib_records(subject);
```

#### 16. `items`
Physical copies of bibliographic titles assigned to specific libraries.
```sql
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    bib_id INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE RESTRICT,
    library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE RESTRICT,
    accession_no VARCHAR(30) NOT NULL UNIQUE,
    barcode VARCHAR(40) NOT NULL UNIQUE,
    call_number VARCHAR(100),
    location VARCHAR(100),                   -- Shelf / almirah location
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
    invoice_no VARCHAR(100),
    acquisition_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN (
            'AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY',
            'LOST', 'DAMAGED', 'REPAIR', 'WITHDRAWN', 'PROCESSING'
        )),
    condition_note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_items_bib_id ON items(bib_id);
CREATE INDEX idx_items_library_id ON items(library_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_accession_no ON items(accession_no);
CREATE INDEX idx_items_barcode ON items(barcode);
```

---

### Group 5: Circulation (6 Tables)

#### 17. `circulation_rules`
Policy matrices governing borrowing terms by library, patron category, and item type.
```sql
CREATE TABLE circulation_rules (
    id SERIAL PRIMARY KEY,
    library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES patron_categories(id) ON DELETE CASCADE,
    item_type_id INTEGER REFERENCES item_types(id) ON DELETE CASCADE,
    max_books INTEGER NOT NULL DEFAULT 3 CHECK (max_books >= 0),
    loan_days INTEGER NOT NULL DEFAULT 14 CHECK (loan_days >= 0),
    max_renewals INTEGER NOT NULL DEFAULT 1 CHECK (max_renewals >= 0),
    fine_per_day NUMERIC(10, 2) NOT NULL DEFAULT 2.00 CHECK (fine_per_day >= 0),
    grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
    max_fine NUMERIC(10, 2) CHECK (max_fine IS NULL OR max_fine >= 0),
    holds_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_circ_rules_lookup ON circulation_rules(library_id, category_id, item_type_id);
```

#### 18. `loans`
Historical and active checkouts.
```sql
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    patron_id INTEGER NOT NULL REFERENCES patrons(id) ON DELETE RESTRICT,
    library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE RESTRICT,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    renewal_count INTEGER NOT NULL DEFAULT 0 CHECK (renewal_count >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ISSUED'
        CHECK (status IN ('ISSUED', 'RETURNED', 'LOST')),
    issued_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    returned_to INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loans_item_id ON loans(item_id);
CREATE INDEX idx_loans_patron_id ON loans(patron_id);
CREATE INDEX idx_loans_status_due_date ON loans(status, due_date);
```

#### 19. `holds`
Reservation queue for titles currently checked out.
```sql
CREATE TABLE holds (
    id SERIAL PRIMARY KEY,
    patron_id INTEGER NOT NULL REFERENCES patrons(id) ON DELETE RESTRICT,
    bib_id INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE RESTRICT,
    item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT, -- Bound when ready for pickup
    request_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING', 'AVAILABLE_FOR_PICKUP', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    available_date DATE,
    expiry_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index: Enforces only ONE active hold per patron and title (DR-01)
CREATE UNIQUE INDEX uq_active_hold_per_patron_title 
    ON holds(patron_id, bib_id) 
    WHERE status IN ('WAITING', 'AVAILABLE_FOR_PICKUP');

CREATE INDEX idx_holds_bib_status ON holds(bib_id, status);
CREATE INDEX idx_holds_patron_id ON holds(patron_id);
```

#### 20. `fines`
Financial penalties levied against patrons.
```sql
CREATE TABLE fines (
    id SERIAL PRIMARY KEY,
    patron_id INTEGER NOT NULL REFERENCES patrons(id) ON DELETE RESTRICT,
    loan_id INTEGER REFERENCES loans(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    fine_type VARCHAR(20) NOT NULL CHECK (fine_type IN ('OVERDUE', 'LOST', 'DAMAGE', 'MANUAL')),
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OUTSTANDING'
        CHECK (status IN ('OUTSTANDING', 'PAID', 'WAIVED')),
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fines_patron_status ON fines(patron_id, status);
CREATE INDEX idx_fines_loan_id ON fines(loan_id);
```

#### 21. `payments`
Transactions recording receipt of money or fine waivers.
```sql
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    fine_id INTEGER NOT NULL REFERENCES fines(id) ON DELETE RESTRICT,
    patron_id INTEGER NOT NULL REFERENCES patrons(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'WAIVED')),
    receipt_no VARCHAR(50) NOT NULL UNIQUE,  -- RECEIPT_PREFIX-YYYY-NNNNN
    remarks VARCHAR(500),
    received_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_fine_id ON payments(fine_id);
CREATE INDEX idx_payments_patron_id ON payments(patron_id);
CREATE INDEX idx_payments_receipt_no ON payments(receipt_no);
```

#### 22. `import_batches`
History of bulk student, faculty, and catalogue CSV imports.
```sql
CREATE TABLE import_batches (
    id SERIAL PRIMARY KEY,
    import_type VARCHAR(20) NOT NULL CHECK (import_type IN ('STUDENT', 'FACULTY', 'CATALOGUE')),
    file_name VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL,
    imported_rows INTEGER NOT NULL,
    skipped_rows INTEGER NOT NULL,
    imported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### Supporting Group: Authentication & Session Management (1 Table)

#### 23. `sessions`
Server-side active sessions for staff and OPAC patrons (Approved Stack, NFR-S-04, NFR-S-05).
```sql
CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,            -- Secure crypto random string
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('STAFF', 'PATRON')),
    user_id INTEGER NOT NULL,               -- references users(id) or patrons(id)
    csrf_token VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## 5. SQL Views (All 6 Views)

### View 1: `v_bib_availability`
Provides a consolidated availability view of each bibliographic title across branches.
```sql
CREATE OR REPLACE VIEW v_bib_availability AS
SELECT 
    b.id AS bib_id,
    b.isbn,
    b.title,
    b.authors,
    b.publisher,
    b.pub_year,
    b.item_type_id,
    it.name AS item_type_name,
    b.department_id,
    d.name AS department_name,
    COUNT(i.id) AS total_copies,
    COUNT(CASE WHEN i.status = 'AVAILABLE' THEN 1 END) AS available_copies,
    COUNT(CASE WHEN i.status = 'ISSUED' THEN 1 END) AS issued_copies,
    COUNT(CASE WHEN i.status = 'RESERVED' THEN 1 END) AS reserved_copies,
    COUNT(CASE WHEN i.status = 'REFERENCE_ONLY' THEN 1 END) AS reference_copies,
    COUNT(CASE WHEN i.status NOT IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY') THEN 1 END) AS other_copies,
    COALESCE(h.waiting_holds, 0) AS waiting_holds
FROM bib_records b
LEFT JOIN item_types it ON b.item_type_id = it.id
LEFT JOIN departments d ON b.department_id = d.id
LEFT JOIN items i ON b.id = i.bib_id
LEFT JOIN (
    SELECT bib_id, COUNT(*) AS waiting_holds
    FROM holds
    WHERE status = 'WAITING'
    GROUP BY bib_id
) h ON b.id = h.bib_id
GROUP BY b.id, it.name, d.name, h.waiting_holds;
```

### View 2: `v_active_loans`
Details all currently active book checkouts.
```sql
CREATE OR REPLACE VIEW v_active_loans AS
SELECT 
    l.id AS loan_id,
    l.item_id,
    i.accession_no,
    i.barcode,
    b.title,
    b.authors,
    l.patron_id,
    p.card_no,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patron_name,
    p.patron_type,
    p.mobile AS patron_mobile,
    l.library_id,
    lib.name AS library_name,
    l.issue_date,
    l.due_date,
    l.renewal_count,
    l.issued_by,
    u.full_name AS issued_by_name,
    CASE WHEN CURRENT_DATE > l.due_date THEN (CURRENT_DATE - l.due_date) ELSE 0 END AS days_overdue
FROM loans l
JOIN items i ON l.item_id = i.id
JOIN bib_records b ON i.bib_id = b.id
JOIN patrons p ON l.patron_id = p.id
JOIN libraries lib ON l.library_id = lib.id
JOIN users u ON l.issued_by = u.id
WHERE l.status = 'ISSUED';
```

### View 3: `v_overdue_loans`
Filters active loans to those past their due date, sorted by severity.
```sql
CREATE OR REPLACE VIEW v_overdue_loans AS
SELECT 
    loan_id,
    item_id,
    accession_no,
    barcode,
    title,
    patron_id,
    card_no,
    patron_name,
    patron_type,
    patron_mobile,
    library_id,
    library_name,
    issue_date,
    due_date,
    days_overdue
FROM v_active_loans
WHERE days_overdue > 0;
```

### View 4: `v_outstanding_fines`
Lists unpaid or partially paid patron fines.
```sql
CREATE OR REPLACE VIEW v_outstanding_fines AS
SELECT 
    f.id AS fine_id,
    f.patron_id,
    p.card_no,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patron_name,
    p.mobile AS patron_mobile,
    f.loan_id,
    f.fine_type,
    f.reason,
    f.amount,
    f.paid_amount,
    (f.amount - f.paid_amount) AS balance_amount,
    f.created_at,
    u.full_name AS created_by_name
FROM fines f
JOIN patrons p ON f.patron_id = p.id
JOIN users u ON f.created_by = u.id
WHERE f.status = 'OUTSTANDING';
```

### View 5: `v_accession_register`
Formal institutional stock register linking physical copies to invoices, vendors, and bibliographic metadata.
```sql
CREATE OR REPLACE VIEW v_accession_register AS
SELECT 
    i.id AS item_id,
    i.accession_no,
    i.barcode,
    b.title,
    b.authors,
    b.edition,
    b.publisher,
    b.pub_year,
    it.name AS item_type,
    d.name AS department,
    lib.name AS library_name,
    i.location,
    i.price,
    v.name AS vendor_name,
    i.invoice_no,
    i.acquisition_date,
    i.status AS copy_status,
    i.condition_note
FROM items i
JOIN bib_records b ON i.bib_id = b.id
JOIN item_types it ON b.item_type_id = it.id
LEFT JOIN departments d ON b.department_id = d.id
JOIN libraries lib ON i.library_id = lib.id
LEFT JOIN vendors v ON i.vendor_id = v.id;
```

### View 6: `v_patron_summary`
Summary of patron standing: active loans count, overdue count, and total outstanding fines.
```sql
CREATE OR REPLACE VIEW v_patron_summary AS
SELECT 
    p.id AS patron_id,
    p.card_no,
    p.roll_no,
    p.employee_id,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS full_name,
    p.patron_type,
    cat.name AS category_name,
    p.status,
    p.card_expiry,
    COALESCE(l.active_loans_count, 0) AS active_loans_count,
    COALESCE(l.overdue_loans_count, 0) AS overdue_loans_count,
    COALESCE(f.total_fines_balance, 0.00) AS total_fines_balance
FROM patrons p
JOIN patron_categories cat ON p.category_id = cat.id
LEFT JOIN (
    SELECT 
        patron_id,
        COUNT(*) AS active_loans_count,
        COUNT(CASE WHEN CURRENT_DATE > due_date THEN 1 END) AS overdue_loans_count
    FROM loans
    WHERE status = 'ISSUED'
    GROUP BY patron_id
) l ON p.id = l.patron_id
LEFT JOIN (
    SELECT 
        patron_id,
        SUM(amount - paid_amount) AS total_fines_balance
    FROM fines
    WHERE status = 'OUTSTANDING'
    GROUP BY patron_id
) f ON p.id = f.patron_id;
```

---

## 6. PostgreSQL Role & Security Architecture (Append-Only Audit)

To satisfy `FR-AT-02` (*Audit records shall be append-only*) and `NFR-S-06` (*Database credentials live only in server configuration*):

```sql
-- Role for application runtime
CREATE ROLE lms_app LOGIN PASSWORD 'secure_app_password';

-- Grant standard permissions to app role
GRANT CONNECT ON DATABASE lms TO lms_app;
GRANT USAGE ON SCHEMA public TO lms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lms_app;

-- Enforce append-only on audit_logs: revoke UPDATE and DELETE
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM lms_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE payments FROM lms_app; -- payments are also immutable (FR-FI-05)
```

---

## 7. Migration & Seeding Strategy

1. **Migrations Tool:** `drizzle-kit` managing versioned SQL files in `db/migrations/`.
2. **First-Start Execution (FR-ST-01):** The application checks whether `system_settings` table exists. If absent or pending migrations exist, it executes migrations and applies initial seed data (`DR-08`).
3. **Seed Passwords (DR-09):** Seed accounts (`admin`, `librarian`, `assistant`) have Argon2id hashes pre-computed at build time and inserted directly into `users`.
