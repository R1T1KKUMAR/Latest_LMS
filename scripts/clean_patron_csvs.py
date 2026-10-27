import glob
import os
import csv
import re
from datetime import datetime

def parse_date(val):
    if not val:
        return ""
    val = val.replace(" 00:00:00", "").strip()
    if not val:
        return ""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(val, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass
    return val

def clean_phone(val):
    if not val:
        return ""
    val = re.sub(r"\.0+$", "", str(val).strip())
    val = re.sub(r"\D", "", val)
    if len(val) == 12 and val.startswith("91"):
        val = val[2:]
    elif len(val) == 11 and val.startswith("0"):
        val = val[1:]
    return val

def main():
    patron_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../patron_data"))
    csv_files = sorted(glob.glob(os.path.join(patron_dir, "*.csv")))

    output_headers = [
        "name",
        "card_no",
        "gender",
        "dob",
        "institute",
        "course",
        "department",
        "year",
        "semester",
        "admission_date",
        "mobile",
        "email",
    ]

    total_files = 0
    total_rows = 0

    for file_path in csv_files:
        rows_to_write = []
        with open(file_path, "r", encoding="utf-8-sig") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                name = row.get("name", "").strip()
                card_no = row.get("card_no", "").strip()
                if not card_no and row.get("roll_no"):
                    card_no = row.get("roll_no", "").strip()

                gender = row.get("gender", "").strip().upper()
                if gender.startswith("M"):
                    gender = "M"
                elif gender.startswith("F"):
                    gender = "F"
                elif gender:
                    gender = "O"

                dob = parse_date(row.get("dob", ""))
                institute = row.get("institute", "").strip()
                course = row.get("course", "").strip()
                
                # Check branch / department
                dept = row.get("department", "").strip() or row.get("branch", "").strip()

                year = row.get("year", "").strip()
                if year and year.endswith(".0"):
                    year = year[:-2]

                semester = row.get("semester", "").strip()
                if semester and semester.endswith(".0"):
                    semester = semester[:-2]

                adm_date = parse_date(row.get("admission_date", ""))
                mobile = clean_phone(row.get("mobile", ""))
                email = row.get("email", "").strip().lower()

                rows_to_write.append({
                    "name": name,
                    "card_no": card_no,
                    "gender": gender,
                    "dob": dob,
                    "institute": institute,
                    "course": course,
                    "department": dept,
                    "year": year,
                    "semester": semester,
                    "admission_date": adm_date,
                    "mobile": mobile,
                    "email": email,
                })

        with open(file_path, "w", encoding="utf-8-sig", newline="") as fp:
            writer = csv.DictWriter(fp, fieldnames=output_headers)
            writer.writeheader()
            writer.writerows(rows_to_write)

        total_files += 1
        total_rows += len(rows_to_write)
        print(f"Processed: {os.path.basename(file_path)} ({len(rows_to_write)} rows)")

    print(f"\nDone! Cleaned {total_files} files, total {total_rows} student records.")

if __name__ == "__main__":
    main()
