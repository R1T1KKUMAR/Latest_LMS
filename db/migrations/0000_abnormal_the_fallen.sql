CREATE SEQUENCE "public"."seq_card_no" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."seq_receipt_no" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"duration_years" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_librarian_available" boolean DEFAULT true NOT NULL,
	"librarian_status_note" text,
	"librarian_status_updated_at" timestamp with time zone,
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
	"is_librarian_available" boolean DEFAULT true NOT NULL,
	"librarian_status_note" text,
	"librarian_status_updated_at" timestamp with time zone,
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
	"is_available" boolean DEFAULT true NOT NULL,
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
	"library_id" integer,
	"institution_id" integer,
	"department_id" integer,
	"course_id" integer,
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrons_card_no_unique" UNIQUE("card_no"),
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
	"import_batch_id" integer,
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "chk_item_price" CHECK ("items"."price" >= 0),
	CONSTRAINT "chk_item_status" CHECK ("items"."status" IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY', 'LOST', 'DAMAGED', 'REPAIR', 'WITHDRAWN', 'PROCESSING'))
);
--> statement-breakpoint
CREATE TABLE "items_cl" (
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_cl_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_cl_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "items_lib_gn" (
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_lib_gn_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_lib_gn_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "items_rbcp" (
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_rbcp_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_rbcp_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "items_rbcn" (
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
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_rbcn_accession_no_unique" UNIQUE("accession_no"),
	CONSTRAINT "items_rbcn_barcode_unique" UNIQUE("barcode")
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
ALTER TABLE "bib_records" ADD CONSTRAINT "bib_records_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bib_records" ADD CONSTRAINT "bib_records_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_bib_id_bib_records_id_fk" FOREIGN KEY ("bib_id") REFERENCES "public"."bib_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "patrons" ADD CONSTRAINT "patrons_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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