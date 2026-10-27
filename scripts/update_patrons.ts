import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Checking institutions...");
  const insts = await db.select().from(schema.institutions);
  console.log(
    "Institutions:",
    insts.map((i) => ({ id: i.id, code: i.code, name: i.name })),
  );

  console.log("Checking courses...");
  const existingCourses = await db.select().from(schema.courses);

  // Ensure Diploma / Polytechnic, D.Pharm, GNM, B.Ed exist
  const coursesToAdd = [
    {
      institutionId: 1, // RBCET
      code: "DIPLOMA-ENG",
      name: "Diploma in Engineering (Polytechnic)",
      durationYears: 3,
    },
    {
      institutionId: 3, // RBCP
      code: "DPHARM",
      name: "Diploma in Pharmacy (D.Pharm)",
      durationYears: 2,
    },
    {
      institutionId: 4, // RBCN
      code: "GNM",
      name: "General Nursing & Midwifery (GNM)",
      durationYears: 3,
    },
    {
      institutionId: 5, // RBTTI / TECH
      code: "BED",
      name: "Bachelor of Education (B.Ed)",
      durationYears: 2,
    },
  ];

  for (const c of coursesToAdd) {
    const found = existingCourses.find((ec) => ec.code === c.code);
    if (!found) {
      console.log(`Adding course ${c.code} (${c.name})...`);
      await db.insert(schema.courses).values(c);
    }
  }

  const allCourses = await db.select().from(schema.courses);
  console.log(
    "All Courses:",
    allCourses.map((c) => ({ id: c.id, inst: c.institutionId, code: c.code, name: c.name })),
  );

  // Check departments
  const depts = await db.select().from(schema.departments);

  // Ensure Polytechnic department exists under inst 1 if needed
  const polyDept = depts.find((d) => d.code === "POLY");
  if (!polyDept) {
    console.log("Adding Polytechnic department...");
    await db.insert(schema.departments).values({
      institutionId: 1,
      code: "POLY",
      name: "Diploma / Polytechnic Studies",
      isActive: true,
    });
  }

  const updatedDepts = await db.select().from(schema.departments);

  // Let's get course IDs
  const cBtechCs = allCourses.find((c) => c.code === "BTECH-CS")?.id ?? 1;
  const cBtechMe = allCourses.find((c) => c.code === "BTECH-ME")?.id ?? 2;
  const cBtechEe = allCourses.find((c) => c.code === "BTECH-EE")?.id ?? 4;
  const cDiploma = allCourses.find((c) => c.code === "DIPLOMA-ENG")?.id ?? 12;
  const cBpharm = allCourses.find((c) => c.code === "BPHARM")?.id ?? 10;
  const cDpharm = allCourses.find((c) => c.code === "DPHARM")?.id ?? 13;
  const cBscNurs = allCourses.find((c) => c.code === "BSC-NURS")?.id ?? 11;
  const cGnm = allCourses.find((c) => c.code === "GNM")?.id ?? 14;
  const cMba = allCourses.find((c) => c.code === "MBA")?.id ?? 6;
  const cBba = allCourses.find((c) => c.code === "BBA")?.id ?? 7;
  const cBca = allCourses.find((c) => c.code === "BCA")?.id ?? 9;

  const dCse = updatedDepts.find((d) => d.code === "CSE")?.id ?? 1;
  const dMe = updatedDepts.find((d) => d.code === "ME")?.id ?? 3;
  const dEe = updatedDepts.find((d) => d.code === "EE")?.id ?? 6;
  const dPharm = updatedDepts.find((d) => d.code === "PHARM")?.id ?? 11;
  const dNurs = updatedDepts.find((d) => d.code === "NURS")?.id ?? 12;
  const dMba = updatedDepts.find((d) => d.code === "MBA")?.id ?? 7;
  const dBba = updatedDepts.find((d) => d.code === "BBA")?.id ?? 8;
  const dBca = updatedDepts.find((d) => d.code === "BCA")?.id ?? 10;
  const dPoly = updatedDepts.find((d) => d.code === "POLY")?.id ?? 1;

  // Categorize students
  const studentUpdates = [
    // RBCET B.Tech
    { id: 1, inst: 1, course: cBtechCs, dept: dCse, year: 2, sem: 4 }, // Rahul Kumar
    { id: 2, inst: 1, course: cBtechCs, dept: dCse, year: 2, sem: 4 }, // Priya Sharma
    { id: 3, inst: 1, course: cBtechCs, dept: dCse, year: 3, sem: 6 }, // Neha Gupta
    { id: 5, inst: 1, course: cBtechMe, dept: dMe, year: 1, sem: 2 }, // Aradhya Saxena
    { id: 6, inst: 1, course: cBtechEe, dept: dEe, year: 1, sem: 2 }, // Akanksha Raghav
    // RBCET Diploma / Polytechnic
    { id: 7, inst: 1, course: cDiploma, dept: dPoly, year: 1, sem: 1 }, // Arifa Tahir
    { id: 8, inst: 1, course: cDiploma, dept: dPoly, year: 2, sem: 3 }, // Amit Kumar
    { id: 9, inst: 1, course: cDiploma, dept: dPoly, year: 2, sem: 3 }, // Aman Verma
    { id: 10, inst: 1, course: cDiploma, dept: dPoly, year: 1, sem: 2 }, // Ankul
    // RBCP (Pharmacy: B.Pharm & D.Pharm)
    { id: 11, inst: 3, course: cBpharm, dept: dPharm, year: 2, sem: 4 }, // Hotey Lal
    { id: 12, inst: 3, course: cDpharm, dept: dPharm, year: 1, sem: 2 }, // Suryansh Sharma
    { id: 13, inst: 3, course: cBpharm, dept: dPharm, year: 1, sem: 2 }, // Sudhanshu Mathur
    // RBCN (Nursing: B.Sc Nursing & GNM)
    { id: 14, inst: 4, course: cBscNurs, dept: dNurs, year: 2, sem: 3 }, // Prashant Gangwar
    { id: 15, inst: 4, course: cGnm, dept: dNurs, year: 1, sem: 1 }, // Krishna Jaiswal
    { id: 16, inst: 4, course: cBscNurs, dept: dNurs, year: 1, sem: 2 }, // Jai Gangwar
    // RBMI (Management: MBA & BBA)
    { id: 17, inst: 2, course: cMba, dept: dMba, year: 1, sem: 2 }, // Abhay Patel
    { id: 18, inst: 2, course: cBba, dept: dBba, year: 2, sem: 3 }, // Pranjal Singh
    // RBMI-TECH / RBTTI (BCA)
    { id: 19, inst: 5, course: cBca, dept: dBca, year: 1, sem: 2 }, // Shrishti Raghav
  ];

  for (const su of studentUpdates) {
    console.log(`Updating patron #${su.id}...`);
    await db
      .update(schema.patrons)
      .set({
        institutionId: su.inst,
        courseId: su.course,
        departmentId: su.dept,
        academicYear: su.year,
        semester: su.sem,
      })
      .where(eq(schema.patrons.id, su.id));
  }

  console.log("Finished updating patron categorizations successfully!");
}

run()
  .catch(console.error)
  .then(() => process.exit(0));
