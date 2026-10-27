"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { generateDepartmentBarcode, getDepartmentBarcodePrefix } from "@/lib/department-barcodes";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/validations/catalogue";

export interface CatalogueTitleItem {
  id: number;
  title: string;
  subtitle: string | null;
  authors: string;
  isbn: string | null;
  edition: string | null;
  pubYear: number | null;
  callNumber: string | null;
  itemTypeId: number;
  itemTypeName: string;
  departmentId?: number | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  barcode?: string | null;
  accessionNo?: string | null;
  copyId?: number | null;
  totalCopies: number;
  availableCopies: number;
  bibCount?: number;
  status?: string | null;
}

export interface MasterOption {
  id: number;
  name: string;
  code: string;
  institutionId?: number | null;
}

export interface CopyDetail {
  id: number;
  bibId?: number;
  accessionNo: string;
  barcode: string;
  status: string;
  location: string | null;
  price: string;
  libraryName: string;
  departmentId?: number | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  institutionId?: number | null;
  institutionName?: string | null;
  institutionCode?: string | null;
  title?: string;
  authors?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface CatalogueClientProps {
  initialTitles: CatalogueTitleItem[];
  initialPagination?: PaginationInfo;
  institutions: MasterOption[];
  itemTypes: MasterOption[];
  departments: MasterOption[];
  libraries: MasterOption[];
  csrfToken: string;
  canManage: boolean;
  userLibraryId?: number | null;
  selectedLibraryId?: number | null;
  isSuperAdmin?: boolean;
  autoOpenAddBook?: boolean;
}

export function CatalogueClient({
  initialTitles,
  initialPagination,
  institutions,
  itemTypes,
  departments,
  libraries,
  csrfToken,
  canManage,
  userLibraryId,
  selectedLibraryId,
  isSuperAdmin,
  autoOpenAddBook,
}: CatalogueClientProps) {
  const router = useRouter();

  // View Mode: 'all' = individual book copies with unique barcodes; 'consolidated' = grouped by title & author
  const [viewMode, setViewMode] = useState<"all" | "consolidated">("all");

  // Primary data states
  const [titles, setTitles] = useState<CatalogueTitleItem[]>(initialTitles);
  const [pagination, setPagination] = useState<PaginationInfo>(
    initialPagination ?? {
      page: 1,
      limit: 50,
      totalCount: initialTitles.length,
      totalPages: Math.ceil(initialTitles.length / 50) || 1,
    },
  );
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Hierarchical Filter States
  const [activeLibFilter, setActiveLibFilter] = useState<string>(
    selectedLibraryId ? String(selectedLibraryId) : "",
  );
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>("");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState<number>(initialPagination?.limit ?? 50);

  // Auto-open Add Book modal if requested via URL
  useEffect(() => {
    if (autoOpenAddBook && canManage) {
      setShowAddModal(true);
    }
  }, [autoOpenAddBook, canManage]);

  // Row selection for batch actions
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const [actionAlert, setActionAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Add Title Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmittingTitle, setIsSubmittingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState({
    title: "",
    subtitle: "",
    authors: "",
    isbn: "",
    edition: "",
    publisher: "",
    pubYear: "",
    itemTypeId: itemTypes[0]?.id ? String(itemTypes[0].id) : "1",
    departmentId: "",
    callNumber: "",
    price: "",
  });

  // Title Details & Copies Drawer state (Regular & Consolidated)
  const [selectedBibId, setSelectedBibId] = useState<number | null>(null);
  const [bibDetail, setBibDetail] = useState<{
    title: CatalogueTitleItem;
    copies: CopyDetail[];
    isConsolidated?: boolean;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add Copies state
  const [showAddCopies, setShowAddCopies] = useState(false);
  const [isSubmittingCopies, setIsSubmittingCopies] = useState(false);
  const [copyForm, setCopyForm] = useState({
    libraryId:
      (selectedLibraryId ? String(selectedLibraryId) : "") ||
      (userLibraryId ? String(userLibraryId) : "") ||
      (libraries[0]?.id ? String(libraries[0].id) : "1"),
    count: 1,
    location: "",
    price: "",
  });

  // Department Transfer Modal State
  const [transferModal, setTransferModal] = useState<{
    open: boolean;
    items: Array<{ id: number; barcode: string; title: string; currentDeptName?: string }>;
    targetCollegeId: string;
    targetDeptId: string;
  } | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  // Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: "copy" | "title" | "batch";
    id: number;
    batchIds?: number[];
    barcodeOrTitle: string;
  } | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Filter departments dynamically based on selected college in filter toolbar
  const availableDepartments = departments.filter((dept) => {
    if (!selectedCollegeId) return true;
    return String(dept.institutionId) === selectedCollegeId;
  });

  // Selected college metadata
  const selectedCollegeObj = institutions.find((inst) => String(inst.id) === selectedCollegeId);

  // Server-side query fetching function
  const fetchTitles = async (
    targetPage: number,
    search: string,
    collegeId: string,
    deptId: string,
    typeFilter: string,
    limit: number,
    currentViewMode: "all" | "consolidated" = viewMode,
    libFilter: string = activeLibFilter,
  ) => {
    setIsLoading(true);
    setActionAlert(null);
    setSelectedItemIds([]);

    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", String(limit));
      params.set("viewMode", currentViewMode);
      if (search.trim()) params.set("search", search.trim());
      if (collegeId) params.set("institutionId", collegeId);
      if (deptId) params.set("departmentId", deptId);
      if (typeFilter) params.set("itemTypeId", typeFilter);
      if (libFilter) {
        params.set("libraryId", libFilter);
      } else if (!isSuperAdmin && userLibraryId) {
        params.set("libraryId", String(userLibraryId));
      }

      const res = await fetch(`/api/catalogue/titles?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setTitles(data.records);
        setPagination(data.pagination);
      } else {
        setActionAlert({
          variant: "error",
          message: data.error || "Failed to load catalogue books.",
        });
      }
    } catch {
      setActionAlert({
        variant: "error",
        message: "Network error occurred while fetching books from catalogue.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle View Mode
  const handleToggleViewMode = (newMode: "all" | "consolidated") => {
    setViewMode(newMode);
    fetchTitles(
      1,
      searchTerm,
      selectedCollegeId,
      selectedDeptId,
      selectedTypeFilter,
      pageSize,
      newMode,
      activeLibFilter,
    );
  };

  // Switch Library Filter (Super Admin)
  const handleLibraryChange = (newLibId: string) => {
    setActiveLibFilter(newLibId);
    setCopyForm((prev) => ({
      ...prev,
      libraryId: newLibId || (libraries[0]?.id ? String(libraries[0].id) : "1"),
    }));
    fetchTitles(
      1,
      searchTerm,
      selectedCollegeId,
      selectedDeptId,
      selectedTypeFilter,
      pageSize,
      viewMode,
      newLibId,
    );
  };

  // Debounced search effect
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchTitles(
        1,
        val,
        selectedCollegeId,
        selectedDeptId,
        selectedTypeFilter,
        pageSize,
        viewMode,
        activeLibFilter,
      );
    }, 400);
  };

  // College dropdown change handler
  const handleCollegeChange = (newCollegeId: string) => {
    setSelectedCollegeId(newCollegeId);
    setSelectedDeptId("");
    fetchTitles(1, searchTerm, newCollegeId, "", selectedTypeFilter, pageSize, viewMode, activeLibFilter);
  };

  // Department dropdown change handler
  const handleDepartmentChange = (newDeptId: string) => {
    setSelectedDeptId(newDeptId);
    fetchTitles(
      1,
      searchTerm,
      selectedCollegeId,
      newDeptId,
      selectedTypeFilter,
      pageSize,
      viewMode,
      activeLibFilter,
    );
  };

  // Item type dropdown change handler
  const handleTypeFilterChange = (newTypeFilter: string) => {
    setSelectedTypeFilter(newTypeFilter);
    fetchTitles(
      1,
      searchTerm,
      selectedCollegeId,
      selectedDeptId,
      newTypeFilter,
      pageSize,
      viewMode,
      activeLibFilter,
    );
  };

  // Page jump handler
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === pagination.page) return;
    fetchTitles(
      newPage,
      searchTerm,
      selectedCollegeId,
      selectedDeptId,
      selectedTypeFilter,
      pageSize,
      viewMode,
      activeLibFilter,
    );
  };

  // Page size dropdown handler
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    fetchTitles(
      1,
      searchTerm,
      selectedCollegeId,
      selectedDeptId,
      selectedTypeFilter,
      newSize,
      viewMode,
      activeLibFilter,
    );
  };

  // View copy details for single title
  const handleViewDetails = async (bibId: number) => {
    setSelectedBibId(bibId);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/catalogue/titles/${bibId}`);
      const data = await res.json();
      if (res.ok && data.title) {
        setBibDetail({
          title: data.title,
          copies: data.title.copies || [],
          isConsolidated: false,
        });
      }
    } catch {
      setActionAlert({ variant: "error", message: "Failed to load copy details" });
    } finally {
      setLoadingDetail(false);
    }
  };

  // View consolidated copies for title & author
  const handleViewConsolidated = async (item: CatalogueTitleItem) => {
    setLoadingDetail(true);
    setSelectedBibId(item.id);
    try {
      const params = new URLSearchParams();
      params.set("title", item.title);
      if (item.authors) params.set("authors", item.authors);
      if (activeLibFilter) {
        params.set("libraryId", activeLibFilter);
      } else if (!isSuperAdmin && userLibraryId) {
        params.set("libraryId", String(userLibraryId));
      }

      const res = await fetch(`/api/catalogue/consolidated-copies?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.copies) {
        setBibDetail({
          title: item,
          copies: data.copies,
          isConsolidated: true,
        });
      } else {
        setActionAlert({
          variant: "error",
          message: data.error || "Failed to load consolidated copies",
        });
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error loading consolidated copies" });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle Add Title
  const handleCreateTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTitle(true);
    setActionAlert(null);

    try {
      const res = await fetch("/api/catalogue/titles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          title: newTitle.title,
          subtitle: newTitle.subtitle || undefined,
          authors: newTitle.authors,
          isbn: newTitle.isbn || undefined,
          edition: newTitle.edition || undefined,
          publisher: newTitle.publisher || undefined,
          pubYear: newTitle.pubYear ? Number(newTitle.pubYear) : undefined,
          itemTypeId: Number(newTitle.itemTypeId),
          departmentId: newTitle.departmentId ? Number(newTitle.departmentId) : undefined,
          callNumber: newTitle.callNumber || undefined,
          price: newTitle.price ? Number(newTitle.price) : undefined,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to create title" });
      } else {
        setActionAlert({
          variant: "success",
          message: `Title "${data.title.title}" created successfully!`,
        });
        setShowAddModal(false);
        setNewTitle({
          title: "",
          subtitle: "",
          authors: "",
          isbn: "",
          edition: "",
          publisher: "",
          pubYear: "",
          itemTypeId: itemTypes[0]?.id ? String(itemTypes[0].id) : "1",
          departmentId: "",
          callNumber: "",
          price: "",
        });
        fetchTitles(
          1,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error occurred creating title" });
    } finally {
      setIsSubmittingTitle(false);
    }
  };

  // Handle Add Copies
  const handleAddCopies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBibId) return;

    setIsSubmittingCopies(true);
    setActionAlert(null);

    try {
      const res = await fetch(`/api/catalogue/titles/${selectedBibId}/copies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          libraryId: Number(copyForm.libraryId),
          count: Number(copyForm.count),
          location: copyForm.location || undefined,
          price: copyForm.price ? Number(copyForm.price) : undefined,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to add copies" });
      } else {
        setActionAlert({
          variant: "success",
          message: `Successfully accessioned ${data.copies.length} copies! Range: ${data.accessionRange.from} to ${data.accessionRange.to}`,
        });
        setShowAddCopies(false);
        setCopyForm({
          libraryId: libraries[0]?.id ? String(libraries[0].id) : "1",
          count: 1,
          location: "",
          price: "",
        });
        if (bibDetail?.isConsolidated) {
          handleViewConsolidated(bibDetail.title);
        } else {
          handleViewDetails(selectedBibId);
        }
        fetchTitles(
          pagination.page,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error adding copies" });
    } finally {
      setIsSubmittingCopies(false);
    }
  };

  // Handle Status Update
  const handleUpdateCopyStatus = async (copyId: number, status: ItemStatus) => {
    try {
      const res = await fetch(`/api/catalogue/copies/${copyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ status, csrfToken }),
      });
      if (res.ok) {
        if (bibDetail) {
          if (bibDetail.isConsolidated) {
            handleViewConsolidated(bibDetail.title);
          } else {
            handleViewDetails(bibDetail.title.id);
          }
        }
        fetchTitles(
          pagination.page,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
      }
    } catch {
      alert("Error updating copy status");
    }
  };

  // Open Transfer Modal
  const openTransferModal = (
    items: Array<{ id: number; barcode: string; title: string; currentDeptName?: string }>,
  ) => {
    const firstItem = items[0];
    const initialDept = departments[0];
    setTransferModal({
      open: true,
      items,
      targetCollegeId: initialDept ? String(initialDept.institutionId) : "",
      targetDeptId: initialDept ? String(initialDept.id) : "",
    });
  };

  // Submit Department Transfer
  const handleConfirmTransfer = async () => {
    if (!transferModal || !transferModal.targetDeptId) return;

    setIsSubmittingTransfer(true);
    setActionAlert(null);

    try {
      const res = await fetch("/api/catalogue/transfer-department", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          itemIds: transferModal.items.map((it) => it.id),
          targetDepartmentId: Number(transferModal.targetDeptId),
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to transfer books" });
      } else {
        const changesSummary = data.transfers
          .map(
            (t: { oldBarcode: string; newBarcode: string }) => `${t.oldBarcode} → ${t.newBarcode}`,
          )
          .join(", ");
        setActionAlert({
          variant: "success",
          message: `Successfully shifted ${data.transferredCount} book(s) to ${data.targetDepartment.name} (${data.targetDepartment.institutionCode})! Barcode updated: ${changesSummary}`,
        });
        setTransferModal(null);
        setSelectedItemIds([]);
        if (bibDetail) {
          if (bibDetail.isConsolidated) {
            handleViewConsolidated(bibDetail.title);
          } else {
            handleViewDetails(bibDetail.title.id);
          }
        }
        fetchTitles(
          pagination.page,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
      }
    } catch {
      setActionAlert({
        variant: "error",
        message: "Network error occurred during department transfer",
      });
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!deleteModal) return;

    setIsSubmittingDelete(true);
    setActionAlert(null);

    try {
      if (deleteModal.type === "batch") {
        const batchIds = deleteModal.batchIds ?? [];
        let successCount = 0;
        let failCount = 0;

        for (const copyId of batchIds) {
          try {
            const res = await fetch(`/api/catalogue/copies/${copyId}`, {
              method: "DELETE",
              headers: { "x-csrf-token": csrfToken },
            });
            if (res.ok) successCount++;
            else failCount++;
          } catch {
            failCount++;
          }
        }

        setActionAlert({
          variant: failCount > 0 ? "warning" : "success",
          message:
            failCount > 0
              ? `Deleted ${successCount} book copies. ${failCount} could not be deleted (may be currently checked out).`
              : `Successfully deleted all ${successCount} selected book copies.`,
        });

        setDeleteModal(null);
        setSelectedItemIds([]);
        fetchTitles(
          pagination.page,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
        return;
      }

      const url =
        deleteModal.type === "copy"
          ? `/api/catalogue/copies/${deleteModal.id}`
          : `/api/catalogue/titles/${deleteModal.id}`;

      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to delete" });
      } else {
        setActionAlert({
          variant: "success",
          message:
            deleteModal.type === "copy"
              ? `Book copy [Barcode: ${data.deletedBarcode || deleteModal.barcodeOrTitle}] was deleted successfully.`
              : `Book title "${data.deletedTitle || deleteModal.barcodeOrTitle}" and all copies were deleted.`,
        });
        setDeleteModal(null);

        // Update drawer state if open
        if (bibDetail) {
          if (deleteModal.type === "title") {
            setBibDetail(null);
          } else if (bibDetail.isConsolidated) {
            handleViewConsolidated(bibDetail.title);
          } else {
            handleViewDetails(bibDetail.title.id);
          }
        }

        fetchTitles(
          pagination.page,
          searchTerm,
          selectedCollegeId,
          selectedDeptId,
          selectedTypeFilter,
          pageSize,
          viewMode,
        );
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error occurred during deletion" });
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Toggle selection for single item
  const handleToggleSelect = (copyId: number) => {
    setSelectedItemIds((prev) =>
      prev.includes(copyId) ? prev.filter((id) => id !== copyId) : [...prev, copyId],
    );
  };

  // Toggle select all on page
  const handleSelectAllOnPage = () => {
    const pageItemIds = titles
      .map((t) => t.copyId)
      .filter((id): id is number => typeof id === "number");
    const allSelected = pageItemIds.every((id) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !pageItemIds.includes(id)));
    } else {
      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...pageItemIds])));
    }
  };

  const startRecord = pagination.totalCount > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.totalCount);

  // Transfer modal target departments
  const transferDepartments = transferModal
    ? departments.filter((d) => {
        if (!transferModal.targetCollegeId) return true;
        return String(d.institutionId) === transferModal.targetCollegeId;
      })
    : [];

  const selectedTargetDeptObj = transferModal
    ? departments.find((d) => String(d.id) === transferModal.targetDeptId)
    : null;

  return (
    <div className="space-y-6">
      {actionAlert && (
        <Alert variant={actionAlert.variant} onDismiss={() => setActionAlert(null)}>
          {actionAlert.message}
        </Alert>
      )}

      {/* Dynamic Categorical Filtering Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        {/* Super Admin Multi-Library Toggle Pills */}
        {isSuperAdmin && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-purple-600 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-900">
                Filter by Library Branch:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleLibraryChange("")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition border flex items-center gap-1.5 ${
                  !activeLibFilter
                    ? "bg-purple-900 text-white border-purple-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>🏛️</span>
                <span>All Libraries</span>
              </button>
              {libraries.map((lib) => {
                const isSelected = activeLibFilter === String(lib.id);
                const icon =
                  lib.code === "RBCN"
                    ? "🏥"
                    : lib.code === "RBCP"
                      ? "💊"
                      : lib.code === "LIB-GN"
                        ? "🏢"
                        : "📚";
                return (
                  <button
                    key={lib.id}
                    type="button"
                    onClick={() => handleLibraryChange(String(lib.id))}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition border flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-blue-900 text-white border-blue-900 shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>{icon}</span>
                    <span>{lib.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Header with View Mode Switcher */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between pb-3 border-b border-slate-100">
          {/* View Mode Toggle: All Copies vs Consolidated */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleToggleViewMode("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${
                viewMode === "all"
                  ? "bg-white text-blue-900 shadow-xs font-black border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              📋 All Individual Copies{" "}
              {viewMode === "all" ? `(${pagination.totalCount.toLocaleString()})` : ""}
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode("consolidated")}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 ${
                viewMode === "consolidated"
                  ? "bg-white text-indigo-900 shadow-xs font-black border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📚 Consolidated Book List</span>
              {viewMode === "consolidated" ? (
                <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {pagination.totalCount.toLocaleString()} Titles
                </span>
              ) : (
                <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  Grouped
                </span>
              )}
            </button>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-3">
            {canManage && (
              <Button variant="primary" onClick={() => setShowAddModal(true)}>
                + Add Title
              </Button>
            )}
          </div>
        </div>

        {/* Search Box & Controls */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex-1 min-w-[280px]">
            <Input
              id="catalogue-search-filter"
              placeholder={
                viewMode === "consolidated"
                  ? "Search consolidated books by title, author, barcode..."
                  : "Search across all books by barcode (e.g. DENGGD-01), title, author, ISBN..."
              }
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Dynamic Cascading Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          {/* Step 1: Select College */}
          <div>
            <label
              htmlFor="filter-college"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              🏛️ 1. Select College:
            </label>
            <Select
              id="filter-college"
              value={selectedCollegeId}
              onChange={(e) => handleCollegeChange(e.target.value)}
              options={[
                { value: "", label: "All Colleges (RBMI Group)" },
                ...institutions.map((inst) => ({
                  value: String(inst.id),
                  label: `${inst.code} — ${inst.name}`,
                })),
              ]}
            />
          </div>

          {/* Step 2: Select Department (Dynamically Cascades from Selected College) */}
          <div>
            <label
              htmlFor="filter-dept"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              📚 2. Department / Program:
            </label>
            <Select
              id="filter-dept"
              value={selectedDeptId}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              options={[
                {
                  value: "",
                  label: selectedCollegeObj
                    ? `All Departments in ${selectedCollegeObj.code}`
                    : "All Departments (Entire Collection)",
                },
                ...availableDepartments.map((dept) => ({
                  value: String(dept.id),
                  label: `${dept.name} (${dept.code})`,
                })),
              ]}
            />
          </div>

          {/* Step 3: Material Type Filter */}
          <div>
            <label
              htmlFor="filter-type"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              📖 3. Material Type:
            </label>
            <Select
              id="filter-type"
              value={selectedTypeFilter}
              onChange={(e) => handleTypeFilterChange(e.target.value)}
              options={[
                { value: "", label: "All Material Types" },
                ...itemTypes.map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
          </div>
        </div>

        {/* Active Filter Pills Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-500">Active View:</span>
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded border border-slate-200">
              {viewMode === "consolidated"
                ? "📚 Consolidated (Grouped)"
                : "📋 All Individual Copies"}
            </span>

            {selectedCollegeId ? (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-200">
                🏛️ {selectedCollegeObj?.name || selectedCollegeObj?.code}
                <button
                  type="button"
                  onClick={() => handleCollegeChange("")}
                  className="hover:text-blue-950 font-black ml-1"
                  title="Remove college filter"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">All Colleges</span>
            )}

            {selectedDeptId && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                📚 {departments.find((d) => String(d.id) === selectedDeptId)?.name}
                <button
                  type="button"
                  onClick={() => handleDepartmentChange("")}
                  className="hover:text-emerald-950 font-black ml-1"
                  title="Remove department filter"
                >
                  ×
                </button>
              </span>
            )}

            {(selectedCollegeId || selectedDeptId || selectedTypeFilter || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCollegeId("");
                  setSelectedDeptId("");
                  setSelectedTypeFilter("");
                  setSearchTerm("");
                  fetchTitles(1, "", "", "", "", pageSize, viewMode);
                }}
                className="text-slate-500 hover:text-slate-800 underline text-xs ml-2"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="text-xs text-slate-600 font-medium">
            {isLoading ? (
              <span className="text-blue-700 animate-pulse font-bold">
                Querying library catalogue...
              </span>
            ) : (
              <span>
                Showing <strong className="text-slate-900">{startRecord.toLocaleString()}</strong>{" "}
                to <strong className="text-slate-900">{endRecord.toLocaleString()}</strong> of{" "}
                <strong className="text-blue-900 font-bold">
                  {pagination.totalCount.toLocaleString()}
                </strong>{" "}
                {viewMode === "consolidated" ? "consolidated titles" : "books / copies"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Batch Action Floating Toolbar */}
      {selectedItemIds.length > 0 && viewMode === "all" && (
        <div className="sticky top-4 z-30 flex items-center justify-between rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 shadow-md">
          <div className="flex items-center space-x-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {selectedItemIds.length}
            </span>
            <span className="text-xs font-bold text-blue-900">
              {selectedItemIds.length === 1
                ? "1 book copy selected"
                : `${selectedItemIds.length} book copies selected`}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {canManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const selectedItems = titles
                    .filter((t) => t.copyId && selectedItemIds.includes(t.copyId))
                    .map((t) => ({
                      id: t.copyId as number,
                      barcode: t.barcode || `ACC-${t.id}`,
                      title: t.title,
                      currentDeptName: t.departmentName || undefined,
                    }));
                  openTransferModal(selectedItems);
                }}
              >
                🔄 Shift Department ({selectedItemIds.length})
              </Button>
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-700 border-red-300 hover:bg-red-50 font-bold"
                onClick={() =>
                  setDeleteModal({
                    open: true,
                    type: "batch",
                    id: 0,
                    batchIds: selectedItemIds,
                    barcodeOrTitle: `${selectedItemIds.length} selected book copies`,
                  })
                }
              >
                🗑️ Delete Selected ({selectedItemIds.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSelectedItemIds([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Main Table */}
      {titles.length === 0 ? (
        <EmptyState
          title="No Books Found"
          description={
            pagination.totalCount === 0
              ? "No books match the selected College and Department filter. Choose another category or click '+ Add Title' to catalog a new book."
              : "No books match your search keywords."
          }
          icon="📚"
        />
      ) : viewMode === "consolidated" ? (
        /* CONSOLIDATED BOOK LIST VIEW */
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Author</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>College &amp; Department</TableHeaderCell>
                  <TableHeaderCell>Copies</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {titles.map((item) => {
                  const hasAvailable = item.availableCopies > 0;
                  return (
                    <TableRow key={`cons-${item.id}-${item.title}`}>
                      {/* Title */}
                      <TableCell className="max-w-md">
                        <button
                          type="button"
                          onClick={() => handleViewConsolidated(item)}
                          className="text-left font-bold text-slate-900 hover:text-blue-900 transition line-clamp-2"
                          title={item.title}
                        >
                          {item.title}
                        </button>
                        {item.isbn && (
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            ISBN: {item.isbn}
                          </div>
                        )}
                      </TableCell>

                      {/* Author */}
                      <TableCell>
                        <span
                          className="text-xs font-medium text-slate-800 max-w-[200px] truncate block"
                          title={item.authors}
                        >
                          {item.authors}
                        </span>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          {item.itemTypeName}
                        </span>
                      </TableCell>

                      {/* College & Department */}
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {item.institutionCode && (
                            <span
                              onClick={() => {
                                if (item.institutionId)
                                  handleCollegeChange(String(item.institutionId));
                              }}
                              className="cursor-pointer font-bold text-[10px] text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition"
                            >
                              🏛️ {item.institutionCode}
                            </span>
                          )}
                          {item.departmentName && (
                            <span
                              onClick={() => {
                                if (item.departmentId)
                                  handleDepartmentChange(String(item.departmentId));
                              }}
                              className="cursor-pointer text-xs font-semibold text-slate-800 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-slate-200 transition"
                            >
                              📚 {item.departmentName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Copies */}
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            hasAvailable
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}
                        >
                          📚 {item.totalCopies} {item.totalCopies === 1 ? "Copy" : "Copies"}
                          <span className="text-[10px] font-medium opacity-80">
                            ({item.availableCopies} available)
                          </span>
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleViewConsolidated(item)}
                        >
                          View Copies ({item.totalCopies}) &rsaquo;
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-200 bg-slate-50 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-600">Rows per page:</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded border border-slate-300 text-xs p-1 bg-white font-medium"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                Page <strong className="text-slate-900">{pagination.page}</strong> of{" "}
                <strong className="text-slate-900">{pagination.totalPages || 1}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => handlePageChange(1)}
              >
                &laquo; First
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                &lsaquo; Prev
              </Button>
              <div className="px-2 font-mono font-bold text-slate-800">
                {pagination.page} / {pagination.totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next &rsaquo;
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => handlePageChange(pagination.totalPages)}
              >
                Last &raquo;
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* INDIVIDUAL BOOK COPIES DETAILED VIEW (WITH BARCODE COLUMN) */
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  {canManage && (
                    <TableHeaderCell className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={
                          titles.length > 0 &&
                          titles
                            .map((t) => t.copyId)
                            .filter((id): id is number => typeof id === "number")
                            .every((id) => selectedItemIds.includes(id))
                        }
                        onChange={handleSelectAllOnPage}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </TableHeaderCell>
                  )}
                  <TableHeaderCell>Book Code (Alphanumeric)</TableHeaderCell>
                  <TableHeaderCell>Title &amp; Subtitle</TableHeaderCell>
                  <TableHeaderCell>College &amp; Department</TableHeaderCell>
                  <TableHeaderCell>Authors</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Call No / ISBN</TableHeaderCell>
                  <TableHeaderCell>Shelf Availability</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {titles.map((item) => {
                  const hasAvailable = item.availableCopies > 0;
                  const isChecked = item.copyId ? selectedItemIds.includes(item.copyId) : false;

                  return (
                    <TableRow
                      key={`copy-${item.copyId || item.id}`}
                      className={isChecked ? "bg-blue-50/50" : undefined}
                    >
                      {/* Checkbox */}
                      {canManage && (
                        <TableCell>
                          {item.copyId ? (
                            <input
                              type="checkbox"
                              aria-label={`Select book ${item.title}`}
                              checked={isChecked}
                              onChange={() => handleToggleSelect(item.copyId as number)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          ) : null}
                        </TableCell>
                      )}

                      {/* Book Code (Alphanumeric) Column */}
                      <TableCell className="whitespace-nowrap">
                        {item.barcode ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              📘 {item.barcode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">—</span>
                        )}
                      </TableCell>

                      {/* Title & Subtitle */}
                      <TableCell className="max-w-md">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(item.id)}
                          className="text-left font-bold text-slate-900 hover:text-blue-900 transition line-clamp-2"
                          title={item.title}
                        >
                          {item.title}
                        </button>
                        {item.subtitle && (
                          <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                            {item.subtitle}
                          </div>
                        )}
                      </TableCell>

                      {/* College & Department */}
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {item.institutionCode && (
                            <span
                              onClick={() => {
                                if (item.institutionId)
                                  handleCollegeChange(String(item.institutionId));
                              }}
                              className="cursor-pointer font-bold text-[10px] text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition"
                              title={`Filter by ${item.institutionName || item.institutionCode}`}
                            >
                              🏛️ {item.institutionCode}
                            </span>
                          )}
                          {item.departmentName && (
                            <span
                              onClick={() => {
                                if (item.departmentId)
                                  handleDepartmentChange(String(item.departmentId));
                              }}
                              className="cursor-pointer text-xs font-semibold text-slate-800 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-slate-200 transition"
                              title={`Filter by ${item.departmentName}`}
                            >
                              📚 {item.departmentName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Authors */}
                      <TableCell>
                        <span
                          className="text-xs text-slate-700 max-w-[180px] truncate block"
                          title={item.authors}
                        >
                          {item.authors}
                        </span>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          {item.itemTypeName}
                        </span>
                      </TableCell>

                      {/* Call No / ISBN */}
                      <TableCell className="font-mono text-xs text-slate-600">
                        {item.callNumber ? (
                          <div className="font-semibold text-slate-800">{item.callNumber}</div>
                        ) : null}
                        <div className="text-[11px] text-slate-400">{item.isbn || "—"}</div>
                      </TableCell>

                      {/* Availability */}
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            hasAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.status
                            ? item.status === "AVAILABLE"
                              ? "Available"
                              : item.status
                            : `${item.availableCopies} / ${item.totalCopies} Available`}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Shift Department Button */}
                          {canManage && item.copyId && (
                            <button
                              type="button"
                              onClick={() =>
                                openTransferModal([
                                  {
                                    id: item.copyId as number,
                                    barcode: item.barcode || `ACC-${item.id}`,
                                    title: item.title,
                                    currentDeptName: item.departmentName || undefined,
                                  },
                                ])
                              }
                              className="rounded border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 transition"
                              title="Shift book to another department"
                            >
                              🔄 Shift
                            </button>
                          )}

                          {/* Delete Copy Button */}
                          {canManage && item.copyId && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteModal({
                                  open: true,
                                  type: "copy",
                                  id: item.copyId as number,
                                  barcodeOrTitle: item.barcode || `ID #${item.copyId}`,
                                })
                              }
                              className="rounded border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700 transition"
                              title="Delete this book copy"
                            >
                              🗑️
                            </button>
                          )}

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleViewDetails(item.id)}
                          >
                            Copies ({item.totalCopies})
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-200 bg-slate-50 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-600">Rows per page:</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded border border-slate-300 text-xs p-1 bg-white font-medium"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                Page <strong className="text-slate-900">{pagination.page}</strong> of{" "}
                <strong className="text-slate-900">{pagination.totalPages || 1}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => handlePageChange(1)}
              >
                &laquo; First
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                &lsaquo; Prev
              </Button>
              <div className="px-2 font-mono font-bold text-slate-800">
                {pagination.page} / {pagination.totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next &rsaquo;
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => handlePageChange(pagination.totalPages)}
              >
                Last &raquo;
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Title Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-title-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 id="add-title-modal-title" className="text-base font-bold text-slate-900">
                Catalog New Bibliographic Title (FR-CA-01)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTitle} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    id="new-title-title"
                    label="Book / Material Title"
                    value={newTitle.title}
                    onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id="new-title-subtitle"
                    label="Subtitle (Optional)"
                    value={newTitle.subtitle}
                    onChange={(e) => setNewTitle({ ...newTitle, subtitle: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-authors"
                    label="Author(s)"
                    placeholder="e.g. Kernighan, Brian; Ritchie, Dennis"
                    value={newTitle.authors}
                    onChange={(e) => setNewTitle({ ...newTitle, authors: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="new-title-isbn"
                    label="ISBN (10 or 13 digits)"
                    placeholder="e.g. 978-0131103627"
                    value={newTitle.isbn}
                    onChange={(e) => setNewTitle({ ...newTitle, isbn: e.target.value })}
                  />
                </div>
                <div>
                  <Select
                    id="new-title-type"
                    label="Item Material Type"
                    value={newTitle.itemTypeId}
                    onChange={(e) => setNewTitle({ ...newTitle, itemTypeId: e.target.value })}
                    options={itemTypes.map((t) => ({ value: String(t.id), label: t.name }))}
                    required
                  />
                </div>
                <div>
                  <Select
                    id="new-title-dept"
                    label="Academic Department / Program"
                    value={newTitle.departmentId}
                    onChange={(e) => setNewTitle({ ...newTitle, departmentId: e.target.value })}
                    options={[
                      { value: "", label: "General / Institutional" },
                      ...departments.map((d) => ({
                        value: String(d.id),
                        label: `${d.name} (${d.code})`,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-call"
                    label="Call Number / Classification"
                    placeholder="e.g. 005.13 KER"
                    value={newTitle.callNumber}
                    onChange={(e) => setNewTitle({ ...newTitle, callNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-year"
                    label="Publication Year"
                    type="number"
                    placeholder="e.g. 2024"
                    value={newTitle.pubYear}
                    onChange={(e) => setNewTitle({ ...newTitle, pubYear: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-edition"
                    label="Edition"
                    placeholder="e.g. 2nd Edition"
                    value={newTitle.edition}
                    onChange={(e) => setNewTitle({ ...newTitle, edition: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-price"
                    label="Cover Price (₹)"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 650.00"
                    value={newTitle.price}
                    onChange={(e) => setNewTitle({ ...newTitle, price: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-100 pt-4 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmittingTitle}>
                  Save Bibliographic Title
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Title Details & Copies Drawer / Modal */}
      {bibDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="copies-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-900">
                    {bibDetail.title.itemTypeName}
                  </span>
                  {bibDetail.isConsolidated && (
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-900">
                      Consolidated Title
                    </span>
                  )}
                </div>
                <h3 id="copies-modal-title" className="text-lg font-bold text-slate-900 mt-1">
                  {bibDetail.title.title}
                </h3>
                <p className="text-xs text-slate-500">
                  By {bibDetail.title.authors} &bull; Call No: {bibDetail.title.callNumber || "N/A"}{" "}
                  &bull; ISBN: {bibDetail.title.isbn || "N/A"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBibDetail(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Copies Header with Add Copies CTA */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Accessioned Physical Copies</h4>
                <p className="text-xs text-slate-500">
                  {bibDetail.copies.length} copies accessioned in library branches
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {canManage && !bibDetail.isConsolidated && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() =>
                      setDeleteModal({
                        open: true,
                        type: "title",
                        id: bibDetail.title.id,
                        barcodeOrTitle: bibDetail.title.title,
                      })
                    }
                  >
                    🗑️ Delete Title
                  </Button>
                )}
                {canManage && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowAddCopies(!showAddCopies)}
                  >
                    {showAddCopies ? "Hide Add Form" : "+ Add Copies (1–200)"}
                  </Button>
                )}
              </div>
            </div>

            {/* Add Copies Sub-Form */}
            {showAddCopies && (
              <form
                onSubmit={handleAddCopies}
                className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3"
              >
                <h5 className="text-xs font-bold text-blue-900 uppercase">
                  Batch Accessioning (FR-CA-02)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Select
                      id="copy-library-id"
                      label={`Library Branch${!isSuperAdmin && userLibraryId ? " (Assigned)" : ""}`}
                      value={copyForm.libraryId}
                      disabled={!isSuperAdmin && Boolean(userLibraryId)}
                      onChange={(e) => setCopyForm({ ...copyForm, libraryId: e.target.value })}
                      options={libraries.map((l) => ({
                        value: String(l.id),
                        label: `${l.name} (${l.code})`,
                      }))}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-count"
                      label="Number of Copies (1–200)"
                      type="number"
                      min={1}
                      max={200}
                      value={copyForm.count}
                      onChange={(e) => setCopyForm({ ...copyForm, count: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-location"
                      label="Shelf Location"
                      placeholder="e.g. Stack A-3, Shelf 2"
                      value={copyForm.location}
                      onChange={(e) => setCopyForm({ ...copyForm, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-price"
                      label="Copy Price (₹)"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 650.00"
                      value={copyForm.price}
                      onChange={(e) => setCopyForm({ ...copyForm, price: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingCopies}>
                    Generate &amp; Accession Copies
                  </Button>
                </div>
              </form>
            )}

            {/* Copies List */}
            {bibDetail.copies.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border rounded-lg">
                No physical copies accessioned yet for this title.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>#</TableHeaderCell>
                      <TableHeaderCell>Book Code (Alphanumeric)</TableHeaderCell>
                      <TableHeaderCell>Accession No</TableHeaderCell>
                      <TableHeaderCell>Department &amp; College</TableHeaderCell>
                      <TableHeaderCell>Branch / Location</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {bibDetail.copies.map((copy, index) => (
                      <TableRow key={`copy-detail-${copy.id}`}>
                        <TableCell className="text-xs text-slate-400 font-mono">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-800">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            📘 {copy.barcode}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700">
                          {copy.accessionNo}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-semibold text-slate-900">
                            {copy.departmentName || "General"}
                          </div>
                          {copy.institutionCode && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              🏛️ {copy.institutionCode}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <div>{copy.libraryName}</div>
                          <span className="text-[11px] text-slate-400">
                            {copy.location || "General Shelf"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              copy.status === "AVAILABLE"
                                ? "bg-emerald-100 text-emerald-800"
                                : copy.status === "ISSUED"
                                  ? "bg-blue-100 text-blue-800"
                                  : copy.status === "REFERENCE_ONLY"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {copy.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Shift Department Button */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() =>
                                  openTransferModal([
                                    {
                                      id: copy.id,
                                      barcode: copy.barcode,
                                      title: bibDetail.title.title,
                                      currentDeptName: copy.departmentName || undefined,
                                    },
                                  ])
                                }
                                className="rounded border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 transition"
                                title="Shift book to another department"
                              >
                                🔄 Shift
                              </button>
                            )}

                            {/* Delete Copy Button */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteModal({
                                    open: true,
                                    type: "copy",
                                    id: copy.id,
                                    barcodeOrTitle: copy.barcode,
                                  })
                                }
                                className="rounded border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700 transition"
                                title="Delete this copy"
                              >
                                🗑️
                              </button>
                            )}

                            {/* Status Changer */}
                            {canManage && copy.status !== "ISSUED" && (
                              <select
                                aria-label="Change Copy Status"
                                value={copy.status}
                                onChange={(e) =>
                                  handleUpdateCopyStatus(copy.id, e.target.value as ItemStatus)
                                }
                                className="rounded border border-slate-300 text-[11px] p-1 bg-white"
                              >
                                {ITEM_STATUSES.filter((s) => s !== "ISSUED").map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setBibDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DEPARTMENT TRANSFER MODAL WITH BARCODE RECALCULATION PREVIEW */}
      {transferModal && transferModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3
                id="transfer-modal-title"
                className="text-base font-bold text-slate-900 flex items-center gap-2"
              >
                <span>🔄 Shift Book(s) to Another Department</span>
              </h3>
              <button
                type="button"
                onClick={() => setTransferModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Items List */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 max-h-36 overflow-y-auto space-y-1.5">
                <div className="font-bold text-slate-700 uppercase text-[10px]">
                  Selected Books ({transferModal.items.length}):
                </div>
                {transferModal.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200"
                  >
                    <span className="font-medium text-slate-800 truncate max-w-[240px]">
                      {it.title}
                    </span>
                    <span className="font-mono font-bold text-blue-900">{it.barcode}</span>
                  </div>
                ))}
              </div>

              {/* Target College Selection */}
              <div>
                <label
                  htmlFor="transfer-college"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  1. Target College:
                </label>
                <Select
                  id="transfer-college"
                  value={transferModal.targetCollegeId}
                  onChange={(e) => {
                    const colId = e.target.value;
                    const deptsInCollege = departments.filter(
                      (d) => String(d.institutionId) === colId,
                    );
                    setTransferModal({
                      ...transferModal,
                      targetCollegeId: colId,
                      targetDeptId: deptsInCollege[0] ? String(deptsInCollege[0].id) : "",
                    });
                  }}
                  options={institutions.map((inst) => ({
                    value: String(inst.id),
                    label: `${inst.code} — ${inst.name}`,
                  }))}
                />
              </div>

              {/* Target Department Selection */}
              <div>
                <label
                  htmlFor="transfer-department"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  2. Target Department:
                </label>
                <Select
                  id="transfer-department"
                  value={transferModal.targetDeptId}
                  onChange={(e) =>
                    setTransferModal({ ...transferModal, targetDeptId: e.target.value })
                  }
                  options={transferDepartments.map((dept) => ({
                    value: String(dept.id),
                    label: `${dept.name} (${dept.code})`,
                  }))}
                />
              </div>

              {/* Automatic Barcode Recalculation Preview */}
              {selectedTargetDeptObj && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                    <span>⚡ Automatic Barcode Recalculation:</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Target Prefix:{" "}
                    <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300">
                      {getDepartmentBarcodePrefix(selectedTargetDeptObj.code)}
                    </strong>
                  </p>
                  <div className="space-y-1 pt-1 text-[11px]">
                    {transferModal.items.slice(0, 3).map((it) => {
                      const predictedBarcode = generateDepartmentBarcode(
                        it.barcode,
                        selectedTargetDeptObj.code,
                      );
                      return (
                        <div key={it.id} className="flex items-center justify-between font-mono">
                          <span className="text-slate-500">{it.barcode}</span>
                          <span className="font-bold text-emerald-800">➔ {predictedBarcode}</span>
                        </div>
                      );
                    })}
                    {transferModal.items.length > 3 && (
                      <div className="text-[10px] text-amber-700 italic">
                        + {transferModal.items.length - 3} more will be automatically recalculated
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setTransferModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmTransfer}
                isLoading={isSubmittingTransfer}
                disabled={!transferModal.targetDeptId}
              >
                Confirm &amp; Shift Department
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal && deleteModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3
              id="delete-modal-title"
              className="text-base font-bold text-red-700 flex items-center gap-2"
            >
              <span>⚠️ Confirm Book Deletion</span>
            </h3>
            <p className="text-xs text-slate-600">
              {deleteModal.type === "copy" ? (
                <>
                  Are you sure you want to permanently delete book copy{" "}
                  <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                    {deleteModal.barcodeOrTitle}
                  </strong>
                  ? This action will remove the copy and its accession records from the library.
                </>
              ) : deleteModal.type === "batch" ? (
                <>
                  Are you sure you want to permanently delete all{" "}
                  <strong className="font-bold text-red-700">{deleteModal.barcodeOrTitle}</strong>?
                  This action will remove these copies and their accession records from the library.
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete title{" "}
                  <strong className="text-slate-900">"{deleteModal.barcodeOrTitle}"</strong> and ALL
                  its associated physical copies?
                </>
              )}
            </p>
            <div className="rounded-md bg-red-50 p-2.5 text-[11px] text-red-800 border border-red-200">
              Note: Books that are currently issued or checked out cannot be deleted.
            </div>

            <div className="flex justify-end space-x-3 border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setDeleteModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleConfirmDelete}
                isLoading={isSubmittingDelete}
              >
                Yes, Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
