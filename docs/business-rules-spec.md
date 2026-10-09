# RBMI Library Management System — Business Rules Specification

This document provides the formal specification for all core business rules (`BR-01` through `BR-09`), numbering formats, and system configuration settings of the RBMI Library Management System, derived from Sections 4, 5, and 10 of the SRS.

In accordance with `CLAUDE.md`, all circulation and fine evaluation rules must be implemented as **pure TypeScript functions** with zero database or framework dependencies, enabling comprehensive isolated unit testing via Vitest.

---

## 1. Circulation Rules Engine (`BR-01` to `BR-05`, `BR-08`, `BR-09`)

### 1.1 Rule Definition & Binding (`BR-01`)
A circulation rule binds three optional scoping keys to policy terms:
- **Scoping Keys:**
  - `library_id` (nullable: optional library scope)
  - `category_id` (nullable: optional patron category scope)
  - `item_type_id` (nullable: optional item type scope)
- **Policy Terms:**
  - `max_books` (integer $\ge 0$): Maximum simultaneous active loans permitted.
  - `loan_days` (integer $\ge 0$): Duration of a single loan in calendar days.
  - `max_renewals` (integer $\ge 0$): Maximum consecutive renewals allowed.
  - `fine_per_day` (decimal $\ge 0.00$): Daily penalty for late return.
  - `grace_days` (integer $\ge 0$): Grace period before daily fine is calculated.
  - `max_fine` (decimal $\ge 0.00$, optional): Maximum fine cap per loan.
  - `holds_allowed` (boolean): Whether holds may be placed on items of this type/category.

---

### 1.2 Rule Matching & Scoring Algorithm (`BR-02`)

When evaluating an issue, return, or renewal operation for a given `(library, category, item_type)` tuple:
1. **Candidate Selection:** Identify all active circulation rules where each key matches the target or is `NULL` (wildcard).
2. **Score Computation:** For each candidate rule, calculate its match score:
   $$\text{Score} = (\text{Library Match} \times 4) + (\text{Item Type Match} \times 2) + (\text{Category Match} \times 1)$$
   - *Library Match:* 1 if `rule.library_id == target.library_id`, else 0.
   - *Item Type Match:* 1 if `rule.item_type_id == target.item_type_id`, else 0.
   - *Category Match:* 1 if `rule.category_id == target.category_id`, else 0.
3. **Winner Selection:** The candidate rule with the highest score is selected. If multiple rules share the highest score, the most recently created or specific rule is chosen.
4. **Fallback to System Defaults:** If no candidate rule matches, apply system defaults from `system_settings`:
   - `loan_days`: `DEFAULT_LOAN_DAYS` (default: 14)
   - `max_books`: `DEFAULT_MAX_BOOKS` (default: 3)
   - `max_renewals`: `DEFAULT_MAX_RENEWALS` (default: 1)
   - `fine_per_day`: `DEFAULT_FINE_PER_DAY` (default: 2.00)
   - `grace_days`: `DEFAULT_GRACE_DAYS` (default: 0)
   - `max_fine`: `null` (no cap)
   - `holds_allowed`: `true`

---

### 1.3 Zero-Limit Enforcement (`BR-03`)
If the selected rule has `max_books == 0` or `loan_days == 0`:
- The item is **not eligible for issuance** to this category or library.
- Desk issue refusal reason: *"Item type is not issued to this category (rule #<id>)"*.

---

### 1.4 Reference Item Restriction (`BR-04`)
- If the item's `item_types.is_reference == true`, the item **shall never be issued** unless the selected winning rule explicitly names that item type (`rule.item_type_id == target.item_type_id`), regardless of score or category match.
- Desk issue refusal reason: *"Reference items are not issued to this category"*.

---

### 1.5 Due Date & Renewal Limits (`BR-05`)
- **Initial Issue Due Date:**
  $$\text{due\_date} = \text{issue\_date} + \text{loan\_days}$$
- **Renewal Due Date:**
  $$\text{new\_due\_date} = \text{today} + \text{loan\_days}$$
- **Renewal Maximum:**
  A loan may be renewed at most `max_renewals` times. If `loan.renewal_count >= max_renewals`, renewal is refused:
  *"Maximum renewals (<max_renewals>) already used"*.

---

### 1.6 Circulation Blocking Conditions (`BR-08`)

#### A. Issue Blocks
An issue request is refused if any of the following occur:
1. Patron status is not `ACTIVE` (e.g., `BLOCKED`, `EXPIRED`, `GRADUATED`, `LEFT`).
2. Card has expired (`patron.card_expiry < today`).
3. Copy is not available for this patron (not `AVAILABLE`, and not `RESERVED` for this patron).
4. Category or item type is zero-loan (`BR-03`) or unauthorized reference (`BR-04`).
5. Patron active loan count $\ge$ `max_books` (`BR-09`). Refusal message: *"Maximum books reached (N of M)"*.
6. `BLOCK_ISSUE_IF_OVERDUE == true` AND patron has at least one loan where `status == 'ISSUED'` and `due_date < today`. Refusal message: *"Patron has overdue books. Return them before issuing new ones"*.
7. Patron outstanding fines total $\ge$ `FINE_BLOCK_LIMIT` (default: 100.00). Refusal message: *"Outstanding fines (₹<balance>) at or above limit (₹<limit>)"*.

#### B. Renewal Blocks
A renewal request is refused if any of the following occur:
1. Loan is currently overdue (`due_date < today`). Refusal message: *"Loan is overdue"*.
2. Consecutive renewals reached: `loan.renewal_count >= max_renewals`. Refusal message: *"Maximum renewals (<max_renewals>) already used"*.
3. Patron outstanding fines $\ge$ `FINE_BLOCK_LIMIT`. Refusal message: *"Fines at the limit"*.
4. Another patron has an active hold (`WAITING` or `AVAILABLE_FOR_PICKUP`) on the title. Refusal message: *"Title is reserved by another patron"*.

---

### 1.7 Global Loan Quota (`BR-09`)
`max_books` counts the total number of active loans (`status == 'ISSUED'`) currently held by the patron **across all titles, branches, and libraries in the RBMI Group**.

---

## 2. Worked Examples from SRS Section 5.1

| Patron Category | Item Type | Matching Rules (Score) | Selected Policy Outcome |
| :--- | :--- | :--- | :--- |
| **B.Tech student** | **Textbook** | B.Tech Category (1) | 4 books, 14 days, 2 renewals, ₹2/day, cap ₹200 |
| **B.Tech student** | **Reference book** | B.Tech Category (1), Reference Item Type (2) | **Not issued** (Reference book rule does not explicitly authorize B.Tech; BR-04 applies) |
| **Faculty** | **Reference book** | Faculty (1), Reference (2), Faculty + Reference (3) | 2 books, 3 days, ₹5/day (Rule #3 wins with score 3) |
| **Guest** | **General book** | Guest Category (1) | 1 book, 7 days, 0 renewals, no holds allowed |
| **Any (Unmatched)** | **Any (Unmatched)** | None (0) | System defaults: 3 books, 14 days, 1 renewal, ₹2/day, no cap, holds allowed |

---

## 3. Financial & Fine Calculation Rules (`BR-06`, `BR-07`, Section 4.9)

### 3.1 Overdue Fine Calculation (`BR-06`)
Fines for overdue loans are **never accrued daily** in the database. They are calculated dynamically at the moment of return (or when the copy is declared lost):
$$\text{days\_late} = \max(0, \text{return\_date} - \text{due\_date})$$
$$\text{chargeable\_days} = \max(0, \text{days\_late} - \text{grace\_days})$$
$$\text{calculated\_fine} = \text{chargeable\_days} \times \text{fine\_per\_day}$$
$$\text{final\_overdue\_fine} = \begin{cases} \min(\text{calculated\_fine}, \text{max\_fine}) & \text{if } \text{max\_fine} \text{ is set and } > 0 \\ \text{calculated\_fine} & \text{otherwise} \end{cases}$$

- If `final_overdue_fine > 0`, an `OUTSTANDING` fine record is inserted with `fine_type = 'OVERDUE'`.

---

### 3.2 Lost Copy Charge (`BR-07`)
When an issued copy is declared lost by staff with permission `CIRC_LOST`:
$$\text{base\_replacement\_price} = \begin{cases} \text{item.price} & \text{if } \text{item.price} > 0 \\ \text{bib\_record.price} & \text{otherwise} \end{cases}$$
$$\text{overdue\_fine\_to\_date} = \text{BR-06 calculated with } \text{return\_date} = \text{today}$$
$$\text{lost\_charge} = \text{base\_replacement\_price} + \text{LOST\_PROCESSING\_FEE} + \text{overdue\_fine\_to\_date}$$

- The loan status transitions to `LOST`.
- The item status transitions to `LOST`.
- A fine record is created with `fine_type = 'LOST'`, `amount = lost_charge`, `status = 'OUTSTANDING'`.

---

### 3.3 Payments and Waivers (FR-FI-01 to FR-FI-05)
1. **Fine Balance:** $\text{balance} = \text{fine.amount} - \text{fine.paid\_amount}$.
2. **Payment Collection (`FINE_COLLECT`):**
   - Amount must be $0.01 \le \text{amount} \le \text{balance}$.
   - Allowed methods: `CASH`, `UPI`, `CARD`, `ONLINE`.
   - Generates unique receipt number: `RECEIPT_PREFIX-YYYY-NNNNN`.
   - `paid_amount` updated. If `balance == 0`, fine status becomes `PAID`.
3. **Waiver (`FINE_WAIVE`):**
   - Remaining balance is written off.
   - Status becomes `WAIVED`.
   - Receipt generated with method `WAIVED`.
4. **Immutability (FR-FI-05):** Fines and payments can never be edited or deleted once created.

---

## 4. Reservation Rules (FR-HO-01 to FR-HO-04, Section 5.4)

1. **Placement Prerequisites (FR-HO-01):**
   - Patron status must be `ACTIVE`.
   - No copy of the title is currently `AVAILABLE`.
   - Patron does not already hold or currently borrow that title (DR-01 partial unique index).
   - Circulation rule allows holds (`holds_allowed == true`).
2. **Queue Ordering (FR-HO-02):**
   - Holds are ordered strictly by `request_date ASC`.
   - Queue position ($1, 2, \dots$) is displayed to staff and patrons.
3. **Auto-Assignment upon Return (FR-HO-03):**
   - When an issued copy is returned, the circulation desk checks for waiting holds.
   - If a hold exists:
     - Copy transitions to `RESERVED`.
     - First hold transitions to `AVAILABLE_FOR_PICKUP`.
     - `available_date = today`, `expiry_date = today + HOLD_PICKUP_DAYS`.
     - System instructs desk staff to set item aside and shows patron mobile number.
4. **Automatic Expiry (FR-HO-04, FR-DB-03):**
   - Whenever the dashboard or reservations page is opened, housekeeping runs:
     - Holds with `status == 'AVAILABLE_FOR_PICKUP'` and `expiry_date < today` transition to `EXPIRED`.
     - The held copy is reassigned to the next waiting hold, or transitions to `AVAILABLE` (or `REFERENCE_ONLY` if reference).

---

## 5. Numbering Specifications (Section 5.2)

| Number Type | Format / Generation Logic | Uniqueness & Storage |
| :--- | :--- | :--- |
| **Accession Number** | `<library_prefix><6-digit counter>` (e.g., `CL000001`, `ML000042`). Allocated at copy creation from `libraries.next_accession_no`, never reused. Manually supplied numbers accepted if unique. | Unique across system (`items.accession_no`). |
| **Barcode** | Defaults to accession number. May be custom scanned. | Unique across system (`items.barcode`). Printed as Code 128 SVG. |
| **Library Card Number** | Defaults to student `roll_no` or employee `employee_id`. If absent, `<CARD_PREFIX><6-digit sequence>` (e.g., `LIB000001`) from `seq_card_no`. | Unique across system (`patrons.card_no`). Serves as OPAC login username. |
| **Receipt Number** | `<RECEIPT_PREFIX>-<YYYY>-<5-digit sequence>` (e.g., `RCPT-2026-00001`) from `seq_receipt_no`. | Unique across system (`payments.receipt_no`). |

---

## 6. System Settings Catalog (Section 10.2)

The system maintains 17 editable key-value configuration settings in `system_settings`:

| Setting Key | Default Value | Type | Consuming Features / Requirements |
| :--- | :--- | :--- | :--- |
| `LIBRARY_NAME` | `RBMI Central Library` | string | Headers, printouts, OPAC title (FR-PR-02, T-23) |
| `INSTITUTE_NAME` | `RBMI Group of Institutions, Bareilly` | string | Printouts, OPAC footer, certificates (FR-PR-02) |
| `ACADEMIC_SESSION` | `2026-27` | string | Informational, reports header |
| `DEFAULT_LOAN_DAYS` | `14` | integer | Fallback circulation duration (BR-02) |
| `DEFAULT_MAX_BOOKS` | `3` | integer | Fallback maximum simultaneous loans (BR-02) |
| `DEFAULT_MAX_RENEWALS`| `1` | integer | Fallback renewal limit (BR-02) |
| `DEFAULT_FINE_PER_DAY` | `2.00` | decimal | Fallback daily overdue fine rate (BR-02) |
| `DEFAULT_GRACE_DAYS` | `0` | integer | Fallback overdue grace days (BR-02) |
| `FINE_BLOCK_LIMIT` | `100.00` | decimal | Outstanding fine threshold blocking issues/renewals (BR-08) |
| `BLOCK_ISSUE_IF_OVERDUE`| `true` | boolean | Block new issues if patron has any overdue loan (BR-08) |
| `HOLD_PICKUP_DAYS` | `2` | integer | Days reserved copy is held before expiry (FR-CI-03, FR-HO-04) |
| `LOST_PROCESSING_FEE` | `50.00` | decimal | Fixed administrative handling charge for lost books (BR-07) |
| `CARD_PREFIX` | `LIB` | string | Prefix for auto-generated patron card numbers (FR-PA-02) |
| `RECEIPT_PREFIX` | `RCPT` | string | Prefix for payment and waiver receipts (FR-FI-03) |
| `NEW_ARRIVAL_DAYS` | `30` | integer | Days a newly added copy appears in OPAC New Arrivals (FR-OP-01) |
| `OPAC_ALLOW_HOLDS` | `true` | boolean | Toggle allowing patrons to reserve books via OPAC (FR-HO-01) |
| `LABEL_TITLE` | `RBMI Library` | string | Header text printed on spine and barcode labels (FR-CA-07) |

All changes made to `system_settings` take effect immediately on subsequent requests without requiring server or application restarts (`FR-AD-02`).
