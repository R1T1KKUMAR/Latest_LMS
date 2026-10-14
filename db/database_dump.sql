-- ========================================================
-- RBMI LIBRARY MANAGEMENT SYSTEM - COMPLETE DATABASE DUMP
-- Generated: 2026-10-14T06:42:15.216Z
-- Includes full schema DDL, views, triggers, and all table data
-- ========================================================

-- ========================================================
-- 1. SCHEMA DDL & MIGRATIONS
-- ========================================================

CREATE SEQUENCE "public"."seq_card_no" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."seq_receipt_no" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"duration_years" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_duration_years" CHECK ("courses"."duration_years" > 0 AND "courses"."duration_years" <= 10)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "item_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_reference" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"accession_prefix" varchar(10) NOT NULL,
	"next_accession_no" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "libraries_code_unique" UNIQUE("code"),
	CONSTRAINT "libraries_accession_prefix_unique" UNIQUE("accession_prefix")
);
--> statement-breakpoint
CREATE TABLE "patron_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"patron_type" varchar(20) NOT NULL,
	"card_validity_years" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patron_categories_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_patron_type" CHECK ("patron_categories"."patron_type" IN ('STUDENT', 'FACULTY', 'STAFF', 'GUEST')),
	CONSTRAINT "chk_card_validity_years" CHECK ("patron_categories"."card_validity_years" > 0)
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting_key" varchar(100) NOT NULL,
	"setting_value" text NOT NULL,
	"description" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_setting_key_unique" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_person" varchar(100),
	"phone" varchar(20),
	"email" varchar(100),
	"gst_no" varchar(30),
	"address" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"entity" varchar(50),
	"entity_id" varchar(50),
	"details" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_actor_type" CHECK ("audit_logs"."actor_type" IN ('STAFF', 'PATRON', 'SYSTEM', 'ANONYMOUS'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_type" varchar(20) NOT NULL,
	"user_id" integer NOT NULL,
	"csrf_token" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_session_user_type" CHECK ("sessions"."user_type" IN ('STAFF', 'PATRON'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"role_id" integer NOT NULL,
	"library_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "patrons" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_no" varchar(50) NOT NULL,
	"patron_type" varchar(20) NOT NULL,
	"category_id" integer NOT NULL,
	"institution_id" integer,
	"department_id" integer,
	"course_id" integer,
	"roll_no" varchar(50),
	"employee_id" varchar(50),
	"first_name" varchar(60) NOT NULL,
	"middle_name" varchar(60),
	"last_name" varchar(60),
	"gender" varchar(10),
	"dob" date,
	"father_name" varchar(100),
	"mobile" varchar(20),
	"email" varchar(100),
	"address" varchar(500),
	"academic_year" integer,
	"semester" integer,
	"section" varchar(10),
	"admission_date" date,
	"course_end_date" date,
	"card_expiry" date NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrons_card_no_unique" UNIQUE("card_no"),
	CONSTRAINT "patrons_roll_no_unique" UNIQUE("roll_no"),
	CONSTRAINT "patrons_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "patrons_username_unique" UNIQUE("username"),
	CONSTRAINT "chk_patron_patron_type" CHECK ("patrons"."patron_type" IN ('STUDENT', 'FACULTY', 'STAFF', 'GUEST')),
	CONSTRAINT "chk_patron_status" CHECK ("patrons"."status" IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'GRADUATED', 'LEFT'))
);
--> statement-breakpoint
CREATE TABLE "bib_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"isbn" varchar(20),
	"title" varchar(500) NOT NULL,
	"subtitle" varchar(500),
	"authors" varchar(500) NOT NULL,
	"editors" varchar(500),
	"edition" varchar(50),
	"publisher" varchar(200),
	"place_of_publication" varchar(100),
	"pub_year" integer,
	"pages" varchar(50),
	"language" varchar(50) DEFAULT 'English',
	"subject" varchar(500),
	"keywords" varchar(500),
	"ddc_number" varchar(50),
	"call_number" varchar(100),
	"item_type_id" integer NOT NULL,
	"department_id" integer,
	"summary" text,
	"price" numeric(10, 2) DEFAULT '0.00',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pub_year" CHECK ("bib_records"."pub_year" IS NULL OR ("bib_records"."pub_year" >= 1500 AND "bib_records"."pub_year" <= 2100)),
	CONSTRAINT "chk_bib_price" CHECK ("bib_records"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bib_id" integer NOT NULL,
	"library_id" integer NOT NULL,
	"accession_no" varchar(30) NOT NULL,
	"barcode" varchar(40) NOT NULL,
	"call_number" varchar(100),
	"location" varchar(100),
	"price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"vendor_id" integer,
	"invoice_no" varchar(100),
	"acquisition_date" date DEFAULT now(),
	"status" varchar(20) DEFAULT 'AVAILABLE' NOT NULL,
	"condition_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "chk_item_price" CHECK ("items"."price" >= 0),
	CONSTRAINT "chk_item_status" CHECK ("items"."status" IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY', 'LOST', 'DAMAGED', 'REPAIR', 'WITHDRAWN', 'PROCESSING'))
);
--> statement-breakpoint
CREATE TABLE "circulation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_id" integer,
	"category_id" integer,
	"item_type_id" integer,
	"max_books" integer DEFAULT 3 NOT NULL,
	"loan_days" integer DEFAULT 14 NOT NULL,
	"max_renewals" integer DEFAULT 1 NOT NULL,
	"fine_per_day" numeric(10, 2) DEFAULT '2.00' NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"max_fine" numeric(10, 2),
	"holds_allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_rule_max_books" CHECK ("circulation_rules"."max_books" >= 0),
	CONSTRAINT "chk_rule_loan_days" CHECK ("circulation_rules"."loan_days" >= 0),
	CONSTRAINT "chk_rule_max_renewals" CHECK ("circulation_rules"."max_renewals" >= 0),
	CONSTRAINT "chk_rule_fine_per_day" CHECK ("circulation_rules"."fine_per_day" >= 0),
	CONSTRAINT "chk_rule_grace_days" CHECK ("circulation_rules"."grace_days" >= 0),
	CONSTRAINT "chk_rule_max_fine" CHECK ("circulation_rules"."max_fine" IS NULL OR "circulation_rules"."max_fine" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" serial PRIMARY KEY NOT NULL,
	"patron_id" integer NOT NULL,
	"loan_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"fine_type" varchar(20) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'OUTSTANDING' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_fine_amount" CHECK ("fines"."amount" > 0),
	CONSTRAINT "chk_fine_paid_amount" CHECK ("fines"."paid_amount" >= 0),
	CONSTRAINT "chk_fine_type" CHECK ("fines"."fine_type" IN ('OVERDUE', 'LOST', 'DAMAGE', 'MANUAL')),
	CONSTRAINT "chk_fine_status" CHECK ("fines"."status" IN ('OUTSTANDING', 'PAID', 'WAIVED'))
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"patron_id" integer NOT NULL,
	"bib_id" integer NOT NULL,
	"item_id" integer,
	"request_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(30) DEFAULT 'WAITING' NOT NULL,
	"available_date" date,
	"expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_hold_status" CHECK ("holds"."status" IN ('WAITING', 'AVAILABLE_FOR_PICKUP', 'COMPLETED', 'EXPIRED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_type" varchar(20) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"total_rows" integer NOT NULL,
	"imported_rows" integer NOT NULL,
	"skipped_rows" integer NOT NULL,
	"imported_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_import_type" CHECK ("import_batches"."import_type" IN ('STUDENT', 'FACULTY', 'CATALOGUE'))
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"patron_id" integer NOT NULL,
	"library_id" integer NOT NULL,
	"issue_date" date DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"return_date" date,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'ISSUED' NOT NULL,
	"issued_by" integer NOT NULL,
	"returned_to" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_renewal_count" CHECK ("loans"."renewal_count" >= 0),
	CONSTRAINT "chk_loan_status" CHECK ("loans"."status" IN ('ISSUED', 'RETURNED', 'LOST'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"fine_id" integer NOT NULL,
	"patron_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"receipt_no" varchar(50) NOT NULL,
	"remarks" varchar(500),
	"received_by" integer NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_receipt_no_unique" UNIQUE("receipt_no"),
	CONSTRAINT "chk_payment_amount" CHECK ("payments"."amount" > 0),
	CONSTRAINT "chk_payment_method" CHECK ("payments"."payment_method" IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'WAIVED'))
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libraries" ADD CONSTRAINT "libraries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrons" ADD CONSTRAINT "patrons_category_id_patron_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."patron_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrons" ADD CONSTRAINT "patrons_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrons" ADD CONSTRAINT "patrons_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrons" ADD CONSTRAINT "patrons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bib_records" ADD CONSTRAINT "bib_records_item_type_id_item_types_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."item_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bib_records" ADD CONSTRAINT "bib_records_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_bib_id_bib_records_id_fk" FOREIGN KEY ("bib_id") REFERENCES "public"."bib_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulation_rules" ADD CONSTRAINT "circulation_rules_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulation_rules" ADD CONSTRAINT "circulation_rules_category_id_patron_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."patron_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulation_rules" ADD CONSTRAINT "circulation_rules_item_type_id_item_types_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."item_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_patron_id_patrons_id_fk" FOREIGN KEY ("patron_id") REFERENCES "public"."patrons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_patron_id_patrons_id_fk" FOREIGN KEY ("patron_id") REFERENCES "public"."patrons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_bib_id_bib_records_id_fk" FOREIGN KEY ("bib_id") REFERENCES "public"."bib_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_patron_id_patrons_id_fk" FOREIGN KEY ("patron_id") REFERENCES "public"."patrons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_to_users_id_fk" FOREIGN KEY ("returned_to") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_fine_id_fines_id_fk" FOREIGN KEY ("fine_id") REFERENCES "public"."fines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_patron_id_patrons_id_fk" FOREIGN KEY ("patron_id") REFERENCES "public"."patrons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_patrons_status" ON "patrons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_patrons_card_no" ON "patrons" USING btree ("card_no");--> statement-breakpoint
CREATE INDEX "idx_patrons_roll_no" ON "patrons" USING btree ("roll_no");--> statement-breakpoint
CREATE INDEX "idx_patrons_employee_id" ON "patrons" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_bib_records_isbn" ON "bib_records" USING btree ("isbn");--> statement-breakpoint
CREATE INDEX "idx_bib_records_title" ON "bib_records" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_bib_records_authors" ON "bib_records" USING btree ("authors");--> statement-breakpoint
CREATE INDEX "idx_bib_records_subject" ON "bib_records" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "idx_items_bib_id" ON "items" USING btree ("bib_id");--> statement-breakpoint
CREATE INDEX "idx_items_library_id" ON "items" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "idx_items_status" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_items_accession_no" ON "items" USING btree ("accession_no");--> statement-breakpoint
CREATE INDEX "idx_items_barcode" ON "items" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "idx_circ_rules_lookup" ON "circulation_rules" USING btree ("library_id","category_id","item_type_id");--> statement-breakpoint
CREATE INDEX "idx_fines_patron_status" ON "fines" USING btree ("patron_id","status");--> statement-breakpoint
CREATE INDEX "idx_fines_loan_id" ON "fines" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_hold_per_patron_title" ON "holds" USING btree ("patron_id","bib_id") WHERE status IN ('WAITING', 'AVAILABLE_FOR_PICKUP');--> statement-breakpoint
CREATE INDEX "idx_holds_bib_status" ON "holds" USING btree ("bib_id","status");--> statement-breakpoint
CREATE INDEX "idx_holds_patron_id" ON "holds" USING btree ("patron_id");--> statement-breakpoint
CREATE INDEX "idx_loans_item_id" ON "loans" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_loans_patron_id" ON "loans" USING btree ("patron_id");--> statement-breakpoint
CREATE INDEX "idx_loans_status_due_date" ON "loans" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "idx_payments_fine_id" ON "payments" USING btree ("fine_id");--> statement-breakpoint
CREATE INDEX "idx_payments_patron_id" ON "payments" USING btree ("patron_id");--> statement-breakpoint
CREATE INDEX "idx_payments_receipt_no" ON "payments" USING btree ("receipt_no");--> statement-breakpoint
CREATE VIEW "public"."v_accession_register" AS (
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
  LEFT JOIN vendors v ON i.vendor_id = v.id
);--> statement-breakpoint
CREATE VIEW "public"."v_active_loans" AS (
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
    CASE 
      WHEN CURRENT_DATE > l.due_date THEN (CURRENT_DATE - l.due_date)::int 
      ELSE 0 
    END AS days_overdue
  FROM loans l
  JOIN items i ON l.item_id = i.id
  JOIN bib_records b ON i.bib_id = b.id
  JOIN patrons p ON l.patron_id = p.id
  JOIN libraries lib ON l.library_id = lib.id
  JOIN users u ON l.issued_by = u.id
  WHERE l.status = 'ISSUED'
);--> statement-breakpoint
CREATE VIEW "public"."v_bib_availability" AS (
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
    COUNT(i.id)::int AS total_copies,
    COUNT(CASE WHEN i.status = 'AVAILABLE' THEN 1 END)::int AS available_copies,
    COUNT(CASE WHEN i.status = 'ISSUED' THEN 1 END)::int AS issued_copies,
    COUNT(CASE WHEN i.status = 'RESERVED' THEN 1 END)::int AS reserved_copies,
    COUNT(CASE WHEN i.status = 'REFERENCE_ONLY' THEN 1 END)::int AS reference_copies,
    COUNT(CASE WHEN i.status NOT IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY') THEN 1 END)::int AS other_copies,
    COALESCE(h.waiting_holds, 0)::int AS waiting_holds
  FROM bib_records b
  LEFT JOIN item_types it ON b.item_type_id = it.id
  LEFT JOIN departments d ON b.department_id = d.id
  LEFT JOIN items i ON b.id = i.bib_id
  LEFT JOIN (
    SELECT bib_id, COUNT(*)::int AS waiting_holds
    FROM holds
    WHERE status = 'WAITING'
    GROUP BY bib_id
  ) h ON b.id = h.bib_id
  GROUP BY b.id, it.name, d.name, h.waiting_holds
);--> statement-breakpoint
CREATE VIEW "public"."v_outstanding_fines" AS (
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
    (f.amount - f.paid_amount)::numeric(10, 2) AS balance_amount,
    f.created_at,
    u.full_name AS created_by_name
  FROM fines f
  JOIN patrons p ON f.patron_id = p.id
  JOIN users u ON f.created_by = u.id
  WHERE f.status = 'OUTSTANDING'
);--> statement-breakpoint
CREATE VIEW "public"."v_overdue_loans" AS (
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
    (CURRENT_DATE - l.due_date)::int AS days_overdue
  FROM loans l
  JOIN items i ON l.item_id = i.id
  JOIN bib_records b ON i.bib_id = b.id
  JOIN patrons p ON l.patron_id = p.id
  JOIN libraries lib ON l.library_id = lib.id
  WHERE l.status = 'ISSUED' AND CURRENT_DATE > l.due_date
);--> statement-breakpoint
CREATE VIEW "public"."v_patron_summary" AS (
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
    COALESCE(l.active_loans_count, 0)::int AS active_loans_count,
    COALESCE(l.overdue_loans_count, 0)::int AS overdue_loans_count,
    COALESCE(f.total_fines_balance, 0.00)::numeric(10, 2) AS total_fines_balance
  FROM patrons p
  JOIN patron_categories cat ON p.category_id = cat.id
  LEFT JOIN (
    SELECT 
      patron_id,
      COUNT(*)::int AS active_loans_count,
      COUNT(CASE WHEN CURRENT_DATE > due_date THEN 1 END)::int AS overdue_loans_count
    FROM loans
    WHERE status = 'ISSUED'
    GROUP BY patron_id
  ) l ON p.id = l.patron_id
  LEFT JOIN (
    SELECT 
      patron_id,
      SUM(amount - paid_amount)::numeric(10, 2) AS total_fines_balance
    FROM fines
    WHERE status = 'OUTSTANDING'
    GROUP BY patron_id
  ) f ON p.id = f.patron_id
);

-- ========================================================
-- 2. TABLE DATA DUMP (INSERT STATEMENTS)
-- ========================================================

-- Table: institutions (5 records)
INSERT INTO "institutions" ("id", "code", "name", "address", "is_active", "created_at", "updated_at") VALUES (1, 'RBMI-ENG', 'RBMI College of Engineering and Technology', 'Bareilly, UP', true, '2026-10-13T13:53:18.846Z', '2026-10-13T13:53:18.846Z') ON CONFLICT DO NOTHING;
INSERT INTO "institutions" ("id", "code", "name", "address", "is_active", "created_at", "updated_at") VALUES (2, 'RBMI-MGMT', 'RBMI College of Management', 'Bareilly, UP', true, '2026-10-13T13:53:18.846Z', '2026-10-13T13:53:18.846Z') ON CONFLICT DO NOTHING;
INSERT INTO "institutions" ("id", "code", "name", "address", "is_active", "created_at", "updated_at") VALUES (3, 'RBMI-PHARM', 'RBMI College of Pharmacy', 'Bareilly, UP', true, '2026-10-13T13:53:18.846Z', '2026-10-13T13:53:18.846Z') ON CONFLICT DO NOTHING;
INSERT INTO "institutions" ("id", "code", "name", "address", "is_active", "created_at", "updated_at") VALUES (4, 'RBMI-NURS', 'RBMI College of Nursing', 'Bareilly, UP', true, '2026-10-13T13:53:18.846Z', '2026-10-13T13:53:18.846Z') ON CONFLICT DO NOTHING;
INSERT INTO "institutions" ("id", "code", "name", "address", "is_active", "created_at", "updated_at") VALUES (5, 'RBMI-TECH', 'RBMI Institute of Technology and Management', 'Bareilly, UP', true, '2026-10-13T13:53:18.846Z', '2026-10-13T13:53:18.846Z') ON CONFLICT DO NOTHING;

-- Table: libraries (5 records)
INSERT INTO "libraries" ("id", "institution_id", "code", "name", "accession_prefix", "next_accession_no", "is_active", "created_at", "updated_at") VALUES (1, 1, 'CL', 'Central Library', 'CL', 22, true, '2026-10-13T13:53:18.885Z', '2026-10-13T13:53:18.885Z') ON CONFLICT DO NOTHING;
INSERT INTO "libraries" ("id", "institution_id", "code", "name", "accession_prefix", "next_accession_no", "is_active", "created_at", "updated_at") VALUES (2, 2, 'ML', 'Management Library', 'ML', 1, true, '2026-10-13T13:53:18.885Z', '2026-10-13T13:53:18.885Z') ON CONFLICT DO NOTHING;
INSERT INTO "libraries" ("id", "institution_id", "code", "name", "accession_prefix", "next_accession_no", "is_active", "created_at", "updated_at") VALUES (3, 3, 'PL', 'Pharmacy Library', 'PL', 1, true, '2026-10-13T13:53:18.885Z', '2026-10-13T13:53:18.885Z') ON CONFLICT DO NOTHING;
INSERT INTO "libraries" ("id", "institution_id", "code", "name", "accession_prefix", "next_accession_no", "is_active", "created_at", "updated_at") VALUES (4, 4, 'NL', 'Nursing Library', 'NL', 1, true, '2026-10-13T13:53:18.885Z', '2026-10-13T13:53:18.885Z') ON CONFLICT DO NOTHING;
INSERT INTO "libraries" ("id", "institution_id", "code", "name", "accession_prefix", "next_accession_no", "is_active", "created_at", "updated_at") VALUES (5, 5, 'TL', 'Technology Library', 'TL', 1, true, '2026-10-13T13:53:18.885Z', '2026-10-13T13:53:18.885Z') ON CONFLICT DO NOTHING;

-- Table: departments (12 records)
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (1, 1, 'CSE', 'Computer Science and Engineering', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (2, 1, 'IT', 'Information Technology', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (3, 1, 'ME', 'Mechanical Engineering', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (4, 1, 'CE', 'Civil Engineering', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (5, 1, 'ECE', 'Electronics and Communication', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (6, 1, 'EE', 'Electrical Engineering', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (7, 2, 'MBA', 'Management Studies (MBA)', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (8, 2, 'BBA', 'Business Administration (BBA)', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (9, 5, 'MCA', 'Computer Applications (MCA)', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (10, 5, 'BCA', 'Computer Applications (BCA)', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (11, 3, 'PHARM', 'Pharmaceutical Sciences', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;
INSERT INTO "departments" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at") VALUES (12, 4, 'NURS', 'Nursing Sciences', true, '2026-10-13T13:53:18.902Z', '2026-10-13T13:53:18.902Z') ON CONFLICT DO NOTHING;

-- Table: courses (11 records)
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (1, 1, 'BTECH-CS', 'B.Tech Computer Science', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (2, 1, 'BTECH-ME', 'B.Tech Mechanical Engineering', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (3, 1, 'BTECH-CE', 'B.Tech Civil Engineering', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (4, 1, 'BTECH-EE', 'B.Tech Electrical Engineering', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (5, 1, 'BTECH-EC', 'B.Tech Electronics Engineering', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (6, 2, 'MBA', 'Master of Business Administration', 2, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (7, 2, 'BBA', 'Bachelor of Business Administration', 3, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (8, 5, 'MCA', 'Master of Computer Applications', 2, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (9, 5, 'BCA', 'Bachelor of Computer Applications', 3, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (10, 3, 'BPHARM', 'Bachelor of Pharmacy', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;
INSERT INTO "courses" ("id", "institution_id", "code", "name", "duration_years", "is_active", "created_at", "updated_at") VALUES (11, 4, 'BSC-NURS', 'B.Sc Nursing', 4, true, '2026-10-13T13:53:18.914Z', '2026-10-13T13:53:18.914Z') ON CONFLICT DO NOTHING;

-- Table: roles (4 records)
INSERT INTO "roles" ("id", "code", "name", "description", "created_at") VALUES (1, 'SUPER_ADMIN', 'Super Administrator', 'Full system administration and staff management', '2026-10-13T13:53:18.953Z') ON CONFLICT DO NOTHING;
INSERT INTO "roles" ("id", "code", "name", "description", "created_at") VALUES (2, 'LIBRARY_ADMIN', 'Library Administrator', 'All library operations and system configurations except staff accounts', '2026-10-13T13:53:18.953Z') ON CONFLICT DO NOTHING;
INSERT INTO "roles" ("id", "code", "name", "description", "created_at") VALUES (3, 'LIBRARIAN', 'Librarian', 'Full circulation desk, back-office, imports, reports, waivers, clearance', '2026-10-13T13:53:18.953Z') ON CONFLICT DO NOTHING;
INSERT INTO "roles" ("id", "code", "name", "description", "created_at") VALUES (4, 'ASSISTANT_LIBRARIAN', 'Assistant Librarian', 'Desk operations: issue/return/renew, holds, fine collection, view records', '2026-10-13T13:53:18.953Z') ON CONFLICT DO NOTHING;

-- Table: permissions (21 records)
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (1, 'DASHBOARD_VIEW', 'Dashboard View', 'View staff dashboard') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (2, 'PATRON_VIEW', 'Patron View', 'Search and view patron profiles') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (3, 'CATALOG_VIEW', 'Catalogue View', 'Search and view catalogue records') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (4, 'CIRC_ISSUE', 'Circulation Issue', 'Issue books to patrons') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (5, 'CIRC_RETURN', 'Circulation Return', 'Return books from patrons') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (6, 'CIRC_RENEW', 'Circulation Renew', 'Renew active book loans') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (7, 'HOLD_MANAGE', 'Hold Management', 'Manage title reservations') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (8, 'FINE_COLLECT', 'Fine Collect', 'Receive fine payments and receipts') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (9, 'REPORT_VIEW', 'Report View', 'View, print, and export reports') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (10, 'PATRON_MANAGE', 'Patron Manage', 'Create and edit patron records') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (11, 'PATRON_IMPORT', 'Patron Import', 'Bulk import student and faculty CSV rosters') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (12, 'CATALOG_MANAGE', 'Catalogue Manage', 'Create and edit titles and copies') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (13, 'CATALOG_IMPORT', 'Catalogue Import', 'Bulk import book catalogue CSV') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (14, 'CIRC_LOST', 'Circulation Mark Lost', 'Declare checked out copy lost and charge') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (15, 'FINE_WAIVE', 'Fine Waive', 'Waive outstanding patron fines') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (16, 'NODUES_ISSUE', 'No-Dues Issue', 'Issue no-dues clearance certificates') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (17, 'ADMIN_RULES', 'Admin Rules', 'Configure circulation rules') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (18, 'ADMIN_SETTINGS', 'Admin Settings', 'Configure system settings') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (19, 'ADMIN_MASTERS', 'Admin Masters', 'Manage master entity data') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (20, 'AUDIT_VIEW', 'Audit View', 'Browse append-only audit trail') ON CONFLICT DO NOTHING;
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES (21, 'ADMIN_USERS', 'Admin Users', 'Manage staff user accounts') ON CONFLICT DO NOTHING;

-- Table: role_permissions (66 records)
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 1) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 2) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 3) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 4) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 5) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 6) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 7) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 8) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 9) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 10) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 11) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 12) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 13) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 14) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 15) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 16) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 17) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 18) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 19) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 20) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (1, 21) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 1) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 2) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 3) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 4) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 5) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 6) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 7) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 8) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 9) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 10) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 11) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 12) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 13) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 14) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 15) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 16) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 17) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 18) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 19) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (2, 20) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 1) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 2) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 3) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 4) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 5) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 6) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 7) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 8) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 9) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 10) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 11) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 12) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 13) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 14) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 15) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (3, 16) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 1) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 2) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 3) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 4) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 5) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 6) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 7) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 8) ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES (4, 9) ON CONFLICT DO NOTHING;

-- Table: users (3 records)
INSERT INTO "users" ("id", "username", "password_hash", "full_name", "role_id", "library_id", "is_active", "last_login", "created_at", "updated_at") VALUES (1, 'admin', '$argon2id$v=19$m=19456,t=2,p=1$fwheYwImZHKCGhGdmqknNw==$7+3kfwajk3GpxcJU/0mgJmo3zutUdTaj0JkrCFU2M2A=', 'System Administrator', 1, 1, true, NULL, '2026-10-13T13:53:19.102Z', '2026-10-13T13:53:19.102Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "username", "password_hash", "full_name", "role_id", "library_id", "is_active", "last_login", "created_at", "updated_at") VALUES (2, 'librarian', '$argon2id$v=19$m=19456,t=2,p=1$+yqvrzlVhB7ZR578EXJKCQ==$1aMWhAGVSOBCDthTsdF5MeO33FSZqEX37JpcoVQO34I=', 'Head Librarian', 3, 1, true, NULL, '2026-10-13T13:53:19.102Z', '2026-10-13T13:53:19.102Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "username", "password_hash", "full_name", "role_id", "library_id", "is_active", "last_login", "created_at", "updated_at") VALUES (3, 'assistant', '$argon2id$v=19$m=19456,t=2,p=1$aKZ+cpeyTpyMfoh2b35QbA==$zVi7NojxpR83CssghRMF+is7nWqBx0Fb8LhitGlYeus=', 'Circulation Assistant', 4, 1, true, NULL, '2026-10-13T13:53:19.102Z', '2026-10-13T13:53:19.102Z') ON CONFLICT DO NOTHING;

-- Table: patron_categories (15 records)
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (1, 'BTECH', 'B.Tech Student', 'STUDENT', 4, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (2, 'MBA', 'MBA Student', 'STUDENT', 2, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (3, 'MCA', 'MCA Student', 'STUDENT', 2, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (4, 'BBA', 'BBA Student', 'STUDENT', 3, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (5, 'BCA', 'BCA Student', 'STUDENT', 3, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (6, 'BPHARM', 'B.Pharm Student', 'STUDENT', 4, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (7, 'NURSING', 'Nursing Student', 'STUDENT', 4, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (8, 'DIPLOMA', 'Diploma Student', 'STUDENT', 3, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (9, 'FACULTY', 'Faculty Member', 'FACULTY', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (10, 'HOD', 'Head of Department', 'FACULTY', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (11, 'DEAN', 'Dean / Director', 'FACULTY', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (12, 'STAFF', 'Administrative Staff', 'STAFF', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (13, 'ADMIN_STAFF', 'Senior Staff', 'STAFF', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (14, 'LAB_ASST', 'Lab Assistant', 'STAFF', 5, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;
INSERT INTO "patron_categories" ("id", "code", "name", "patron_type", "card_validity_years", "is_active", "created_at", "updated_at") VALUES (15, 'GUEST', 'Guest / External Scholar', 'GUEST', 1, true, '2026-10-13T13:53:18.927Z', '2026-10-13T13:53:18.927Z') ON CONFLICT DO NOTHING;

-- Table: patrons (4 records)
INSERT INTO "patrons" ("id", "card_no", "patron_type", "category_id", "institution_id", "department_id", "course_id", "roll_no", "employee_id", "first_name", "middle_name", "last_name", "gender", "dob", "father_name", "mobile", "email", "address", "academic_year", "semester", "section", "admission_date", "course_end_date", "card_expiry", "status", "username", "password_hash", "must_change_password", "created_at", "updated_at") VALUES (1, '2301430100045', 'STUDENT', 1, 1, 1, 1, '2301430100045', NULL, 'Rahul', NULL, 'Kumar', NULL, NULL, NULL, '9876543201', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2027-06-30T00:00:00.000Z', 'ACTIVE', '2301430100045', '$argon2id$v=19$m=19456,t=2,p=1$nyK3qyDrJ8UmXEQzAfF+pw==$FP6D8rdIjtLNpJ35NlV7mE0Da/7nlmVZ+Kk7r/RI0X0=', true, '2026-10-13T13:53:19.235Z', '2026-10-13T13:53:19.235Z') ON CONFLICT DO NOTHING;
INSERT INTO "patrons" ("id", "card_no", "patron_type", "category_id", "institution_id", "department_id", "course_id", "roll_no", "employee_id", "first_name", "middle_name", "last_name", "gender", "dob", "father_name", "mobile", "email", "address", "academic_year", "semester", "section", "admission_date", "course_end_date", "card_expiry", "status", "username", "password_hash", "must_change_password", "created_at", "updated_at") VALUES (2, '2301430100062', 'STUDENT', 1, 1, 1, 1, '2301430100062', NULL, 'Priya', NULL, 'Sharma', NULL, NULL, NULL, '9876543202', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2027-06-30T00:00:00.000Z', 'ACTIVE', '2301430100062', '$argon2id$v=19$m=19456,t=2,p=1$gnrgivjTqHhH5Ckh9Y9KwQ==$Ap7z4akODlUYscVi1mRiNig0CW3hcETEFCYKC7xUiG4=', true, '2026-10-13T13:53:19.235Z', '2026-10-13T13:53:19.235Z') ON CONFLICT DO NOTHING;
INSERT INTO "patrons" ("id", "card_no", "patron_type", "category_id", "institution_id", "department_id", "course_id", "roll_no", "employee_id", "first_name", "middle_name", "last_name", "gender", "dob", "father_name", "mobile", "email", "address", "academic_year", "semester", "section", "admission_date", "course_end_date", "card_expiry", "status", "username", "password_hash", "must_change_password", "created_at", "updated_at") VALUES (3, '2201430100033', 'STUDENT', 1, 1, 1, 1, '2201430100033', NULL, 'Neha', NULL, 'Gupta', NULL, NULL, NULL, '9876543203', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-30T00:00:00.000Z', 'ACTIVE', '2201430100033', '$argon2id$v=19$m=19456,t=2,p=1$yXQLlprQi+xeq1CG4gf9OQ==$gOF45cpyBjVC6K5BHpEbkJdVLzMYd7LapGBxCAuo5Zc=', true, '2026-10-13T13:53:19.235Z', '2026-10-13T13:53:19.235Z') ON CONFLICT DO NOTHING;
INSERT INTO "patrons" ("id", "card_no", "patron_type", "category_id", "institution_id", "department_id", "course_id", "roll_no", "employee_id", "first_name", "middle_name", "last_name", "gender", "dob", "father_name", "mobile", "email", "address", "academic_year", "semester", "section", "admission_date", "course_end_date", "card_expiry", "status", "username", "password_hash", "must_change_password", "created_at", "updated_at") VALUES (4, 'E1001', 'FACULTY', 2, 1, 2, NULL, NULL, 'E1001', 'Suresh', NULL, 'Chandra', NULL, NULL, NULL, '9876543204', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2031-06-30T00:00:00.000Z', 'ACTIVE', 'E1001', '$argon2id$v=19$m=19456,t=2,p=1$rO2yByjMhOn+HSPmucmE2A==$HSrW2csVlYfNm9b3sr76zTyjisA+DaTGYW6gGTtU4qs=', true, '2026-10-13T13:53:19.235Z', '2026-10-13T13:53:19.235Z') ON CONFLICT DO NOTHING;

-- Table: item_types (7 records)
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (1, 'BOOK', 'Textbook', false, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (2, 'REF', 'Reference Book', true, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (3, 'JOURNAL', 'Academic Journal', true, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (4, 'MAGAZINE', 'Periodical / Magazine', false, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (5, 'PROJECT', 'Student Project Report', true, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (6, 'THESIS', 'Master/Doctoral Thesis', true, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;
INSERT INTO "item_types" ("id", "code", "name", "is_reference", "is_active", "created_at", "updated_at") VALUES (7, 'GEN', 'General Reading', false, true, '2026-10-13T13:53:18.940Z', '2026-10-13T13:53:18.940Z') ON CONFLICT DO NOTHING;

-- Table: bib_records (4 records)
INSERT INTO "bib_records" ("id", "isbn", "title", "subtitle", "authors", "editors", "edition", "publisher", "place_of_publication", "pub_year", "pages", "language", "subject", "keywords", "ddc_number", "call_number", "item_type_id", "department_id", "summary", "price", "created_at", "updated_at") VALUES (1, '9780073380322', 'Fluid Mechanics', NULL, 'Frank M. White', NULL, NULL, 'McGraw-Hill', NULL, 2017, NULL, 'English', NULL, NULL, NULL, NULL, 1, 2, NULL, '650.00', '2026-10-13T13:53:19.247Z', '2026-10-13T13:53:19.247Z') ON CONFLICT DO NOTHING;
INSERT INTO "bib_records" ("id", "isbn", "title", "subtitle", "authors", "editors", "edition", "publisher", "place_of_publication", "pub_year", "pages", "language", "subject", "keywords", "ddc_number", "call_number", "item_type_id", "department_id", "summary", "price", "created_at", "updated_at") VALUES (2, '9780262033848', 'Introduction to Algorithms', NULL, 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein', NULL, NULL, 'MIT Press', NULL, 2009, NULL, 'English', NULL, NULL, NULL, NULL, 1, 1, NULL, '1200.00', '2026-10-13T13:53:19.247Z', '2026-10-13T13:53:19.247Z') ON CONFLICT DO NOTHING;
INSERT INTO "bib_records" ("id", "isbn", "title", "subtitle", "authors", "editors", "edition", "publisher", "place_of_publication", "pub_year", "pages", "language", "subject", "keywords", "ddc_number", "call_number", "item_type_id", "department_id", "summary", "price", "created_at", "updated_at") VALUES (3, '9780078022159', 'Database System Concepts', NULL, 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan', NULL, NULL, 'McGraw-Hill', NULL, 2019, NULL, 'English', NULL, NULL, NULL, NULL, 1, 1, NULL, '750.00', '2026-10-13T13:53:19.247Z', '2026-10-13T13:53:19.247Z') ON CONFLICT DO NOTHING;
INSERT INTO "bib_records" ("id", "isbn", "title", "subtitle", "authors", "editors", "edition", "publisher", "place_of_publication", "pub_year", "pages", "language", "subject", "keywords", "ddc_number", "call_number", "item_type_id", "department_id", "summary", "price", "created_at", "updated_at") VALUES (4, '9788123904000', 'Design Data Handbook', NULL, 'K. Lingaiah', NULL, NULL, 'CBS Publishers', NULL, 2010, NULL, 'English', NULL, NULL, NULL, NULL, 2, 2, NULL, '850.00', '2026-10-13T13:53:19.247Z', '2026-10-13T13:53:19.247Z') ON CONFLICT DO NOTHING;

-- Table: items (5 records)
INSERT INTO "items" ("id", "bib_id", "library_id", "accession_no", "barcode", "call_number", "location", "price", "vendor_id", "invoice_no", "acquisition_date", "status", "condition_note", "created_at", "updated_at") VALUES (1, 1, 1, 'CL000001', 'CL000001', NULL, 'ME-01-A', '650.00', NULL, NULL, '2026-10-13T00:00:00.000Z', 'ISSUED', NULL, '2026-10-13T13:53:19.256Z', '2026-10-13T13:53:19.256Z') ON CONFLICT DO NOTHING;
INSERT INTO "items" ("id", "bib_id", "library_id", "accession_no", "barcode", "call_number", "location", "price", "vendor_id", "invoice_no", "acquisition_date", "status", "condition_note", "created_at", "updated_at") VALUES (2, 2, 1, 'CL000007', 'CL000007', NULL, 'CS-03-B', '1200.00', NULL, NULL, '2026-10-13T00:00:00.000Z', 'ISSUED', NULL, '2026-10-13T13:53:19.256Z', '2026-10-13T13:53:19.256Z') ON CONFLICT DO NOTHING;
INSERT INTO "items" ("id", "bib_id", "library_id", "accession_no", "barcode", "call_number", "location", "price", "vendor_id", "invoice_no", "acquisition_date", "status", "condition_note", "created_at", "updated_at") VALUES (3, 2, 1, 'CL000008', 'CL000008', NULL, 'CS-03-B', '1200.00', NULL, NULL, '2026-10-13T00:00:00.000Z', 'ISSUED', NULL, '2026-10-13T13:53:19.256Z', '2026-10-13T13:53:19.256Z') ON CONFLICT DO NOTHING;
INSERT INTO "items" ("id", "bib_id", "library_id", "accession_no", "barcode", "call_number", "location", "price", "vendor_id", "invoice_no", "acquisition_date", "status", "condition_note", "created_at", "updated_at") VALUES (4, 3, 1, 'CL000009', 'CL000009', NULL, 'CS-02-C', '750.00', NULL, NULL, '2026-10-13T00:00:00.000Z', 'AVAILABLE', NULL, '2026-10-13T13:53:19.256Z', '2026-10-13T13:53:19.256Z') ON CONFLICT DO NOTHING;
INSERT INTO "items" ("id", "bib_id", "library_id", "accession_no", "barcode", "call_number", "location", "price", "vendor_id", "invoice_no", "acquisition_date", "status", "condition_note", "created_at", "updated_at") VALUES (5, 4, 1, 'CL000021', 'CL000021', NULL, 'REF-01', '850.00', NULL, NULL, '2026-10-13T00:00:00.000Z', 'REFERENCE_ONLY', NULL, '2026-10-13T13:53:19.256Z', '2026-10-13T13:53:19.256Z') ON CONFLICT DO NOTHING;

-- Table: vendors (2 records)
INSERT INTO "vendors" ("id", "name", "contact_person", "phone", "email", "gst_no", "address", "is_active", "created_at", "updated_at") VALUES (1, 'Asian Books Distributor', 'Rajesh Sharma', '9876543210', 'contact@asianbooks.com', '09AABCA1234F1Z1', 'Station Road, Bareilly', true, '2026-10-13T13:53:18.946Z', '2026-10-13T13:53:18.946Z') ON CONFLICT DO NOTHING;
INSERT INTO "vendors" ("id", "name", "contact_person", "phone", "email", "gst_no", "address", "is_active", "created_at", "updated_at") VALUES (2, 'Oxford University Press India', 'Amit Verma', '9812345678', 'sales@oup.in', '07AAACU1234B1Z5', 'YMCA Library Building, New Delhi', true, '2026-10-13T13:53:18.946Z', '2026-10-13T13:53:18.946Z') ON CONFLICT DO NOTHING;

-- Table: circulation_rules (20 records)
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (1, NULL, 1, 1, 4, 14, 2, '2.00', 0, '200.00', true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (2, NULL, NULL, 2, 0, 0, 0, '5.00', 0, '500.00', false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (3, NULL, 2, 2, 2, 3, 1, '5.00', 0, '300.00', true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (4, NULL, 2, 1, 6, 30, 3, '1.00', 2, '300.00', true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (5, NULL, 3, NULL, 1, 7, 0, '5.00', 0, '100.00', false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (6, NULL, 1, 3, 0, 0, 0, '10.00', 0, NULL, false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (7, NULL, 2, 3, 3, 7, 1, '5.00', 1, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (8, 1, 1, NULL, 4, 14, 2, '2.00', 0, '200.00', true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (9, 2, NULL, NULL, 3, 14, 1, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (10, 3, NULL, NULL, 3, 14, 1, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (11, 4, NULL, NULL, 3, 14, 1, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (12, 5, NULL, NULL, 3, 14, 1, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (13, NULL, 2, NULL, 6, 30, 3, '1.00', 2, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (14, NULL, 1, NULL, 4, 14, 2, '2.00', 0, '200.00', true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (15, NULL, NULL, 1, 3, 14, 1, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (16, NULL, NULL, 2, 0, 0, 0, '5.00', 0, NULL, false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (17, NULL, NULL, 3, 1, 3, 0, '10.00', 0, NULL, false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (18, NULL, 3, 1, 1, 7, 0, '5.00', 0, NULL, false, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (19, 1, NULL, 1, 4, 14, 2, '2.00', 0, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;
INSERT INTO "circulation_rules" ("id", "library_id", "category_id", "item_type_id", "max_books", "loan_days", "max_renewals", "fine_per_day", "grace_days", "max_fine", "holds_allowed", "created_at", "updated_at") VALUES (20, 1, 2, NULL, 6, 30, 3, '1.00', 2, NULL, true, '2026-10-13T13:53:19.115Z', '2026-10-13T13:53:19.115Z') ON CONFLICT DO NOTHING;

-- Table: loans (3 records)
INSERT INTO "loans" ("id", "item_id", "patron_id", "library_id", "issue_date", "due_date", "return_date", "renewal_count", "status", "issued_by", "returned_to", "created_at", "updated_at") VALUES (1, 1, 1, 1, '2026-09-17T00:00:00.000Z', '2026-10-01T00:00:00.000Z', NULL, 0, 'ISSUED', 2, NULL, '2026-10-13T13:53:19.272Z', '2026-10-13T13:53:19.272Z') ON CONFLICT DO NOTHING;
INSERT INTO "loans" ("id", "item_id", "patron_id", "library_id", "issue_date", "due_date", "return_date", "renewal_count", "status", "issued_by", "returned_to", "created_at", "updated_at") VALUES (2, 2, 2, 1, '2026-10-13T00:00:00.000Z', '2026-10-27T00:00:00.000Z', NULL, 0, 'ISSUED', 2, NULL, '2026-10-13T13:53:19.272Z', '2026-10-13T13:53:19.272Z') ON CONFLICT DO NOTHING;
INSERT INTO "loans" ("id", "item_id", "patron_id", "library_id", "issue_date", "due_date", "return_date", "renewal_count", "status", "issued_by", "returned_to", "created_at", "updated_at") VALUES (3, 3, 4, 1, '2026-10-13T00:00:00.000Z', '2026-10-27T00:00:00.000Z', NULL, 0, 'ISSUED', 2, NULL, '2026-10-13T13:53:19.272Z', '2026-10-13T13:53:19.272Z') ON CONFLICT DO NOTHING;

-- Table: holds (1 records)
INSERT INTO "holds" ("id", "patron_id", "bib_id", "item_id", "request_date", "status", "available_date", "expiry_date", "created_at", "updated_at") VALUES (1, 3, 2, NULL, '2026-10-13T13:53:19.282Z', 'WAITING', NULL, NULL, '2026-10-13T13:53:19.282Z', '2026-10-13T13:53:19.282Z') ON CONFLICT DO NOTHING;

-- Table: system_settings (17 records)
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (1, 'LIBRARY_NAME', 'RBMI Central Library', 'Header and printout title', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (2, 'INSTITUTE_NAME', 'RBMI Group of Institutions, Bareilly', 'Institutional name', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (3, 'ACADEMIC_SESSION', '2026-27', 'Current academic session', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (4, 'DEFAULT_LOAN_DAYS', '14', 'Default loan duration in days', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (5, 'DEFAULT_MAX_BOOKS', '3', 'Default simultaneous books allowed', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (6, 'DEFAULT_MAX_RENEWALS', '1', 'Default maximum renewals', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (7, 'DEFAULT_FINE_PER_DAY', '2.00', 'Default overdue fine per day (Rs)', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (8, 'DEFAULT_GRACE_DAYS', '0', 'Default overdue grace days', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (9, 'FINE_BLOCK_LIMIT', '100.00', 'Fine balance threshold that blocks checkout', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (10, 'BLOCK_ISSUE_IF_OVERDUE', 'true', 'Block checkout if patron has any overdue loan', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (11, 'HOLD_PICKUP_DAYS', '2', 'Days a returned reserved book is held for pickup', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (12, 'LOST_PROCESSING_FEE', '50.00', 'Administrative fee charged for lost items', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (13, 'CARD_PREFIX', 'LIB', 'Prefix for auto-generated library cards', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (14, 'RECEIPT_PREFIX', 'RCPT', 'Prefix for payment and waiver receipts', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (15, 'NEW_ARRIVAL_DAYS', '30', 'Window in days for OPAC new arrivals', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (16, 'OPAC_ALLOW_HOLDS', 'true', 'Allow patrons to place holds through OPAC', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;
INSERT INTO "system_settings" ("id", "setting_key", "setting_value", "description", "updated_at") VALUES (17, 'LABEL_TITLE', 'RBMI Library', 'Header text for spine and barcode labels', '2026-10-13T13:53:19.109Z') ON CONFLICT DO NOTHING;

