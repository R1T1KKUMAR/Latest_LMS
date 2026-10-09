import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-500 mb-3">
      <Link href="/dashboard" className="hover:text-slate-800 transition">
        Staff Home
      </Link>
      {items.map((item, idx) => (
        <span key={item.label} className="flex items-center">
          <span className="mx-2 text-slate-400">/</span>
          {item.href && idx < items.length - 1 ? (
            <Link href={item.href} className="hover:text-slate-800 transition">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
