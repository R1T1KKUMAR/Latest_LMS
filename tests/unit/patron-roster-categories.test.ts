import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  COLLEGE_CONFIGS,
  resolveCollege,
  resolveCourseCategory,
} from "@/components/patrons/InstitutionalStudentRoster";
import { isBTechCourse, isDiplomaCourse } from "@/services/patron-import";

describe("Unit: Patron Roster Categorization & Resolution", () => {
  it("defines the exact official 5 colleges and their default programs", () => {
    expect(COLLEGE_CONFIGS.RBCET.fullName).toBe("RBMI College of Engineering and Technology");
    expect(COLLEGE_CONFIGS.RBCET.defaultCourses).toEqual(["B.Tech", "Diploma / Polytechnic"]);

    expect(COLLEGE_CONFIGS.RBCP.fullName).toBe("RBMI College of Pharmacy");
    expect(COLLEGE_CONFIGS.RBCP.defaultCourses).toEqual(["B.Pharm", "D.Pharm"]);

    expect(COLLEGE_CONFIGS.RBCN.fullName).toBe("RBMI College of Nursing");
    expect(COLLEGE_CONFIGS.RBCN.defaultCourses).toEqual(["B.Sc Nursing"]);

    expect(COLLEGE_CONFIGS.RBMI.fullName).toBe("RBMI Business School");
    expect(COLLEGE_CONFIGS.RBMI.defaultCourses).toEqual([
      "MBA",
      "BBA",
      "MCA",
      "BCA",
      "B.Sc",
      "B.Com",
    ]);

    expect(COLLEGE_CONFIGS.RBTTI.fullName).toBe("Rakshpal Bahadur Teachers Training Institute");
    expect(COLLEGE_CONFIGS.RBTTI.defaultCourses).toEqual(["B.Ed"]);
  });

  it("resolves course categories accurately across aliases", () => {
    // RBCET
    expect(resolveCourseCategory({ courseCode: "BTECH", courseName: "B.Tech Mechanical" })).toBe(
      "B.Tech",
    );
    expect(resolveCourseCategory({ courseCode: "DIPLOMA", courseName: "Diploma in Civil" })).toBe(
      "Diploma / Polytechnic",
    );
    expect(resolveCourseCategory({ departmentName: "Polytechnic" })).toBe("Diploma / Polytechnic");

    // RBCP
    expect(
      resolveCourseCategory({ courseCode: "BPHARM", courseName: "Bachelor of Pharmacy" }),
    ).toBe("B.Pharm");
    expect(resolveCourseCategory({ courseCode: "DPHARM", courseName: "Diploma in Pharmacy" })).toBe(
      "D.Pharm",
    );

    // RBCN
    expect(resolveCourseCategory({ courseCode: "BSCNURS", courseName: "B.Sc Nursing" })).toBe(
      "B.Sc Nursing",
    );

    // RBMI
    expect(resolveCourseCategory({ courseCode: "MBA", courseName: "Management Studies" })).toBe(
      "MBA",
    );
    expect(resolveCourseCategory({ courseCode: "BBA", courseName: "Business Admin" })).toBe("BBA");
    expect(resolveCourseCategory({ courseCode: "MCA", courseName: "Computer Applications" })).toBe(
      "MCA",
    );
    expect(resolveCourseCategory({ courseCode: "BCA", courseName: "Computer Applications" })).toBe(
      "BCA",
    );
    expect(resolveCourseCategory({ courseCode: "BSC", courseName: "Bachelor of Science" })).toBe(
      "B.Sc",
    );
    expect(resolveCourseCategory({ courseCode: "BCOM", courseName: "Bachelor of Commerce" })).toBe(
      "B.Com",
    );

    // RBTTI
    expect(resolveCourseCategory({ courseCode: "BED", courseName: "Bachelor of Education" })).toBe(
      "B.Ed",
    );
  });

  it("resolves patron college from institutional metadata and course/department cues", () => {
    // Explicit institution code
    expect(resolveCollege({ institutionCode: "RBCET" }).code).toBe("RBCET");
    expect(resolveCollege({ institutionCode: "RBCP" }).code).toBe("RBCP");
    expect(resolveCollege({ institutionCode: "RBCN" }).code).toBe("RBCN");
    expect(resolveCollege({ institutionCode: "RBMI" }).code).toBe("RBMI");
    expect(resolveCollege({ institutionCode: "RBTTI" }).code).toBe("RBTTI");

    // Inferred from courses
    expect(resolveCollege({ courseName: "Bachelor of Education" }).code).toBe("RBTTI");
    expect(resolveCollege({ courseCode: "BED" }).code).toBe("RBTTI");
    expect(resolveCollege({ courseCode: "BCA" }).code).toBe("RBMI");
    expect(resolveCollege({ courseCode: "MCA" }).code).toBe("RBMI");
    expect(resolveCollege({ courseCode: "BCOM" }).code).toBe("RBMI");
    expect(resolveCollege({ courseCode: "BSC" }).code).toBe("RBMI");
    expect(resolveCollege({ courseCode: "DPHARM" }).code).toBe("RBCP");
    expect(resolveCollege({ courseCode: "BPHARM" }).code).toBe("RBCP");
    expect(resolveCollege({ courseCode: "BSCNURS" }).code).toBe("RBCN");
    expect(resolveCollege({ courseCode: "DIPLOMA" }).code).toBe("RBCET");
    expect(resolveCollege({ courseCode: "BTECH" }).code).toBe("RBCET");
  });

  it("checks isBTechCourse and isDiplomaCourse helpers", () => {
    expect(isBTechCourse("B.Tech")).toBe(true);
    expect(isBTechCourse("btech")).toBe(true);
    expect(isBTechCourse("BTech-CS")).toBe(true);
    expect(isBTechCourse("Bachelor of Technology")).toBe(true);
    expect(isBTechCourse("BCA")).toBe(false);

    expect(isDiplomaCourse("Diploma")).toBe(true);
    expect(isDiplomaCourse("Polytechnic")).toBe(true);
    expect(isDiplomaCourse("Diploma in Engineering")).toBe(true);
    expect(isDiplomaCourse("B.Tech")).toBe(false);
  });

  describe("Patron Bulk Import: Single 'name' column & name splitting", () => {
    const mockDb: any = {
      select: () => ({
        from: (table: any) => {
          // Identify table by mock presence or default return
          return Promise.resolve([
            { id: 1, code: "BTECH", name: "B.Tech Student", patronType: "STUDENT" },
            { id: 2, code: "FACULTY", name: "Faculty Member", patronType: "FACULTY" },
          ]);
        },
      }),
    };

    it("parses single 'name' column into first, middle, and last name", async () => {
      const { validatePatronCsv } = await import("@/services/patron-import");
      const csv = [
        "roll_no,name,category,gender,dob",
        "250101,Rohan Sharma,BTECH,M,15-08-2004",
      ].join("\n");

      const preview = await validatePatronCsv(Buffer.from(csv), "STUDENT", {}, mockDb);
      expect(preview.summary.totalRows).toBe(1);
      expect(preview.summary.errorCount).toBe(0);
      expect(preview.rows[0].status).toBe("OK");
      expect(preview.rows[0].data?.name).toBe("Rohan Sharma");
      expect(preview.rows[0].data?.firstName).toBe("Rohan");
      expect(preview.rows[0].data?.lastName).toBe("Sharma");
    });

    it("handles 3-part name into firstName, middleName, lastName", async () => {
      const { validatePatronCsv } = await import("@/services/patron-import");
      const csv = [
        "employee_id,name,category,gender,dob",
        "EMP999,Dr Priya Verma,FACULTY,F,10-10-1985",
      ].join("\n");

      const preview = await validatePatronCsv(Buffer.from(csv), "FACULTY", {}, mockDb);
      expect(preview.summary.errorCount).toBe(0);
      expect(preview.rows[0].data?.name).toBe("Dr Priya Verma");
      expect(preview.rows[0].data?.firstName).toBe("Dr");
      expect(preview.rows[0].data?.middleName).toBe("Priya");
      expect(preview.rows[0].data?.lastName).toBe("Verma");
    });

    it("maintains backward compatibility with legacy first_name and last_name", async () => {
      const { validatePatronCsv } = await import("@/services/patron-import");
      const csv = [
        "roll_no,first_name,last_name,category,gender,dob",
        "250102,Amit,Kumar,BTECH,M,20-05-2003",
      ].join("\n");

      const preview = await validatePatronCsv(Buffer.from(csv), "STUDENT", {}, mockDb);
      expect(preview.summary.errorCount).toBe(0);
      expect(preview.rows[0].data?.name).toBe("Amit Kumar");
      expect(preview.rows[0].data?.firstName).toBe("Amit");
      expect(preview.rows[0].data?.lastName).toBe("Kumar");
    });

    it("reports 'Missing required field: name' when neither name nor first_name is provided", async () => {
      const { validatePatronCsv } = await import("@/services/patron-import");
      const csv = ["roll_no,category,gender,dob", "250103,BTECH,M,20-05-2003"].join("\n");

      const preview = await validatePatronCsv(Buffer.from(csv), "STUDENT", {}, mockDb);
      expect(preview.summary.errorCount).toBe(1);
      expect(preview.rows[0].status).toBe("ERROR");
      expect(preview.rows[0].messages).toContain("Missing required field: name");
    });
  });
});
