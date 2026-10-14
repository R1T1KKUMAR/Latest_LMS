import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { getReceiptDetails } from "@/services/fines";
import { PrintButton } from "./PrintButton";

interface ReceiptPageProps {
  params: Promise<{ receiptNo: string }>;
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const auth = await requirePageAuth(["FINE_COLLECT", "FINE_WAIVE", "REPORT_VIEW"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-red-600">Access Denied</h1>
        <p className="text-sm text-slate-600 mt-2">
          Fine collection or report viewing permissions required to view receipts.
        </p>
      </div>
    );
  }

  const { receiptNo } = await params;
  const receipt = await getReceiptDetails(receiptNo);

  if (!receipt) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="mx-auto max-w-2xl bg-white p-8 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-4">
        {/* Actions Bar (Hidden when printing) */}
        <div className="mb-6 flex justify-between items-center print:hidden border-b pb-4">
          <Link
            href="/fines"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            &larr; Back to Fines Desk
          </Link>
          <div className="flex gap-2">
            <PrintButton />
          </div>
        </div>

        {/* Receipt Header */}
        <div className="text-center border-b pb-4">
          <h1 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">
            {receipt.institutionName}
          </h1>
          <h2 className="text-base font-bold text-blue-900">{receipt.libraryName}</h2>
          <div className="mt-2 inline-block rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
            Official Fine Payment Receipt
          </div>
        </div>

        {/* Receipt Metadata */}
        <div className="mt-6 grid grid-cols-2 gap-4 text-xs border-b pb-4">
          <div>
            <span className="text-slate-500">Receipt Number:</span>
            <div className="font-mono text-sm font-bold text-slate-900">{receipt.receiptNo}</div>
          </div>
          <div className="text-right">
            <span className="text-slate-500">Date &amp; Time:</span>
            <div className="font-semibold text-slate-900">
              {new Date(receipt.paymentDate).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })}
            </div>
          </div>
        </div>

        {/* Patron Info */}
        <div className="mt-4 border-b pb-4 text-xs">
          <h3 className="font-bold uppercase tracking-wider text-slate-600 mb-2">Patron Details</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Name: </span>
              <strong className="text-slate-900">{receipt.patron.name}</strong>
            </div>
            <div>
              <span className="text-slate-500">Card Number: </span>
              <strong className="font-mono text-slate-900">{receipt.patron.cardNo}</strong>
            </div>
            {receipt.patron.rollNo && (
              <div>
                <span className="text-slate-500">Roll No: </span>
                <span className="text-slate-800">{receipt.patron.rollNo}</span>
              </div>
            )}
            {receipt.patron.employeeId && (
              <div>
                <span className="text-slate-500">Emp ID: </span>
                <span className="text-slate-800">{receipt.patron.employeeId}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">Category: </span>
              <span className="text-slate-800">{receipt.patron.patronType}</span>
            </div>
            {receipt.patron.mobile && (
              <div>
                <span className="text-slate-500">Mobile: </span>
                <span className="text-slate-800">{receipt.patron.mobile}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Line Items */}
        <div className="mt-4 border-b pb-4 text-xs">
          <h3 className="font-bold uppercase tracking-wider text-slate-600 mb-2">
            Penalty Assessment &amp; Settlement
          </h3>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-1">Description / Reason</th>
                <th className="py-1 text-center">Type</th>
                <th className="py-1 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 text-slate-900 font-medium">
                  {receipt.fine.reason} (Fine #{receipt.fine.id})
                </td>
                <td className="py-2 text-center font-mono text-slate-700">
                  {receipt.fine.fineType}
                </td>
                <td className="py-2 text-right font-bold text-slate-900">
                  ₹{Number(receipt.amount).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="mt-4 border-b pb-4 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-600">Original Fine Assessed:</span>
            <span className="font-mono text-slate-800">
              ₹{Number(receipt.fine.originalAmount).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t">
            <span>
              {receipt.paymentMethod === "WAIVED" ? "Amount Waived:" : "Amount Received:"}
            </span>
            <span className="text-emerald-700">₹{Number(receipt.amount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-slate-600">Payment Method:</span>
            <span className="font-bold uppercase text-slate-800">{receipt.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Remaining Balance:</span>
            <span
              className={`font-bold font-mono ${
                Number(receipt.fine.remainingBalance) > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              ₹{Number(receipt.fine.remainingBalance).toFixed(2)}
            </span>
          </div>
          {receipt.remarks && (
            <div className="pt-2 text-[11px] text-slate-500 italic">Remarks: {receipt.remarks}</div>
          )}
        </div>

        {/* Signatures Footer */}
        <div className="mt-8 pt-4 grid grid-cols-2 gap-8 text-xs text-center">
          <div className="border-t border-dashed pt-2">
            <div className="text-slate-500">Patron Signature</div>
          </div>
          <div className="border-t border-dashed pt-2">
            <div className="font-semibold text-slate-900">{receipt.receivedByName}</div>
            <div className="text-slate-500">Authorized Library Officer</div>
          </div>
        </div>

        {/* Legal / Institutional Footer */}
        <div className="mt-6 text-center text-[10px] text-slate-400 print:text-[8px]">
          Computer-generated receipt issued by RBMI Central Library Management System. Valid without
          official physical seal.
        </div>
      </div>
    </div>
  );
}
