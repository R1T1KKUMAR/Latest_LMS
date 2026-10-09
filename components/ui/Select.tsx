import type React from "react";

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Option[];
  id: string;
}

export function Select({
  label,
  error,
  helperText,
  options,
  id,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        id={id}
        className={`w-full rounded-md border px-3 py-2 text-sm bg-white transition focus:outline-none focus:ring-1 ${
          error
            ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
            : "border-slate-300 text-slate-900 focus:border-blue-900 focus:ring-blue-900"
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}
