import { hashPassword } from "@/lib/crypto";
import type { AnyDatabase } from "./client";
import * as schema from "./schema";

export async function seedDatabase(db: AnyDatabase) {
  console.log("🌱 Seeding database...");

  // 1. Institutions (5 institutions)
  const [instEng, instMgmt, instPharm, instNurs, instTech] = await db
    .insert(schema.institutions)
    .values([
      {
        code: "RBMI-ENG",
        name: "RBMI College of Engineering and Technology",
        address: "Bareilly, UP",
      },
      {
        code: "RBMI-MGMT",
        name: "RBMI College of Management",
        address: "Bareilly, UP",
      },
      {
        code: "RBMI-PHARM",
        name: "RBMI College of Pharmacy",
        address: "Bareilly, UP",
      },
      {
        code: "RBMI-NURS",
        name: "RBMI College of Nursing",
        address: "Bareilly, UP",
      },
      {
        code: "RBMI-TECH",
        name: "RBMI Institute of Technology and Management",
        address: "Bareilly, UP",
      },
    ])
    .returning();

  // 2. Libraries (5 libraries: CL, ML, PL, NL, TL)
  const [libCl, libMl, libPl, libNl, libTl] = await db
    .insert(schema.libraries)
    .values([
      {
        institutionId: instEng.id,
        code: "CL",
        name: "Central Library",
        accessionPrefix: "CL",
        nextAccessionNo: 22,
      },
      {
        institutionId: instMgmt.id,
        code: "ML",
        name: "Management Library",
        accessionPrefix: "ML",
        nextAccessionNo: 1,
      },
      {
        institutionId: instPharm.id,
        code: "PL",
        name: "Pharmacy Library",
        accessionPrefix: "PL",
        nextAccessionNo: 1,
      },
      {
        institutionId: instNurs.id,
        code: "NL",
        name: "Nursing Library",
        accessionPrefix: "NL",
        nextAccessionNo: 1,
      },
      {
        institutionId: instTech.id,
        code: "TL",
        name: "Technology Library",
        accessionPrefix: "TL",
        nextAccessionNo: 1,
      },
    ])
    .returning();

  // 3. Departments (12 departments)
  const [deptCse, deptMe] = await db
    .insert(schema.departments)
    .values([
      { institutionId: instEng.id, code: "CSE", name: "Computer Science and Engineering" },
      { institutionId: instEng.id, code: "IT", name: "Information Technology" },
      { institutionId: instEng.id, code: "ME", name: "Mechanical Engineering" },
      { institutionId: instEng.id, code: "CE", name: "Civil Engineering" },
      { institutionId: instEng.id, code: "ECE", name: "Electronics and Communication" },
      { institutionId: instEng.id, code: "EE", name: "Electrical Engineering" },
      { institutionId: instMgmt.id, code: "MBA", name: "Management Studies (MBA)" },
      { institutionId: instMgmt.id, code: "BBA", name: "Business Administration (BBA)" },
      { institutionId: instTech.id, code: "MCA", name: "Computer Applications (MCA)" },
      { institutionId: instTech.id, code: "BCA", name: "Computer Applications (BCA)" },
      { institutionId: instPharm.id, code: "PHARM", name: "Pharmaceutical Sciences" },
      { institutionId: instNurs.id, code: "NURS", name: "Nursing Sciences" },
    ])
    .returning();

  // 4. Courses (11 courses)
  const [courseBtech] = await db
    .insert(schema.courses)
    .values([
      {
        institutionId: instEng.id,
        code: "BTECH-CS",
        name: "B.Tech Computer Science",
        durationYears: 4,
      },
      {
        institutionId: instEng.id,
        code: "BTECH-ME",
        name: "B.Tech Mechanical Engineering",
        durationYears: 4,
      },
      {
        institutionId: instEng.id,
        code: "BTECH-CE",
        name: "B.Tech Civil Engineering",
        durationYears: 4,
      },
      {
        institutionId: instEng.id,
        code: "BTECH-EE",
        name: "B.Tech Electrical Engineering",
        durationYears: 4,
      },
      {
        institutionId: instEng.id,
        code: "BTECH-EC",
        name: "B.Tech Electronics Engineering",
        durationYears: 4,
      },
      {
        institutionId: instMgmt.id,
        code: "MBA",
        name: "Master of Business Administration",
        durationYears: 2,
      },
      {
        institutionId: instMgmt.id,
        code: "BBA",
        name: "Bachelor of Business Administration",
        durationYears: 3,
      },
      {
        institutionId: instTech.id,
        code: "MCA",
        name: "Master of Computer Applications",
        durationYears: 2,
      },
      {
        institutionId: instTech.id,
        code: "BCA",
        name: "Bachelor of Computer Applications",
        durationYears: 3,
      },
      {
        institutionId: instPharm.id,
        code: "BPHARM",
        name: "Bachelor of Pharmacy",
        durationYears: 4,
      },
      { institutionId: instNurs.id, code: "BSC-NURS", name: "B.Sc Nursing", durationYears: 4 },
    ])
    .returning();

  // 5. Patron Categories (15 categories)
  const [catBtech, catFaculty, catGuest] = await db
    .insert(schema.patronCategories)
    .values([
      { code: "BTECH", name: "B.Tech Student", patronType: "STUDENT", cardValidityYears: 4 },
      { code: "MBA", name: "MBA Student", patronType: "STUDENT", cardValidityYears: 2 },
      { code: "MCA", name: "MCA Student", patronType: "STUDENT", cardValidityYears: 2 },
      { code: "BBA", name: "BBA Student", patronType: "STUDENT", cardValidityYears: 3 },
      { code: "BCA", name: "BCA Student", patronType: "STUDENT", cardValidityYears: 3 },
      { code: "BPHARM", name: "B.Pharm Student", patronType: "STUDENT", cardValidityYears: 4 },
      { code: "NURSING", name: "Nursing Student", patronType: "STUDENT", cardValidityYears: 4 },
      { code: "DIPLOMA", name: "Diploma Student", patronType: "STUDENT", cardValidityYears: 3 },
      { code: "FACULTY", name: "Faculty Member", patronType: "FACULTY", cardValidityYears: 5 },
      { code: "HOD", name: "Head of Department", patronType: "FACULTY", cardValidityYears: 5 },
      { code: "DEAN", name: "Dean / Director", patronType: "FACULTY", cardValidityYears: 5 },
      { code: "STAFF", name: "Administrative Staff", patronType: "STAFF", cardValidityYears: 5 },
      { code: "ADMIN_STAFF", name: "Senior Staff", patronType: "STAFF", cardValidityYears: 5 },
      { code: "LAB_ASST", name: "Lab Assistant", patronType: "STAFF", cardValidityYears: 5 },
      {
        code: "GUEST",
        name: "Guest / External Scholar",
        patronType: "GUEST",
        cardValidityYears: 1,
      },
    ])
    .returning();

  // 6. Item Types (7 item types)
  const [itemBook, itemRef, itemJournal] = await db
    .insert(schema.itemTypes)
    .values([
      { code: "BOOK", name: "Textbook", isReference: false },
      { code: "REF", name: "Reference Book", isReference: true },
      { code: "JOURNAL", name: "Academic Journal", isReference: true },
      { code: "MAGAZINE", name: "Periodical / Magazine", isReference: false },
      { code: "PROJECT", name: "Student Project Report", isReference: true },
      { code: "THESIS", name: "Master/Doctoral Thesis", isReference: true },
      { code: "GEN", name: "General Reading", isReference: false },
    ])
    .returning();

  // 7. Vendors (2 vendors)
  const [_vendor1, _vendor2] = await db
    .insert(schema.vendors)
    .values([
      {
        name: "Asian Books Distributor",
        contactPerson: "Rajesh Sharma",
        phone: "9876543210",
        email: "contact@asianbooks.com",
        gstNo: "09AABCA1234F1Z1",
        address: "Station Road, Bareilly",
      },
      {
        name: "Oxford University Press India",
        contactPerson: "Amit Verma",
        phone: "9812345678",
        email: "sales@oup.in",
        gstNo: "07AAACU1234B1Z5",
        address: "YMCA Library Building, New Delhi",
      },
    ])
    .returning();

  // 8. Roles (4 roles)
  const [roleSuperAdmin, roleLibAdmin, roleLibrarian, roleAsst] = await db
    .insert(schema.roles)
    .values([
      {
        code: "SUPER_ADMIN",
        name: "Super Administrator",
        description: "Full system administration and staff management",
      },
      {
        code: "LIBRARY_ADMIN",
        name: "Library Administrator",
        description: "All library operations and system configurations except staff accounts",
      },
      {
        code: "LIBRARIAN",
        name: "Librarian",
        description: "Full circulation desk, back-office, imports, reports, waivers, clearance",
      },
      {
        code: "ASSISTANT_LIBRARIAN",
        name: "Assistant Librarian",
        description: "Desk operations: issue/return/renew, holds, fine collection, view records",
      },
    ])
    .returning();

  // 9. Permissions (21 permissions)
  const permissionDefs = [
    { code: "DASHBOARD_VIEW", name: "Dashboard View", description: "View staff dashboard" },
    { code: "PATRON_VIEW", name: "Patron View", description: "Search and view patron profiles" },
    {
      code: "CATALOG_VIEW",
      name: "Catalogue View",
      description: "Search and view catalogue records",
    },
    { code: "CIRC_ISSUE", name: "Circulation Issue", description: "Issue books to patrons" },
    { code: "CIRC_RETURN", name: "Circulation Return", description: "Return books from patrons" },
    { code: "CIRC_RENEW", name: "Circulation Renew", description: "Renew active book loans" },
    { code: "HOLD_MANAGE", name: "Hold Management", description: "Manage title reservations" },
    {
      code: "FINE_COLLECT",
      name: "Fine Collect",
      description: "Receive fine payments and receipts",
    },
    { code: "REPORT_VIEW", name: "Report View", description: "View, print, and export reports" },
    { code: "PATRON_MANAGE", name: "Patron Manage", description: "Create and edit patron records" },
    {
      code: "PATRON_IMPORT",
      name: "Patron Import",
      description: "Bulk import student and faculty CSV rosters",
    },
    {
      code: "CATALOG_MANAGE",
      name: "Catalogue Manage",
      description: "Create and edit titles and copies",
    },
    {
      code: "CATALOG_IMPORT",
      name: "Catalogue Import",
      description: "Bulk import book catalogue CSV",
    },
    {
      code: "CIRC_LOST",
      name: "Circulation Mark Lost",
      description: "Declare checked out copy lost and charge",
    },
    { code: "FINE_WAIVE", name: "Fine Waive", description: "Waive outstanding patron fines" },
    {
      code: "NODUES_ISSUE",
      name: "No-Dues Issue",
      description: "Issue no-dues clearance certificates",
    },
    { code: "ADMIN_RULES", name: "Admin Rules", description: "Configure circulation rules" },
    { code: "ADMIN_SETTINGS", name: "Admin Settings", description: "Configure system settings" },
    { code: "ADMIN_MASTERS", name: "Admin Masters", description: "Manage master entity data" },
    { code: "AUDIT_VIEW", name: "Audit View", description: "Browse append-only audit trail" },
    { code: "ADMIN_USERS", name: "Admin Users", description: "Manage staff user accounts" },
  ];

  const insertedPermissions = await db
    .insert(schema.permissions)
    .values(permissionDefs)
    .returning();

  const _permMap = new Map(
    insertedPermissions.map((p: { code: string; id: number }) => [p.code, p.id]),
  );

  // 10. Role Permissions assignments per Appendix 10.3
  const rolePermEntries: Array<{ roleId: number; permissionId: number }> = [];

  // Super Admin: all 21
  for (const p of insertedPermissions) {
    rolePermEntries.push({ roleId: roleSuperAdmin.id, permissionId: p.id });
  }

  // Library Admin: 20 (all except ADMIN_USERS)
  for (const p of insertedPermissions) {
    if (p.code !== "ADMIN_USERS") {
      rolePermEntries.push({ roleId: roleLibAdmin.id, permissionId: p.id });
    }
  }

  // Librarian: 16 (all except ADMIN_* and AUDIT_VIEW)
  const librarianExcluded = new Set([
    "ADMIN_RULES",
    "ADMIN_SETTINGS",
    "ADMIN_MASTERS",
    "AUDIT_VIEW",
    "ADMIN_USERS",
  ]);
  for (const p of insertedPermissions) {
    if (!librarianExcluded.has(p.code)) {
      rolePermEntries.push({ roleId: roleLibrarian.id, permissionId: p.id });
    }
  }

  // Assistant Librarian: 9 desk operations
  const assistantIncluded = new Set([
    "DASHBOARD_VIEW",
    "PATRON_VIEW",
    "CATALOG_VIEW",
    "CIRC_ISSUE",
    "CIRC_RETURN",
    "CIRC_RENEW",
    "HOLD_MANAGE",
    "FINE_COLLECT",
    "REPORT_VIEW",
  ]);
  for (const p of insertedPermissions) {
    if (assistantIncluded.has(p.code)) {
      rolePermEntries.push({ roleId: roleAsst.id, permissionId: p.id });
    }
  }

  await db.insert(schema.rolePermissions).values(rolePermEntries);

  // 11. Staff Users (DR-08, Section 10.4)
  const [_userAdmin, userLibrarian, _userAssistant] = await db
    .insert(schema.users)
    .values([
      {
        username: "admin",
        passwordHash: hashPassword("Admin@123"),
        fullName: "System Administrator",
        roleId: roleSuperAdmin.id,
        libraryId: libCl.id,
        isActive: true,
      },
      {
        username: "librarian",
        passwordHash: hashPassword("Lib@123"),
        fullName: "Head Librarian",
        roleId: roleLibrarian.id,
        libraryId: libCl.id,
        isActive: true,
      },
      {
        username: "assistant",
        passwordHash: hashPassword("Asst@123"),
        fullName: "Circulation Assistant",
        roleId: roleAsst.id,
        libraryId: libCl.id,
        isActive: true,
      },
    ])
    .returning();

  // 12. System Settings (17 settings per Section 10.2)
  await db.insert(schema.systemSettings).values([
    {
      settingKey: "LIBRARY_NAME",
      settingValue: "RBMI Central Library",
      description: "Header and printout title",
    },
    {
      settingKey: "INSTITUTE_NAME",
      settingValue: "RBMI Group of Institutions, Bareilly",
      description: "Institutional name",
    },
    {
      settingKey: "ACADEMIC_SESSION",
      settingValue: "2026-27",
      description: "Current academic session",
    },
    {
      settingKey: "DEFAULT_LOAN_DAYS",
      settingValue: "14",
      description: "Default loan duration in days",
    },
    {
      settingKey: "DEFAULT_MAX_BOOKS",
      settingValue: "3",
      description: "Default simultaneous books allowed",
    },
    {
      settingKey: "DEFAULT_MAX_RENEWALS",
      settingValue: "1",
      description: "Default maximum renewals",
    },
    {
      settingKey: "DEFAULT_FINE_PER_DAY",
      settingValue: "2.00",
      description: "Default overdue fine per day (Rs)",
    },
    {
      settingKey: "DEFAULT_GRACE_DAYS",
      settingValue: "0",
      description: "Default overdue grace days",
    },
    {
      settingKey: "FINE_BLOCK_LIMIT",
      settingValue: "100.00",
      description: "Fine balance threshold that blocks checkout",
    },
    {
      settingKey: "BLOCK_ISSUE_IF_OVERDUE",
      settingValue: "true",
      description: "Block checkout if patron has any overdue loan",
    },
    {
      settingKey: "HOLD_PICKUP_DAYS",
      settingValue: "2",
      description: "Days a returned reserved book is held for pickup",
    },
    {
      settingKey: "LOST_PROCESSING_FEE",
      settingValue: "50.00",
      description: "Administrative fee charged for lost items",
    },
    {
      settingKey: "CARD_PREFIX",
      settingValue: "LIB",
      description: "Prefix for auto-generated library cards",
    },
    {
      settingKey: "RECEIPT_PREFIX",
      settingValue: "RCPT",
      description: "Prefix for payment and waiver receipts",
    },
    {
      settingKey: "NEW_ARRIVAL_DAYS",
      settingValue: "30",
      description: "Window in days for OPAC new arrivals",
    },
    {
      settingKey: "OPAC_ALLOW_HOLDS",
      settingValue: "true",
      description: "Allow patrons to place holds through OPAC",
    },
    {
      settingKey: "LABEL_TITLE",
      settingValue: "RBMI Library",
      description: "Header text for spine and barcode labels",
    },
  ]);

  // 13. Circulation Rules (20 rules per DR-08)
  await db.insert(schema.circulationRules).values([
    // Rule #1: B.Tech Student + Textbook (Section 5.1 example)
    {
      categoryId: catBtech.id,
      itemTypeId: itemBook.id,
      maxBooks: 4,
      loanDays: 14,
      maxRenewals: 2,
      finePerDay: "2.00",
      graceDays: 0,
      maxFine: "200.00",
      holdsAllowed: true,
    },
    // Rule #2: Reference items default (Reference Book -> not issued to general)
    {
      itemTypeId: itemRef.id,
      maxBooks: 0,
      loanDays: 0,
      maxRenewals: 0,
      finePerDay: "5.00",
      graceDays: 0,
      maxFine: "500.00",
      holdsAllowed: false,
    },
    // Rule #3: Faculty + Reference Book (Score 3 winner in Section 5.1)
    {
      categoryId: catFaculty.id,
      itemTypeId: itemRef.id,
      maxBooks: 2,
      loanDays: 3,
      maxRenewals: 1,
      finePerDay: "5.00",
      graceDays: 0,
      maxFine: "300.00",
      holdsAllowed: true,
    },
    // Rule #4: Faculty + Textbook
    {
      categoryId: catFaculty.id,
      itemTypeId: itemBook.id,
      maxBooks: 6,
      loanDays: 30,
      maxRenewals: 3,
      finePerDay: "1.00",
      graceDays: 2,
      maxFine: "300.00",
      holdsAllowed: true,
    },
    // Rule #5: Guest Category (Section 5.1)
    {
      categoryId: catGuest.id,
      maxBooks: 1,
      loanDays: 7,
      maxRenewals: 0,
      finePerDay: "5.00",
      graceDays: 0,
      maxFine: "100.00",
      holdsAllowed: false,
    },
    // Additional rules (6 to 20)
    {
      categoryId: catBtech.id,
      itemTypeId: itemJournal.id,
      maxBooks: 0,
      loanDays: 0,
      maxRenewals: 0,
      finePerDay: "10.00",
      graceDays: 0,
      holdsAllowed: false,
    },
    {
      categoryId: catFaculty.id,
      itemTypeId: itemJournal.id,
      maxBooks: 3,
      loanDays: 7,
      maxRenewals: 1,
      finePerDay: "5.00",
      graceDays: 1,
      holdsAllowed: true,
    },
    {
      libraryId: libCl.id,
      categoryId: catBtech.id,
      maxBooks: 4,
      loanDays: 14,
      maxRenewals: 2,
      finePerDay: "2.00",
      graceDays: 0,
      maxFine: "200.00",
      holdsAllowed: true,
    },
    {
      libraryId: libMl.id,
      maxBooks: 3,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    {
      libraryId: libPl.id,
      maxBooks: 3,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    {
      libraryId: libNl.id,
      maxBooks: 3,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    {
      libraryId: libTl.id,
      maxBooks: 3,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    {
      categoryId: catFaculty.id,
      maxBooks: 6,
      loanDays: 30,
      maxRenewals: 3,
      finePerDay: "1.00",
      graceDays: 2,
      holdsAllowed: true,
    },
    {
      categoryId: catBtech.id,
      maxBooks: 4,
      loanDays: 14,
      maxRenewals: 2,
      finePerDay: "2.00",
      graceDays: 0,
      maxFine: "200.00",
      holdsAllowed: true,
    },
    {
      itemTypeId: itemBook.id,
      maxBooks: 3,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    // Rule #16: Reference rule explicit check (T-06 refusal test)
    {
      itemTypeId: itemRef.id,
      maxBooks: 0,
      loanDays: 0,
      maxRenewals: 0,
      finePerDay: "5.00",
      graceDays: 0,
      holdsAllowed: false,
    },
    {
      itemTypeId: itemJournal.id,
      maxBooks: 1,
      loanDays: 3,
      maxRenewals: 0,
      finePerDay: "10.00",
      graceDays: 0,
      holdsAllowed: false,
    },
    {
      categoryId: catGuest.id,
      itemTypeId: itemBook.id,
      maxBooks: 1,
      loanDays: 7,
      maxRenewals: 0,
      finePerDay: "5.00",
      graceDays: 0,
      holdsAllowed: false,
    },
    {
      libraryId: libCl.id,
      itemTypeId: itemBook.id,
      maxBooks: 4,
      loanDays: 14,
      maxRenewals: 2,
      finePerDay: "2.00",
      graceDays: 0,
      holdsAllowed: true,
    },
    {
      libraryId: libCl.id,
      categoryId: catFaculty.id,
      maxBooks: 6,
      loanDays: 30,
      maxRenewals: 3,
      finePerDay: "1.00",
      graceDays: 2,
      holdsAllowed: true,
    },
  ]);

  // 14. Training Patrons (Section 10.4)
  const [patronRahul, patronPriya, patronNeha, patronSuresh] = await db
    .insert(schema.patrons)
    .values([
      {
        cardNo: "2301430100045",
        rollNo: "2301430100045",
        patronType: "STUDENT",
        categoryId: catBtech.id,
        institutionId: instEng.id,
        departmentId: deptCse.id,
        courseId: courseBtech.id,
        firstName: "Rahul",
        lastName: "Kumar",
        mobile: "9876543201",
        cardExpiry: "2027-06-30",
        status: "ACTIVE",
        username: "2301430100045",
        passwordHash: hashPassword("2301430100045"),
        mustChangePassword: true,
      },
      {
        cardNo: "2301430100062",
        rollNo: "2301430100062",
        patronType: "STUDENT",
        categoryId: catBtech.id,
        institutionId: instEng.id,
        departmentId: deptCse.id,
        courseId: courseBtech.id,
        firstName: "Priya",
        lastName: "Sharma",
        mobile: "9876543202",
        cardExpiry: "2027-06-30",
        status: "ACTIVE",
        username: "2301430100062",
        passwordHash: hashPassword("2301430100062"),
        mustChangePassword: true,
      },
      {
        cardNo: "2201430100033",
        rollNo: "2201430100033",
        patronType: "STUDENT",
        categoryId: catBtech.id,
        institutionId: instEng.id,
        departmentId: deptCse.id,
        courseId: courseBtech.id,
        firstName: "Neha",
        lastName: "Gupta",
        mobile: "9876543203",
        cardExpiry: "2026-06-30",
        status: "ACTIVE",
        username: "2201430100033",
        passwordHash: hashPassword("2201430100033"),
        mustChangePassword: true,
      },
      {
        cardNo: "E1001",
        employeeId: "E1001",
        patronType: "FACULTY",
        categoryId: catFaculty.id,
        institutionId: instEng.id,
        departmentId: deptMe.id,
        firstName: "Suresh",
        lastName: "Chandra",
        mobile: "9876543204",
        cardExpiry: "2031-06-30",
        status: "ACTIVE",
        username: "E1001",
        passwordHash: hashPassword("E1001"),
        mustChangePassword: true,
      },
    ])
    .returning();

  // 15. Training Titles & Items (Section 10.4)
  const [bibFluid, bibAlgo, bibDb, bibDesign] = await db
    .insert(schema.bibRecords)
    .values([
      {
        isbn: "9780073380322",
        title: "Fluid Mechanics",
        authors: "Frank M. White",
        publisher: "McGraw-Hill",
        pubYear: 2017,
        itemTypeId: itemBook.id,
        departmentId: deptMe.id,
        price: "650.00",
      },
      {
        isbn: "9780262033848",
        title: "Introduction to Algorithms",
        authors: "Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein",
        publisher: "MIT Press",
        pubYear: 2009,
        itemTypeId: itemBook.id,
        departmentId: deptCse.id,
        price: "1200.00",
      },
      {
        isbn: "9780078022159",
        title: "Database System Concepts",
        authors: "Abraham Silberschatz, Henry F. Korth, S. Sudarshan",
        publisher: "McGraw-Hill",
        pubYear: 2019,
        itemTypeId: itemBook.id,
        departmentId: deptCse.id,
        price: "750.00",
      },
      {
        isbn: "9788123904000",
        title: "Design Data Handbook",
        authors: "K. Lingaiah",
        publisher: "CBS Publishers",
        pubYear: 2010,
        itemTypeId: itemRef.id,
        departmentId: deptMe.id,
        price: "850.00",
      },
    ])
    .returning();

  const [copyCl1, copyCl7, copyCl8, _copyCl9, _copyCl21] = await db
    .insert(schema.items)
    .values([
      {
        bibId: bibFluid.id,
        libraryId: libCl.id,
        accessionNo: "CL000001",
        barcode: "CL000001",
        location: "ME-01-A",
        price: "650.00",
        status: "ISSUED", // Overdue loan
      },
      {
        bibId: bibAlgo.id,
        libraryId: libCl.id,
        accessionNo: "CL000007",
        barcode: "CL000007",
        location: "CS-03-B",
        price: "1200.00",
        status: "ISSUED", // Both issued, hold waiting
      },
      {
        bibId: bibAlgo.id,
        libraryId: libCl.id,
        accessionNo: "CL000008",
        barcode: "CL000008",
        location: "CS-03-B",
        price: "1200.00",
        status: "ISSUED",
      },
      {
        bibId: bibDb.id,
        libraryId: libCl.id,
        accessionNo: "CL000009",
        barcode: "CL000009",
        location: "CS-02-C",
        price: "750.00",
        status: "AVAILABLE", // Ready for checkout
      },
      {
        bibId: bibDesign.id,
        libraryId: libCl.id,
        accessionNo: "CL000021",
        barcode: "CL000021",
        location: "REF-01",
        price: "850.00",
        status: "REFERENCE_ONLY", // Reference copy
      },
    ])
    .returning();

  // 16. Training Transactions (Loans & Holds for tests T-05 to T-15)
  // Overdue loan: CL000001 to Rahul Kumar (due 12 days ago, for T-09)
  const twelveDaysAgo = new Date(Date.now() - 12 * 86400000).toISOString().split("T")[0];
  const twentySixDaysAgo = new Date(Date.now() - 26 * 86400000).toISOString().split("T")[0];

  await db.insert(schema.loans).values([
    {
      itemId: copyCl1.id,
      patronId: patronRahul.id,
      libraryId: libCl.id,
      issueDate: twentySixDaysAgo,
      dueDate: twelveDaysAgo,
      status: "ISSUED",
      issuedBy: userLibrarian.id,
    },
    {
      itemId: copyCl7.id,
      patronId: patronPriya.id,
      libraryId: libCl.id,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      status: "ISSUED",
      issuedBy: userLibrarian.id,
    },
    {
      itemId: copyCl8.id,
      patronId: patronSuresh.id,
      libraryId: libCl.id,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      status: "ISSUED",
      issuedBy: userLibrarian.id,
    },
  ]);

  // Waiting Hold: Neha Gupta on Algorithms (for T-10)
  await db.insert(schema.holds).values([
    {
      patronId: patronNeha.id,
      bibId: bibAlgo.id,
      status: "WAITING",
    },
  ]);

  console.log("✅ Seed database finished successfully!");
}

async function main() {
  const { client, db } = await import("./client");
  try {
    await seedDatabase(db);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.includes("seed")) {
  main();
}
