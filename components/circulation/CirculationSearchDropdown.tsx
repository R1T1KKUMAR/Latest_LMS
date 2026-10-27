"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CirculationBookSearchResult,
  CirculationPatronSearchResult,
} from "@/services/circulation";

interface BaseProps {
  label: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
}

interface PatronDropdownProps extends BaseProps {
  type: "patron";
  hasActiveLoans?: boolean;
  patronType?: string;
  institutionId?: number | null;
  courseId?: number | null;
  departmentId?: number | null;
  selectedPatron: CirculationPatronSearchResult | null;
  onSelect: (patron: CirculationPatronSearchResult) => void;
  onClear: () => void;
}

interface BookDropdownProps extends BaseProps {
  type: "book";
  status?: "AVAILABLE" | "ISSUED" | "ALL";
  patronId?: number;
  departmentId?: number | null;
  institutionId?: number | null;
  selectedBook: CirculationBookSearchResult | null;
  onSelect: (book: CirculationBookSearchResult) => void;
  onClear: () => void;
}

export type CirculationSearchDropdownProps = PatronDropdownProps | BookDropdownProps;

export function CirculationSearchDropdown(props: CirculationSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [items, setItems] = useState<
    Array<CirculationPatronSearchResult | CirculationBookSearchResult>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isPatron = props.type === "patron";
  const selectedItem = isPatron ? props.selectedPatron : props.selectedBook;

  const patronId = !isPatron ? (props as BookDropdownProps).patronId : undefined;
  const hasActiveLoans = isPatron ? (props as PatronDropdownProps).hasActiveLoans : undefined;
  const status = !isPatron ? (props as BookDropdownProps).status : undefined;
  const patronType = isPatron ? (props as PatronDropdownProps).patronType : undefined;
  const institutionId = isPatron
    ? (props as PatronDropdownProps).institutionId
    : (props as BookDropdownProps).institutionId;
  const courseId = isPatron ? (props as PatronDropdownProps).courseId : undefined;
  const departmentId = isPatron
    ? (props as PatronDropdownProps).departmentId
    : (props as BookDropdownProps).departmentId;

  // Fetch items from API
  const fetchItems = useCallback(
    async (query = "") => {
      setIsLoading(true);
      try {
        if (isPatron) {
          const url = new URL("/api/circulation/search-patrons", window.location.origin);
          if (query.trim()) url.searchParams.set("query", query.trim());
          if (hasActiveLoans) url.searchParams.set("hasActiveLoans", "true");
          if (patronType && patronType !== "ALL") url.searchParams.set("patronType", patronType);
          if (institutionId) url.searchParams.set("institutionId", String(institutionId));
          if (courseId) url.searchParams.set("courseId", String(courseId));
          if (departmentId) url.searchParams.set("departmentId", String(departmentId));
          url.searchParams.set("limit", "50");

          const res = await fetch(url.toString());
          const data = await res.json();
          if (data.success && Array.isArray(data.patrons)) {
            setItems(data.patrons);
          }
        } else {
          const url = new URL("/api/circulation/search-books", window.location.origin);
          if (query.trim()) url.searchParams.set("query", query.trim());
          if (status) url.searchParams.set("status", status);
          if (patronId) url.searchParams.set("patronId", String(patronId));
          if (departmentId) url.searchParams.set("departmentId", String(departmentId));
          if (institutionId) url.searchParams.set("institutionId", String(institutionId));
          url.searchParams.set("limit", "50");

          const res = await fetch(url.toString());
          const data = await res.json();
          if (data.success && Array.isArray(data.books)) {
            setItems(data.books);
          }
        }
      } catch {
        // Keep previous list on error
      } finally {
        setIsLoading(false);
      }
    },
    [isPatron, hasActiveLoans, status, patronId, patronType, institutionId, courseId, departmentId],
  );

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Re-fetch when dropdown opens or filter changes
  useEffect(() => {
    if (isOpen) {
      fetchItems(searchTerm);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, fetchItems, searchTerm]);

  // Handle search input changes with debounce
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchItems(value);
    }, 250);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      <div className="flex items-center justify-between">
        <span className="block text-xs font-semibold text-slate-700">{props.label}</span>
        {selectedItem && (
          <button
            type="button"
            onClick={props.onClear}
            className="text-[11px] font-medium text-slate-400 hover:text-red-600 transition flex items-center space-x-1"
          >
            <span>Clear</span>
            <span>&times;</span>
          </button>
        )}
      </div>

      {/* Selected Item Trigger Display */}
      {selectedItem ? (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => {
            if (!props.disabled) setIsOpen(!isOpen);
          }}
          className={`flex w-full text-left items-center justify-between rounded-md border p-2.5 text-xs bg-slate-50 border-slate-300 hover:border-blue-900 cursor-pointer transition ${
            props.disabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          {isPatron
            ? // Selected Patron Preview
              (() => {
                const p = selectedItem as CirculationPatronSearchResult;
                return (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 truncate">{p.fullName}</span>
                      <span className="font-mono text-[11px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold">
                        {p.cardNo}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          p.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {p.categoryName}
                      {p.departmentName ? ` • ${p.departmentName}` : ""}
                      {p.courseName ? ` (${p.courseName})` : ""}
                      {" • "}
                      <strong className="text-slate-700">
                        {p.activeLoansCount} active loan(s)
                      </strong>
                    </p>
                  </div>
                );
              })()
            : // Selected Book Preview
              (() => {
                const b = selectedItem as CirculationBookSearchResult;
                return (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 truncate">{b.title}</span>
                      <span className="font-mono text-[11px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold">
                        {b.accessionNo}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          b.status === "AVAILABLE"
                            ? "bg-emerald-100 text-emerald-800"
                            : b.status === "ISSUED"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {b.status}
                      </span>
                      {b.isOverdue && (
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.2 rounded text-[10px] font-bold">
                          ⚠️ Overdue ({b.daysOverdue}d)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {b.authors}
                      {b.patronName ? ` • Borrowed by: ${b.patronName} (${b.patronCard})` : ""}
                      {b.dueDate ? ` • Due: ${b.dueDate}` : ""}
                      {b.location ? ` • Shelf: ${b.location}` : ""}
                    </p>
                  </div>
                );
              })()}
          <span className="ml-2 text-slate-400 text-xs">▾</span>
        </button>
      ) : (
        // Closed Empty Trigger Button
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-xs text-slate-500 shadow-2xs hover:border-blue-900 hover:text-slate-700 transition ${
            props.disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : ""
          }`}
        >
          <span className="truncate">
            {props.placeholder ||
              (isPatron ? "Click to search/select patron..." : "Click to search/select book...")}
          </span>
          <span className="text-slate-400 text-xs">▾</span>
        </button>
      )}

      {props.helperText && !isOpen && (
        <p className="text-[11px] text-slate-500">{props.helperText}</p>
      )}

      {/* Dropdown Floating Search Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-0 sm:min-w-[340px] max-w-lg rounded-xl border border-slate-200 bg-white p-2 shadow-2xl space-y-2 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box Inside Dropdown */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={
                isPatron
                  ? "Type patron name to search..."
                  : "Type book title or author to search..."
              }
              className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-1.5 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:bg-white focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Header count / status */}
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400 border-b border-slate-100 pb-1">
            <span>
              {isLoading ? "Searching live database..." : `${items.length} result(s) available`}
            </span>
            <span className="text-[10px] text-slate-400">Esc to close</span>
          </div>

          {/* Items List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-md">
            {isLoading && items.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-1">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-900 border-t-transparent" />
                <span>Searching {isPatron ? "patrons" : "catalogue"}...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No {isPatron ? "patrons" : "books"} found matching &ldquo;{searchTerm}&rdquo;
              </div>
            ) : (
              items.map((item) => {
                if (isPatron) {
                  const p = item as CirculationPatronSearchResult;
                  const isSelected =
                    (selectedItem as CirculationPatronSearchResult | null)?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        (props as PatronDropdownProps).onSelect(p);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded transition hover:bg-blue-50/80 flex flex-col space-y-0.5 ${
                        isSelected ? "bg-blue-50 border-l-2 border-blue-900" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">{p.fullName}</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 rounded">
                            {p.cardNo}
                          </span>
                          <span
                            className={`px-1 rounded text-[9px] font-bold ${
                              p.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">
                          {p.categoryName}
                          {p.departmentName ? ` • ${p.departmentName}` : ""}
                        </span>
                        <span
                          className={`font-semibold text-[10px] whitespace-nowrap ml-2 ${
                            p.overdueLoansCount > 0 ? "text-red-600 font-bold" : "text-slate-600"
                          }`}
                        >
                          {p.activeLoansCount} issued
                          {p.overdueLoansCount > 0 ? ` (${p.overdueLoansCount} overdue)` : ""}
                        </span>
                      </div>
                    </button>
                  );
                } else {
                  const b = item as CirculationBookSearchResult;
                  const isSelected =
                    !isPatron && (selectedItem as CirculationBookSearchResult)?.itemId === b.itemId;
                  return (
                    <button
                      key={b.itemId}
                      type="button"
                      onClick={() => {
                        (props as BookDropdownProps).onSelect(b);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded transition hover:bg-blue-50/80 flex flex-col space-y-0.5 ${
                        isSelected ? "bg-blue-50 border-l-2 border-blue-900" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs truncate max-w-[280px]">
                          {b.title}
                        </span>
                        <div className="flex items-center space-x-1 ml-2">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 rounded font-semibold">
                            {b.accessionNo}
                          </span>
                          <span
                            className={`px-1 rounded text-[9px] font-bold ${
                              b.status === "AVAILABLE"
                                ? "bg-emerald-100 text-emerald-800"
                                : b.status === "ISSUED"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate text-slate-600">{b.authors}</span>
                        {b.callNumber && (
                          <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap ml-2">
                            {b.callNumber}
                          </span>
                        )}
                      </div>

                      {/* Return Mode info: Borrower & Due date */}
                      {b.patronName && (
                        <div className="flex items-center justify-between text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 mt-0.5">
                          <span className="text-slate-600">
                            Borrower: <strong>{b.patronName}</strong> ({b.patronCard})
                          </span>
                          {b.isOverdue ? (
                            <span className="text-red-700 font-bold">
                              ⚠️ Overdue ({b.daysOverdue}d late)
                            </span>
                          ) : (
                            <span className="text-slate-500">Due: {b.dueDate}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                }
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
