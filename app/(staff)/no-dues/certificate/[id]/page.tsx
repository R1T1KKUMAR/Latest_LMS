import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { getNoDuesCertificateDetails } from "@/services/nodues";
import { PrintCertificateButton } from "./PrintCertificateButton";

interface CertificatePageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "No-Dues Clearance Certificate — RBMI LMS",
  description: "Official printable No-Dues clearance certificate",
};

export default async function NoDuesCertificatePage({ params }: CertificatePageProps) {
  const auth = await requirePageAuth(["NODUES_ISSUE", "REPORT_VIEW", "PATRON_VIEW"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-red-600">Access Denied</h1>
        <p className="text-sm text-slate-600 mt-2">
          Permission required to view or print No-Dues clearance certificates.
        </p>
      </div>
    );
  }

  const { id } = await params;
  const certificate = await getNoDuesCertificateDetails(id);

  if (!certificate) {
    notFound();
  }

  const { patron } = certificate;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="mx-auto max-w-3xl bg-white p-10 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-6 print:max-w-none">
        {/* Actions Bar (Hidden when printing) */}
        <div className="mb-6 flex justify-between items-center print:hidden border-b pb-4">
          <Link
            href="/no-dues"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            &larr; Back to No-Dues Clearance Desk
          </Link>
          <div className="flex gap-2">
            <PrintCertificateButton />
          </div>
        </div>

        {/* Certificate Border Wrap */}
        <div className="border-4 border-double border-slate-700 p-8 rounded-lg relative">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-800 pb-5">
            <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">
              {certificate.institutionName}
            </h1>
            <h2 className="text-lg font-bold text-blue-900 mt-1">{certificate.libraryName}</h2>
            <div className="mt-4 inline-block rounded-md border-2 border-slate-800 bg-slate-100 px-5 py-1.5 text-sm font-extrabold uppercase tracking-widest text-slate-900">
              Official No-Dues Clearance Certificate
            </div>
          </div>

          {/* Certificate Metadata */}
          <div className="mt-6 flex justify-between items-center text-xs border-b border-slate-200 pb-4">
            <div>
              <span className="text-slate-500 font-medium">Certificate Ref:</span>
              <span className="ml-2 font-mono font-bold text-slate-900">
                {certificate.certificateNo}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Academic Session:</span>
              <span className="ml-2 font-bold text-slate-900">{certificate.academicSession}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Date of Issue:</span>
              <span className="ml-2 font-bold text-slate-900">{certificate.issueDate}</span>
            </div>
          </div>

          {/* Patron Identification Details */}
          <div className="mt-6 rounded-md bg-slate-50 border border-slate-200 p-4 text-xs">
            <h3 className="font-bold uppercase tracking-wider text-slate-700 mb-3 text-[11px]">
              Patron Particulars
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-600">Full Name:</span>
                <span className="font-bold text-slate-900">{patron.fullName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-600">Library Card No:</span>
                <span className="font-mono font-bold text-blue-950">{patron.cardNo}</span>
              </div>
              {patron.employeeId && (
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600">Employee ID:</span>
                  <span className="font-mono font-bold text-slate-900">{patron.employeeId}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-600">Patron Category:</span>
                <span className="font-semibold text-slate-900">{patron.categoryName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-600">Department:</span>
                <span className="font-semibold text-slate-900">{patron.departmentName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-600">Course / Programme:</span>
                <span className="font-semibold text-slate-900">{patron.courseName}</span>
              </div>
            </div>
          </div>

          {/* Formal Certification Statement */}
          <div className="my-8 text-sm leading-relaxed text-slate-800 text-justify px-2">
            <p>
              This is to certify that{" "}
              <strong className="text-slate-950 font-bold">{patron.fullName}</strong>, bearing
              Library Card Number{" "}
              <strong className="text-slate-950 font-mono">{patron.cardNo}</strong>
              {patron.employeeId && (
                <>
                  {" "}and Employee ID{" "}
                  <strong className="text-slate-950 font-mono">{patron.employeeId}</strong>
                </>
              )}
              , has returned all issued library books, reference materials, journals, and equipment
              to the <strong className="text-slate-950">{certificate.libraryName}</strong>.
            </p>
            <p className="mt-3">
              All overdue fines, damage charges, and replacement penalties have been fully paid or
              accounted for. There are{" "}
              <strong className="text-emerald-800 uppercase font-bold">
                NIL pending dues or liabilities
              </strong>{" "}
              outstanding against the patron. The library borrowing account has been verified and
              marked as{" "}
              <span className="inline-block px-2 py-0.5 font-bold uppercase rounded bg-slate-200 text-slate-900 text-xs">
                {patron.status}
              </span>
              .
            </p>
          </div>

          {/* Verification Status Matrix */}
          <div className="mb-10 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="border border-slate-300 rounded p-2 bg-slate-50">
              <span className="text-slate-500 block">Pending Issued Books</span>
              <span className="text-base font-bold text-emerald-700">0 (NIL)</span>
            </div>
            <div className="border border-slate-300 rounded p-2 bg-slate-50">
              <span className="text-slate-500 block">Outstanding Fines</span>
              <span className="text-base font-bold text-emerald-700">₹0.00 (NIL)</span>
            </div>
            <div className="border border-slate-300 rounded p-2 bg-slate-50">
              <span className="text-slate-500 block">Account Status</span>
              <span className="text-base font-bold text-blue-900">{patron.status}</span>
            </div>
          </div>

          {/* Signatures & Seal */}
          <div className="mt-14 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
            <div className="text-left">
              <div className="h-12 flex items-end">
                <span className="font-semibold text-slate-800">{certificate.issuedByName}</span>
              </div>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">
                Verified &amp; Issued By (Library Staff)
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Authorized via RBMI LMS Clearance Terminal
              </div>
            </div>

            <div className="text-right">
              <div className="h-12 flex items-end justify-end">
                <span className="font-semibold text-slate-800">Head Librarian</span>
              </div>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">
                Librarian-in-Charge / Official Seal
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Central Library, RBMI Group of Institutions
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="mt-8 text-center text-[10px] text-slate-400 print:text-[8px] border-t border-slate-200 pt-3">
            Computer-generated clearance certificate issued under the authority of RBMI Central
            Library. Valid for institute graduation, transfer, or departure clearances.
          </div>
        </div>
      </div>
    </div>
  );
}
