import { NextResponse } from "next/server";
import { generateSampleCalendarCsv } from "@/services/holidays";

export async function GET() {
  const csv = generateSampleCalendarCsv();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="annual_holiday_calendar_template.csv"',
    },
  });
}
