import type React from "react";
import { type BreadcrumbItem, Breadcrumbs } from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  badgeColor?: "blue" | "purple" | "emerald" | "amber" | "indigo";
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

const badgeColorStyles = {
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  indigo: "bg-indigo-100 text-indigo-800",
};

export function PageHeader({
  title,
  description,
  badge,
  badgeColor = "blue",
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 border-b border-slate-200 pb-5">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {badge && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${badgeColorStyles[badgeColor]}`}
              >
                {badge}
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>

        {actions && <div className="flex items-center space-x-3">{actions}</div>}
      </div>
    </div>
  );
}
