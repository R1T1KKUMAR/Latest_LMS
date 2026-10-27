"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CirculationSearchDropdown } from "@/components/circulation/CirculationSearchDropdown";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type {
  CirculationBookSearchResult,
  CirculationPatronSearchResult,
} from "@/services/circulation";

export interface CirculationItem {
  id: number;
  issueDate: Date | string;
  dueDate: Date | string;
  status: string;
  patronName: string;
  patronCard: string;
  title: string;
  accessionNo: string;
}

export interface PatronProfile {
  id: number;
  cardNo: string;
  employeeId: string | null;
  username: string;
  firstName: string;
  lastName: string | null;
  patronType: string;
  categoryId: number;
  categoryName: string;
  departmentId?: number | null;
  departmentName: string | null;
  courseId?: number | null;
  courseCode?: string | null;
  courseName: string | null;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  academicYear?: number | null;
  semester?: number | null;
  cardExpiry: string | Date;
  status: string;
  mobile: string | null;
  email: string | null;
  activeLoansCount: number;
  overdueLoansCount: number;
  totalOutstandingFines: number;
  activeLoans: Array<{
    id: number;
    itemId: number;
    accessionNo: string;
    barcode: string;
    title: string;
    issueDate: string;
    dueDate: string;
    daysOverdue: number;
    isOverdue: boolean;
    renewalCount: number;
  }>;
  activeHolds: Array<{
    id: number;
    title: string;
    queuePosition: number;
    status: string;
    expiryDate: string | null;
  }>;
}

export interface InstitutionOption {
  id: number;
  name: string;
  code: string;
}

export interface DepartmentOption {
  id: number;
  name: string;
  code: string;
  institutionId: number;
}

export interface CourseOption {
  id: number;
  name: string;
  code: string;
  institutionId: number;
}

export interface PatronCategoryOption {
  id: number;
  name: string;
  code: string;
  patronType: string;
}

interface CirculationDeskClientProps {
  initialCheckouts: CirculationItem[];
  csrfToken: string;
  canIssue: boolean;
  canReturn: boolean;
  canRenew: boolean;
  canMarkLost?: boolean;
  defaultTab?: "issue" | "return" | "renew" | "lost";
  standalone?: boolean;
  institutions?: InstitutionOption[];
  departments?: DepartmentOption[];
  courses?: CourseOption[];
  patronCategories?: PatronCategoryOption[];
}

export function CirculationDeskClient({
  initialCheckouts,
  csrfToken,
  canIssue,
  canReturn,
  canRenew,
  canMarkLost = true,
  defaultTab = "issue",
  standalone = false,
  institutions = [],
  departments = [],
  courses = [],
  patronCategories = [],
}: CirculationDeskClientProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "return" | "renew" | "lost">(defaultTab);
  const [cardNo, setCardNo] = useState("");
  const [accessionNo, setAccessionNo] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [loans, setLoans] = useState<CirculationItem[]>(initialCheckouts);
  const [patronData, setPatronData] = useState<PatronProfile | null>(null);

  // Master data lists (pre-populated from props or loaded dynamically)
  const [institutionsList, setInstitutionsList] = useState<InstitutionOption[]>(institutions);
  const [departmentsList, setDepartmentsList] = useState<DepartmentOption[]>(departments);
  const [coursesList, setCoursesList] = useState<CourseOption[]>(courses);
  const [_categoriesList, setCategoriesList] = useState<PatronCategoryOption[]>(patronCategories);

  // Cascading Filter States for Issue tab
  const [issuePatronType, setIssuePatronType] = useState<string>("ALL");
  const [issueInstitutionId, setIssueInstitutionId] = useState<number | null>(null);
  const [issueCourseId, setIssueCourseId] = useState<number | null>(null);
  const [issueDepartmentId, setIssueDepartmentId] = useState<number | null>(null);

  // Cascading Filter States for Return tab
  const [returnPatronType, setReturnPatronType] = useState<string>("ALL");
  const [returnInstitutionId, setReturnInstitutionId] = useState<number | null>(null);
  const [returnCourseId, setReturnCourseId] = useState<number | null>(null);
  const [returnDepartmentId, setReturnDepartmentId] = useState<number | null>(null);

  const [selectedIssuePatron, setSelectedIssuePatron] =
    useState<CirculationPatronSearchResult | null>(null);
  const [selectedIssueBook, setSelectedIssueBook] = useState<CirculationBookSearchResult | null>(
    null,
  );
  const [selectedReturnPatron, setSelectedReturnPatron] =
    useState<CirculationPatronSearchResult | null>(null);
  const [selectedReturnBook, setSelectedReturnBook] = useState<CirculationBookSearchResult | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [deskAlert, setDeskAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    title: string;
    message: string;
  } | null>(null);

  // Dynamic fallback load for master data if not provided via SSR props
  useEffect(() => {
    if (institutionsList.length === 0) {
      fetch("/api/circulation/master-data")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            if (data.institutions) setInstitutionsList(data.institutions);
            if (data.departments) setDepartmentsList(data.departments);
            if (data.courses) setCoursesList(data.courses);
            if (data.patronCategories) setCategoriesList(data.patronCategories);
          }
        })
        .catch(() => {});
    }
  }, [institutionsList.length]);

  // Lost confirmation dialog state
  const [lostDialog, setLostDialog] = useState<{
    isOpen: boolean;
    loanId?: number;
    barcodeOrAccession?: string;
    title?: string;
    patronName?: string;
  }>({ isOpen: false });

  // Refs for scanner autofocus
  const patronInputRef = useRef<HTMLInputElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);

  // Focus management based on active tab
  useEffect(() => {
    if (activeTab === "issue") {
      if (!patronData) {
        patronInputRef.current?.focus();
      } else {
        copyInputRef.current?.focus();
      }
    } else {
      copyInputRef.current?.focus();
    }
  }, [activeTab, patronData]);

  // Filtered dropdown options based on selected college
  const filteredCoursesForIssue = issueInstitutionId
    ? coursesList.filter((c) => c.institutionId === issueInstitutionId)
    : coursesList;

  const filteredDepartmentsForIssue = issueInstitutionId
    ? departmentsList.filter((d) => d.institutionId === issueInstitutionId)
    : departmentsList;

  const filteredCoursesForReturn = returnInstitutionId
    ? coursesList.filter((c) => c.institutionId === returnInstitutionId)
    : coursesList;

  const filteredDepartmentsForReturn = returnInstitutionId
    ? departmentsList.filter((d) => d.institutionId === returnInstitutionId)
    : departmentsList;

  const selectedDepartmentNameForReturn = departmentsList.find(
    (d) => d.id === returnDepartmentId,
  )?.name;

  // Lookup patron details
  const handleLookupPatron = async (queryTerm = cardNo) => {
    const term = queryTerm.trim();
    if (!term) return;

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch(`/api/circulation/patron-lookup?term=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPatronData(null);
        setDeskAlert({
          variant: "error",
          title: "Patron Lookup Failed",
          message: data.error || `Patron "${term}" not found`,
        });
        patronInputRef.current?.focus();
      } else {
        const p: PatronProfile = data.patron;
        setPatronData(p);
        setCardNo(p.cardNo);

        const patronResult: CirculationPatronSearchResult = {
          id: p.id,
          cardNo: p.cardNo,
          employeeId: p.employeeId,
          fullName: [p.firstName, p.lastName].filter(Boolean).join(" "),
          patronType: p.patronType,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          departmentId: p.departmentId ?? null,
          departmentName: p.departmentName ?? null,
          courseId: p.courseId ?? null,
          courseName: p.courseName ?? null,
          institutionId: p.institutionId ?? null,
          institutionCode: p.institutionCode ?? null,
          status: p.status,
          activeLoansCount: p.activeLoansCount,
          overdueLoansCount: p.overdueLoansCount,
          totalOutstandingFines: p.totalOutstandingFines,
        };

        if (activeTab === "issue") {
          setSelectedIssuePatron(patronResult);
          if (p.patronType && issuePatronType === "ALL") setIssuePatronType(p.patronType);
          if (p.institutionId && !issueInstitutionId) setIssueInstitutionId(p.institutionId);
          if (p.courseId && !issueCourseId) setIssueCourseId(p.courseId);
          if (p.departmentId && !issueDepartmentId) setIssueDepartmentId(p.departmentId);
        } else if (activeTab === "return") {
          setSelectedReturnPatron(patronResult);
          if (p.patronType && returnPatronType === "ALL") setReturnPatronType(p.patronType);
          if (p.institutionId && !returnInstitutionId) setReturnInstitutionId(p.institutionId);
          if (p.courseId && !returnCourseId) setReturnCourseId(p.courseId);
          if (p.departmentId && !returnDepartmentId) setReturnDepartmentId(p.departmentId);
        }

        // Automatically focus the item barcode field for immediate book scan
        setTimeout(() => copyInputRef.current?.focus(), 50);
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Network Error",
        message: "Failed to connect to patron lookup service",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Issue copy submission
  const handleIssueSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cardNo.trim() || !accessionNo.trim()) {
      setDeskAlert({
        variant: "warning",
        title: "Incomplete Selection",
        message: "Please select both a Patron and an Available Book from the dropdowns above.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          patronIdentifier: cardNo.trim(),
          barcodeOrAccession: accessionNo.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Issue Refusal",
          message: data.error || "Item checkout was refused by the library rules engine.",
        });
        copyInputRef.current?.select();
      } else {
        setDeskAlert({
          variant: "success",
          title: "Item Checked Out Successfully",
          message: `"${data.title}" successfully issued to ${data.patron.name} (${data.patron.cardNo}). Due date: ${data.dueDate}.${
            data.reservationFulfilled ? " (Waiting reservation fulfilled)" : ""
          }`,
        });

        // Add to active loans table
        const newCheckout: CirculationItem = {
          id: data.loan.id,
          issueDate: data.loan.issueDate,
          dueDate: data.loan.dueDate,
          status: "ISSUED",
          patronName: data.patron.name,
          patronCard: data.patron.cardNo,
          title: data.title,
          accessionNo: data.copy.accessionNo,
        };
        setLoans((prev) => [newCheckout, ...prev]);

        // Refresh patron profile to update quotas & active loans
        handleLookupPatron(cardNo);

        // Reset copy input for next scan and refocus
        setAccessionNo("");
        setSelectedIssueBook(null);
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation desk service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Return copy submission
  const handleReturnSubmit = async (e?: React.FormEvent, customBarcode?: string) => {
    if (e) e.preventDefault();
    const barcode = (customBarcode ?? accessionNo).trim();
    if (!barcode) {
      setDeskAlert({
        variant: "warning",
        title: "No Book Selected",
        message:
          "Please select an issued book from the dropdown or click Return on an active issued book.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          barcodeOrAccession: barcode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Return Error",
          message: data.error || "Failed to process return.",
        });
        copyInputRef.current?.select();
      } else {
        let message = `"${data.title}" returned. Status: ${data.copy.status}.`;
        if (data.fineAmount > 0) {
          message += ` Overdue fine of ₹${data.fineAmount.toFixed(2)} assessed (${data.daysLate} day(s) late).`;
        }
        if (data.holdAlert) {
          message += ` 🔔 ALERT: Item is reserved for ${data.holdAlert.patronName} (${data.holdAlert.patronCard}). Pickup deadline: ${data.holdAlert.pickupExpiryDate}.`;
        }

        setDeskAlert({
          variant: data.holdAlert ? "info" : "success",
          title: data.holdAlert
            ? "Item Returned — Reserved for Hold!"
            : "Item Returned Successfully",
          message,
        });

        // Remove or update from active loans table
        setLoans((prev) => prev.filter((l) => l.accessionNo !== data.copy.accessionNo));

        // Refresh patron data if patron was previously active
        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        // Clear input and refocus for rapid continuous scanning
        setAccessionNo("");
        setSelectedReturnBook(null);
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation return service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Renew loan submission
  const handleRenewSubmit = async (
    e?: React.FormEvent,
    loanId?: number,
    customBarcode?: string,
  ) => {
    if (e) e.preventDefault();
    const barcode = (customBarcode ?? accessionNo).trim();
    if (!loanId && !barcode) {
      setDeskAlert({
        variant: "warning",
        title: "Missing Book Identifier",
        message: "Please enter the Accession Number/Barcode or select an issued book to renew.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          loanId,
          barcodeOrAccession: loanId ? undefined : barcode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Renewal Refused",
          message: data.error || "Renewal refused by circulation policy.",
        });
        copyInputRef.current?.select();
      } else {
        setDeskAlert({
          variant: "success",
          title: "Book Renewed Successfully",
          message: `Book issue extended. New due date: ${data.newDueDate} (Renewal ${data.renewalCount} of ${data.maxRenewals}).`,
        });

        // Update in active loans list
        if (data.loan?.id) {
          setLoans((prev) =>
            prev.map((l) =>
              l.id === data.loan.id ? { ...l, dueDate: data.newDueDate, status: "ISSUED" } : l,
            ),
          );
        }

        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        setAccessionNo("");
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation renewal service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Mark copy lost execution
  const handleConfirmMarkLost = async () => {
    const { loanId, barcodeOrAccession } = lostDialog;
    if (!loanId && !barcodeOrAccession) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          loanId,
          barcodeOrAccession: loanId ? undefined : barcodeOrAccession,
          remarks: "Declared lost at circulation terminal",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Declaration Failed",
          message: data.error || "Could not mark copy as lost.",
        });
      } else {
        setDeskAlert({
          variant: "warning",
          title: "Item Declared Lost",
          message: `"${data.title}" marked as LOST. Replacement fee: ₹${data.replacementFee.toFixed(2)}${
            data.overdueFine > 0 ? `, Overdue fine: ₹${data.overdueFine.toFixed(2)}` : ""
          }. Total charge assessed: ₹${data.totalCharged.toFixed(2)}.`,
        });

        // Remove from active loans
        if (loanId) {
          setLoans((prev) => prev.filter((l) => l.id !== loanId));
        }

        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        setAccessionNo("");
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with lost item service.",
      });
    } finally {
      setIsLoading(false);
      setLostDialog({ isOpen: false });
    }
  };

  const filteredCheckouts = loans.filter(
    (c) =>
      c.patronName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.patronCard.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.accessionNo.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {deskAlert && (
        <Alert
          variant={deskAlert.variant}
          title={deskAlert.title}
          onDismiss={() => setDeskAlert(null)}
        >
          {deskAlert.message}
        </Alert>
      )}

      {/* Transaction Terminal Tabs (only if not standalone mode) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {!standalone && (
          <div className="border-b border-slate-200 bg-slate-50 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
            <div className="flex overflow-x-auto no-scrollbar gap-1.5 sm:gap-2">
              {canIssue && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("issue");
                    setDeskAlert(null);
                  }}
                  className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    activeTab === "issue"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📥 Check Out (Issue)
                </button>
              )}

              {canReturn && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("return");
                    setDeskAlert(null);
                  }}
                  className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    activeTab === "return"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📤 Check In (Return)
                </button>
              )}

              {canRenew && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("renew");
                    setDeskAlert(null);
                  }}
                  className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    activeTab === "renew"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🔄 Renew Book
                </button>
              )}

              {canMarkLost && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("lost");
                    setDeskAlert(null);
                  }}
                  className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    activeTab === "lost"
                      ? "bg-red-700 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ⚠️ Declare Lost
                </button>
              )}
            </div>

            <div className="hidden lg:flex text-xs text-slate-500 space-x-3">
              <Link href="/circulation/issue" className="hover:text-blue-900 font-medium">
                Issue View &rarr;
              </Link>
              <Link href="/circulation/return" className="hover:text-blue-900 font-medium">
                Return View &rarr;
              </Link>
              <Link href="/circulation/renew" className="hover:text-blue-900 font-medium">
                Renew View &rarr;
              </Link>
              <Link href="/circulation/lost" className="hover:text-blue-900 font-medium">
                Lost View &rarr;
              </Link>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6">
          {/* Issue Tab Form */}
          {activeTab === "issue" && canIssue && (
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!patronData) {
                    handleLookupPatron();
                  } else {
                    handleIssueSubmit();
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Issue Book to Patron</h3>
                  <p className="text-xs text-slate-500">
                    Select patron and book from dynamic dropdowns, or scan barcodes directly. Press
                    Enter in either field to proceed.
                  </p>
                </div>

                {/* Dynamic Category-Wise Cascading Selection Card */}
                <div className="rounded-xl border border-blue-200 bg-linear-to-b from-blue-50/70 to-white p-4.5 max-w-3xl space-y-4 shadow-xs">
                  {/* Header */}
                  <div className="border-b border-blue-100 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                          <span>⚡ Category-Wise Dynamic Selection</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Step-by-step filter: Patron Category &rarr; College &rarr; Course &rarr;
                          Branch &rarr; Patron &rarr; Available Book.
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200">
                        Live Cascading
                      </span>
                    </div>
                  </div>

                  {/* Patron & Books Dropdowns Row (5 & 6) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Patron Dropdown */}
                    <div>
                      <CirculationSearchDropdown
                        type="patron"
                        patronType={issuePatronType}
                        institutionId={issueInstitutionId}
                        courseId={issueCourseId}
                        departmentId={issueDepartmentId}
                        label="5. Select Patron (Filtered by Category/College/Course/Branch)"
                        placeholder="Click to pick patron from filtered list..."
                        helperText={
                          selectedIssuePatron
                            ? `Selected: ${selectedIssuePatron.fullName} (${selectedIssuePatron.cardNo})`
                            : "Dropdown lists patrons matching above category filters"
                        }
                        selectedPatron={selectedIssuePatron}
                        onSelect={(patron) => {
                          setSelectedIssuePatron(patron);
                          setCardNo(patron.cardNo);
                          handleLookupPatron(patron.cardNo);
                          if (!issueDepartmentId && patron.departmentId)
                            setIssueDepartmentId(patron.departmentId);
                          if (!issueInstitutionId && patron.institutionId)
                            setIssueInstitutionId(patron.institutionId);
                          if (!issueCourseId && patron.courseId) setIssueCourseId(patron.courseId);
                          if (issuePatronType === "ALL") setIssuePatronType(patron.patronType);
                        }}
                        onClear={() => {
                          setSelectedIssuePatron(null);
                          setCardNo("");
                          setPatronData(null);
                        }}
                      />
                    </div>

                    {/* Books Dropdown */}
                    <div>
                      <CirculationSearchDropdown
                        type="book"
                        status="AVAILABLE"
                        label="6. Select Book to Issue"
                        placeholder="Search/pick books by Title, Accession No, Barcode, Author, ISBN..."
                        helperText={
                          selectedIssueBook
                            ? `Selected: ${selectedIssueBook.title} (${selectedIssueBook.accessionNo})`
                            : "Dropdown lists available books in library"
                        }
                        selectedBook={selectedIssueBook}
                        onSelect={(book) => {
                          setSelectedIssueBook(book);
                          setAccessionNo(book.accessionNo);
                        }}
                        onClear={() => {
                          setSelectedIssueBook(null);
                          setAccessionNo("");
                        }}
                      />
                    </div>
                  </div>

                  {/* Cascading Filter Dropdowns Row (1, 2, 3, 4) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-blue-100">
                    {/* 1. Patron Category / Type */}
                    <div>
                      <label
                        htmlFor="issue-patron-type-select"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        1. Patron Category
                      </label>
                      <select
                        id="issue-patron-type-select"
                        value={issuePatronType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIssuePatronType(val);
                          if (val !== "STUDENT" && val !== "ALL") {
                            setIssueCourseId(null);
                          }
                          setSelectedIssuePatron(null);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-blue-900 focus:outline-hidden cursor-pointer"
                      >
                        <option value="ALL">All Categories</option>
                        <option value="STUDENT">Student</option>
                        <option value="FACULTY">Faculty</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    </div>

                    {/* 2. College / Institution */}
                    <div>
                      <label
                        htmlFor="issue-institution-select"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        2. College / Campus
                      </label>
                      <select
                        id="issue-institution-select"
                        value={issueInstitutionId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          setIssueInstitutionId(val);
                          setIssueCourseId(null);
                          setIssueDepartmentId(null);
                          setSelectedIssuePatron(null);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-blue-900 focus:outline-hidden cursor-pointer"
                      >
                        <option value="">All Colleges / Campuses</option>
                        {institutionsList.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name} ({inst.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Course (for students) */}
                    <div>
                      <label
                        htmlFor="issue-course-select"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        3. Course {issuePatronType === "STUDENT" ? "(Students)" : ""}
                      </label>
                      <select
                        id="issue-course-select"
                        value={issueCourseId ?? ""}
                        disabled={issuePatronType === "FACULTY" || issuePatronType === "STAFF"}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          setIssueCourseId(val);
                          setSelectedIssuePatron(null);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-blue-900 focus:outline-hidden cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          {issuePatronType === "FACULTY" || issuePatronType === "STAFF"
                            ? "N/A (Staff/Faculty)"
                            : "All Courses"}
                        </option>
                        {filteredCoursesForIssue.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name} ({course.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Branch / Department */}
                    <div>
                      <label
                        htmlFor="issue-branch-select"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        4. Branch / Department
                      </label>
                      <select
                        id="issue-branch-select"
                        value={issueDepartmentId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          setIssueDepartmentId(val);
                          setSelectedIssuePatron(null);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-blue-900 focus:outline-hidden cursor-pointer"
                      >
                        <option value="">All Branches / Depts</option>
                        {filteredDepartmentsForIssue.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name} ({dept.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Checkout Action & Summary Bar */}
                  <div className="pt-3 border-t border-blue-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="text-xs">
                      {selectedIssuePatron && selectedIssueBook ? (
                        <div className="text-blue-950 font-medium flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-500">Selected:</span>
                          <span className="font-semibold text-slate-900">
                            {selectedIssueBook.title}
                          </span>
                          <span className="font-mono text-[11px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">
                            {selectedIssueBook.accessionNo}
                          </span>
                          <span className="text-slate-400">&rarr;</span>
                          <span className="font-semibold text-slate-900">
                            {selectedIssuePatron.fullName}
                          </span>
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {selectedIssuePatron.cardNo}
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-500 text-[11px]">
                          Select both a patron and an available book from the dropdowns above to
                          check out.
                        </div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading || !cardNo.trim() || !accessionNo.trim()}
                    >
                      {isLoading ? "Processing Issue..." : "Check Out Item"}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Patron Verification Profile Card */}
              {patronData && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 max-w-3xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {patronData.firstName} {patronData.lastName || ""}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Card: <span className="font-mono font-semibold">{patronData.cardNo}</span>
                        {patronData.employeeId ? ` | Emp ID: ${patronData.employeeId}` : ""} |{" "}
                        {patronData.categoryName} ({patronData.patronType})
                      </p>
                      {(patronData.institutionName || patronData.courseName) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          {patronData.institutionCode && (
                            <span className="font-semibold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">
                              🏛️ {patronData.institutionCode}
                            </span>
                          )}
                          {patronData.courseName && (
                            <span className="font-medium text-slate-800 bg-slate-200/70 px-2 py-0.5 rounded">
                              {patronData.courseName}
                            </span>
                          )}
                          {patronData.departmentName && (
                            <span className="text-slate-500">
                              &bull; {patronData.departmentName}
                            </span>
                          )}
                          {patronData.academicYear && (
                            <span className="text-slate-500 font-mono text-[11px]">
                              (Yr {patronData.academicYear}
                              {patronData.semester ? `, Sem ${patronData.semester}` : ""})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          patronData.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {patronData.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Issued Books</span>
                      <span className="text-sm font-bold text-slate-900">
                        {patronData.activeLoansCount} book(s)
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Overdue Books</span>
                      <span
                        className={`text-sm font-bold ${
                          patronData.overdueLoansCount > 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {patronData.overdueLoansCount} overdue
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Outstanding Fines</span>
                      <span
                        className={`text-sm font-bold ${
                          patronData.totalOutstandingFines > 0 ? "text-amber-700" : "text-slate-900"
                        }`}
                      >
                        ₹{patronData.totalOutstandingFines.toFixed(2)}
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Active Holds</span>
                      <span className="text-sm font-bold text-slate-900">
                        {patronData.activeHolds.length} hold(s)
                      </span>
                    </div>
                  </div>

                  {patronData.overdueLoansCount > 0 && (
                    <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-800 border border-red-200 flex items-center space-x-2">
                      <span className="font-bold">⚠️ Warning:</span>
                      <span>
                        Patron has overdue materials. Rules engine will block checkout if
                        BLOCK_ISSUE_IF_OVERDUE is enabled.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Return Tab Form */}
          {activeTab === "return" && canReturn && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReturnSubmit();
              }}
              className="space-y-4 max-w-2xl"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">Return Accessioned Copy</h3>
                <p className="text-xs text-slate-500">
                  Select borrower and book from dynamic dropdowns, or scan item barcode directly.
                  Overdue fines and hold queue reservation alerts apply automatically.
                </p>
              </div>

              {/* Dynamic Category-Wise Cascading Selection Card for Return */}
              <div className="rounded-xl border border-emerald-200 bg-linear-to-b from-emerald-50/70 to-white p-4.5 max-w-3xl space-y-4 shadow-xs">
                {/* Header */}
                <div className="border-b border-emerald-100 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                        <span>⚡ Category-Wise Dynamic Return Selection</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Filter by Borrower Category &rarr; College &rarr; Course &rarr; Branch
                        &rarr; Patron &rarr; Issued Book.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Cascading
                    </span>
                  </div>
                </div>

                {/* Borrower & Books Dropdowns Row (5 & 6) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Borrower Patron Dropdown */}
                  <div>
                    <CirculationSearchDropdown
                      type="patron"
                      hasActiveLoans={true}
                      patronType={returnPatronType}
                      institutionId={returnInstitutionId}
                      courseId={returnCourseId}
                      departmentId={returnDepartmentId}
                      label="5. Select Borrower (Filtered by Category/College/Branch)"
                      placeholder="Search/select borrower with issued books..."
                      helperText={
                        selectedReturnPatron
                          ? `Borrower: ${selectedReturnPatron.fullName} (${selectedReturnPatron.cardNo})`
                          : "Shows patrons with issued books matching filters"
                      }
                      selectedPatron={selectedReturnPatron}
                      onSelect={(patron) => {
                        setSelectedReturnPatron(patron);
                        setSelectedReturnBook(null);
                        setAccessionNo("");
                        setCardNo(patron.cardNo);
                        handleLookupPatron(patron.cardNo);
                        if (!returnDepartmentId && patron.departmentId)
                          setReturnDepartmentId(patron.departmentId);
                        if (!returnInstitutionId && patron.institutionId)
                          setReturnInstitutionId(patron.institutionId);
                        if (!returnCourseId && patron.courseId) setReturnCourseId(patron.courseId);
                        if (returnPatronType === "ALL") setReturnPatronType(patron.patronType);
                      }}
                      onClear={() => {
                        setSelectedReturnPatron(null);
                        setSelectedReturnBook(null);
                        setAccessionNo("");
                      }}
                    />
                  </div>

                  {/* Books Dropdown Filtered by Borrower */}
                  <div>
                    <CirculationSearchDropdown
                      type="book"
                      status="ISSUED"
                      patronId={selectedReturnPatron?.id}
                      departmentId={selectedReturnPatron ? undefined : returnDepartmentId}
                      institutionId={selectedReturnPatron ? undefined : returnInstitutionId}
                      label={
                        selectedReturnPatron
                          ? `6. Books Issued to ${selectedReturnPatron.fullName}`
                          : selectedDepartmentNameForReturn
                            ? `6. Issued Books in ${selectedDepartmentNameForReturn}`
                            : "6. Select Issued Book to Return"
                      }
                      placeholder={
                        selectedReturnPatron
                          ? `Select among ${selectedReturnPatron.fullName}'s issued books...`
                          : "Search/select any issued book..."
                      }
                      helperText={
                        selectedReturnPatron
                          ? `Filtered to ${selectedReturnPatron.fullName}'s borrowings`
                          : "Search by title, author, or branch"
                      }
                      selectedBook={selectedReturnBook}
                      onSelect={(book) => {
                        setSelectedReturnBook(book);
                        setAccessionNo(book.accessionNo);
                      }}
                      onClear={() => {
                        setSelectedReturnBook(null);
                        setAccessionNo("");
                      }}
                    />
                  </div>
                </div>

                {/* Cascading Filter Dropdowns Row (1, 2, 3, 4) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-emerald-100">
                  {/* 1. Patron Category / Type */}
                  <div>
                    <label
                      htmlFor="return-patron-type-select"
                      className="block text-[11px] font-bold text-slate-700 mb-1"
                    >
                      1. Borrower Category
                    </label>
                    <select
                      id="return-patron-type-select"
                      value={returnPatronType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setReturnPatronType(val);
                        if (val !== "STUDENT" && val !== "ALL") {
                          setReturnCourseId(null);
                        }
                        setSelectedReturnPatron(null);
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-emerald-700 focus:outline-hidden cursor-pointer"
                    >
                      <option value="ALL">All Categories</option>
                      <option value="STUDENT">Student</option>
                      <option value="FACULTY">Faculty</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </div>

                  {/* 2. College / Institution */}
                  <div>
                    <label
                      htmlFor="return-institution-select"
                      className="block text-[11px] font-bold text-slate-700 mb-1"
                    >
                      2. College / Campus
                    </label>
                    <select
                      id="return-institution-select"
                      value={returnInstitutionId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setReturnInstitutionId(val);
                        setReturnCourseId(null);
                        setReturnDepartmentId(null);
                        setSelectedReturnPatron(null);
                        setSelectedReturnBook(null);
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-emerald-700 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">All Colleges / Campuses</option>
                      {institutionsList.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} ({inst.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Course (for students) */}
                  <div>
                    <label
                      htmlFor="return-course-select"
                      className="block text-[11px] font-bold text-slate-700 mb-1"
                    >
                      3. Course {returnPatronType === "STUDENT" ? "(Students)" : ""}
                    </label>
                    <select
                      id="return-course-select"
                      value={returnCourseId ?? ""}
                      disabled={returnPatronType === "FACULTY" || returnPatronType === "STAFF"}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setReturnCourseId(val);
                        setSelectedReturnPatron(null);
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-emerald-700 focus:outline-hidden cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {returnPatronType === "FACULTY" || returnPatronType === "STAFF"
                          ? "N/A (Staff/Faculty)"
                          : "All Courses"}
                      </option>
                      {filteredCoursesForReturn.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} ({course.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Branch / Department */}
                  <div>
                    <label
                      htmlFor="return-branch-select"
                      className="block text-[11px] font-bold text-slate-700 mb-1"
                    >
                      4. Branch / Department
                    </label>
                    <select
                      id="return-branch-select"
                      value={returnDepartmentId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setReturnDepartmentId(val);
                        setSelectedReturnPatron(null);
                        setSelectedReturnBook(null);
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-emerald-700 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">All Branches / Depts</option>
                      {filteredDepartmentsForReturn.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick 1-Click Return Chips for Borrower's Issued Books */}
                {patronData?.activeLoans && patronData.activeLoans.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <span>
                          📖 Books Currently Borrowed by {patronData.firstName} (
                          {patronData.activeLoans.length})
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Click any book for instant 1-click return
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {patronData.activeLoans.map((loan) => (
                        <button
                          key={loan.id}
                          type="button"
                          onClick={() => {
                            setAccessionNo(loan.accessionNo);
                            handleReturnSubmit(undefined, loan.accessionNo);
                          }}
                          className={`group text-left rounded-md border p-2 text-xs transition cursor-pointer flex items-center space-x-2 ${
                            accessionNo === loan.accessionNo
                              ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-2 ring-emerald-500/20"
                              : "border-slate-200 bg-slate-50 hover:bg-emerald-50/50 hover:border-emerald-300 text-slate-800"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-900 group-hover:text-emerald-900 truncate max-w-[260px]">
                              {loan.title}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                              <span className="bg-slate-200 px-1 py-0.2 rounded font-semibold text-slate-700">
                                {loan.accessionNo}
                              </span>
                              <span>Due: {formatDate(loan.dueDate)}</span>
                              {loan.isOverdue && (
                                <span className="text-red-600 font-bold">
                                  ⚠️ Overdue ({loan.daysOverdue}d)
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-emerald-700 font-bold text-xs ml-1 bg-emerald-100 rounded px-1.5 py-0.5">
                            Return ↵
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Return Action & Summary Bar */}
                <div className="pt-3 border-t border-emerald-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    {selectedReturnBook ? (
                      <div className="text-emerald-950 font-medium flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500">Selected for return:</span>
                        <span className="font-semibold text-slate-900">
                          {selectedReturnBook.title}
                        </span>
                        <span className="font-mono text-[11px] bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded">
                          {selectedReturnBook.accessionNo}
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[11px]">
                        Select an issued book above or click Return on any borrowed book.
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading || !accessionNo.trim()}
                  >
                    {isLoading ? "Processing Return..." : "Process Return"}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Renew Tab Form */}
          {activeTab === "renew" && canRenew && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRenewSubmit();
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">Renew Issued Book</h3>
                <p className="text-xs text-slate-500">
                  Verifies overdue status, maximum renewals, fine limit, and waiting reservations.
                </p>
              </div>

              <div className="max-w-md">
                <Input
                  ref={copyInputRef}
                  id="circ-renew-barcode"
                  label="Item Accession / Barcode"
                  placeholder="Scan or enter barcode to renew..."
                  value={accessionNo}
                  onChange={(e) => setAccessionNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRenewSubmit();
                    }
                  }}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Press Enter after scanning to renew book issue
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" disabled={isLoading || !accessionNo.trim()}>
                  {isLoading ? "Verifying Renewal..." : "Renew Book (Enter)"}
                </Button>
              </div>
            </form>
          )}

          {/* Lost Tab Form */}
          {activeTab === "lost" && canMarkLost && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!accessionNo.trim()) return;
                setLostDialog({
                  isOpen: true,
                  barcodeOrAccession: accessionNo.trim(),
                  title: `Item with barcode ${accessionNo.trim()}`,
                });
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <h3 className="text-sm font-bold text-red-900">Declare Copy as Lost</h3>
                <p className="text-xs text-slate-500">
                  Charges item replacement fee, processing fee, and overdue fine to borrower per
                  BR-07.
                </p>
              </div>

              <div className="max-w-md">
                <Input
                  ref={copyInputRef}
                  id="circ-lost-barcode"
                  label="Item Accession / Barcode"
                  placeholder="Scan or enter barcode of lost item..."
                  value={accessionNo}
                  onChange={(e) => setAccessionNo(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="danger" disabled={isLoading || !accessionNo.trim()}>
                  Declare Lost Item...
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Active Issued Books Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-3 sm:gap-4 sm:flex-row sm:items-center mb-4 sm:mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Active Circulation Records</h2>
            <p className="text-xs text-slate-500">
              Real-time books currently issued across libraries ({loans.length} active)
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              id="circ-search-filter"
              placeholder="Search patron, title, accession..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        {filteredCheckouts.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            {loans.length === 0
              ? "No active book issues found in the database."
              : "No issued books matched your search filter."}
          </div>
        ) : (
          <>
            {/* Mobile Card List (< sm) */}
            <div className="space-y-3 sm:hidden">
              {filteredCheckouts.map((item) => {
                const isOverdue = new Date(item.dueDate) < new Date();
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Borrower:{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setCardNo(item.patronCard);
                              setActiveTab("issue");
                              handleLookupPatron(item.patronCard);
                            }}
                            className="font-semibold text-blue-900 hover:underline"
                          >
                            {item.patronName} ({item.patronCard})
                          </button>
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isOverdue
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isOverdue ? "OVERDUE" : item.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="font-mono bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                        Acc: {item.accessionNo}
                      </span>
                      <span className="bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                        Issued: {formatDate(item.issueDate)}
                      </span>
                      <span
                        className={`font-semibold px-1.5 py-0.5 rounded border ${
                          isOverdue
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                      >
                        Due: {formatDate(item.dueDate)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200">
                      {canReturn && (
                        <button
                          type="button"
                          onClick={() => handleReturnSubmit(undefined, item.accessionNo)}
                          className="flex-1 rounded py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition text-center"
                        >
                          Return
                        </button>
                      )}
                      {canRenew && (
                        <button
                          type="button"
                          onClick={() => handleRenewSubmit(undefined, item.id)}
                          className="flex-1 rounded py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition text-center"
                        >
                          Renew
                        </button>
                      )}
                      {canMarkLost && (
                        <button
                          type="button"
                          onClick={() =>
                            setLostDialog({
                              isOpen: true,
                              loanId: item.id,
                              barcodeOrAccession: item.accessionNo,
                              title: item.title,
                              patronName: item.patronName,
                            })
                          }
                          className="flex-1 rounded py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition text-center"
                        >
                          Lost
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Patron</TableHeaderCell>
                    <TableHeaderCell>Card Number</TableHeaderCell>
                    <TableHeaderCell>Title</TableHeaderCell>
                    <TableHeaderCell>Accession No</TableHeaderCell>
                    <TableHeaderCell>Issue Date</TableHeaderCell>
                    <TableHeaderCell>Due Date</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {filteredCheckouts.map((item) => {
                    const isOverdue = new Date(item.dueDate) < new Date();
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-semibold text-slate-900">
                          {item.patronName}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          <button
                            type="button"
                            onClick={() => {
                              setCardNo(item.patronCard);
                              setActiveTab("issue");
                              handleLookupPatron(item.patronCard);
                            }}
                            className="hover:underline text-blue-900 font-semibold"
                            title="Click to view patron record"
                          >
                            {item.patronCard}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-slate-900 font-medium">
                          {item.title}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {item.accessionNo}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {formatDate(item.issueDate)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={isOverdue ? "font-bold text-red-600" : "text-slate-600"}>
                            {formatDate(item.dueDate)}
                            {isOverdue && " (Overdue)"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isOverdue
                                ? "bg-red-100 text-red-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isOverdue ? "OVERDUE" : item.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-1.5">
                            {canReturn && (
                              <button
                                type="button"
                                onClick={() => handleReturnSubmit(undefined, item.accessionNo)}
                                className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                                title="Process Return"
                              >
                                Return
                              </button>
                            )}
                            {canRenew && (
                              <button
                                type="button"
                                onClick={() => handleRenewSubmit(undefined, item.id)}
                                className="rounded px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                                title="Renew Book"
                              >
                                Renew
                              </button>
                            )}
                            {canMarkLost && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLostDialog({
                                    isOpen: true,
                                    loanId: item.id,
                                    barcodeOrAccession: item.accessionNo,
                                    title: item.title,
                                    patronName: item.patronName,
                                  })
                                }
                                className="rounded px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition"
                                title="Declare Lost"
                              >
                                Lost
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Confirm Declare Lost Dialog */}
      <ConfirmDialog
        isOpen={lostDialog.isOpen}
        title="Declare Material Lost?"
        message={`Are you sure you want to declare "${lostDialog.title || "this book"}" as LOST? This will close the issue record, mark the copy as LOST in the catalogue, and charge replacement costs plus processing fee to the borrower.`}
        confirmLabel="Declare Lost & Assess Fee"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isLoading}
        onConfirm={handleConfirmMarkLost}
        onCancel={() => setLostDialog({ isOpen: false })}
      />
    </div>
  );
}
