import type React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  icon?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon = "📄",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">{description}</p>
      {action && (
        <div className="mt-6">
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center rounded-md bg-blue-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition"
            >
              {action.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-md bg-blue-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
