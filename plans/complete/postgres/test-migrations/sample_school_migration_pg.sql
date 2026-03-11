-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_school;
SET search_path TO sample_school, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Table 1: Department
CREATE TABLE sample_school."Department" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Code" VARCHAR(10) NOT NULL,
 "BudgetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Description" TEXT NULL,
 "HeadOfDepartmentID" UUID NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Department PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Department_Code UNIQUE ("Code"),
 CONSTRAINT UQ_Department_Name UNIQUE ("Name"),
 CONSTRAINT CK_Department_Budget CHECK ("BudgetAmount" >= 0)
);

-- Table 2: Teacher
CREATE TABLE sample_school."Teacher" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "DepartmentID" UUID NOT NULL,
 "HireDate" DATE NOT NULL,
 "Salary" DECIMAL(10,2) NOT NULL,
 "IsFullTime" BOOLEAN NOT NULL DEFAULT TRUE,
 "SupervisorID" UUID NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Teacher PRIMARY KEY ("ID"),
 CONSTRAINT FK_Teacher_Department FOREIGN KEY ("DepartmentID") REFERENCES sample_school."Department"("ID"),
 CONSTRAINT FK_Teacher_Supervisor FOREIGN KEY ("SupervisorID") REFERENCES sample_school."Teacher"("ID"),
 CONSTRAINT UQ_Teacher_Email UNIQUE ("Email"),
 CONSTRAINT CK_Teacher_Salary CHECK ("Salary" > 0)
);

-- Table 3: Course
CREATE TABLE sample_school."Course" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "CourseCode" VARCHAR(15) NOT NULL,
 "Credits" SMALLINT NOT NULL DEFAULT 3,
 "DepartmentID" UUID NOT NULL,
 "TeacherID" UUID NULL,
 "MaxStudents" INTEGER NOT NULL DEFAULT 30,
 "IsElective" BOOLEAN NOT NULL DEFAULT FALSE,
 "Description" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Course PRIMARY KEY ("ID"),
 CONSTRAINT FK_Course_Department FOREIGN KEY ("DepartmentID") REFERENCES sample_school."Department"("ID"),
 CONSTRAINT FK_Course_Teacher FOREIGN KEY ("TeacherID") REFERENCES sample_school."Teacher"("ID"),
 CONSTRAINT UQ_Course_Code UNIQUE ("CourseCode"),
 CONSTRAINT CK_Course_Credits CHECK ("Credits" BETWEEN 1 AND 6),
 CONSTRAINT CK_Course_MaxStudents CHECK ("MaxStudents" BETWEEN 5 AND 200)
);

-- Table 4: Student
CREATE TABLE sample_school."Student" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "DateOfBirth" DATE NOT NULL,
 "EnrollmentDate" DATE NOT NULL,
 "GradeLevel" SMALLINT NOT NULL,
 "GPA" DECIMAL(3,2) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "EmergencyContact" VARCHAR(100) NULL,
 "EmergencyPhone" VARCHAR(20) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Student PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Student_Email UNIQUE ("Email"),
 CONSTRAINT CK_Student_GradeLevel CHECK ("GradeLevel" BETWEEN 1 AND 12),
 CONSTRAINT CK_Student_GPA CHECK ("GPA" BETWEEN 0.00 AND 4.00)
);

-- Table 5: Enrollment
CREATE TABLE sample_school."Enrollment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "StudentID" UUID NOT NULL,
 "CourseID" UUID NOT NULL,
 "EnrollmentDate" DATE NOT NULL,
 "Grade" DECIMAL(5,2) NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Enrollment PRIMARY KEY ("ID"),
 CONSTRAINT FK_Enrollment_Student FOREIGN KEY ("StudentID") REFERENCES sample_school."Student"("ID"),
 CONSTRAINT FK_Enrollment_Course FOREIGN KEY ("CourseID") REFERENCES sample_school."Course"("ID"),
 CONSTRAINT UQ_Enrollment_StudentCourse UNIQUE ("StudentID", "CourseID"),
 CONSTRAINT CK_Enrollment_Grade CHECK ("Grade" BETWEEN 0 AND 100),
 CONSTRAINT CK_Enrollment_Status CHECK ("Status" IN ('Active', 'Dropped', 'Completed', 'Withdrawn'))
);

-- Table 6: Assignment
CREATE TABLE sample_school."Assignment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CourseID" UUID NOT NULL,
 "Title" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DueDate" TIMESTAMPTZ NOT NULL,
 "MaxPoints" DECIMAL(6,2) NOT NULL DEFAULT 100,
 "Weight" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
 "IsExtraCredit" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Assignment PRIMARY KEY ("ID"),
 CONSTRAINT FK_Assignment_Course FOREIGN KEY ("CourseID") REFERENCES sample_school."Course"("ID"),
 CONSTRAINT CK_Assignment_MaxPoints CHECK ("MaxPoints" > 0),
 CONSTRAINT CK_Assignment_Weight CHECK ("Weight" BETWEEN 0.01 AND 10.00)
);

-- Table 7: Submission
CREATE TABLE sample_school."Submission" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AssignmentID" UUID NOT NULL,
 "StudentID" UUID NOT NULL,
 "SubmittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "PointsEarned" DECIMAL(6,2) NULL,
 "Feedback" TEXT NULL,
 "IsLate" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Submission PRIMARY KEY ("ID"),
 CONSTRAINT FK_Submission_Assignment FOREIGN KEY ("AssignmentID") REFERENCES sample_school."Assignment"("ID"),
 CONSTRAINT FK_Submission_Student FOREIGN KEY ("StudentID") REFERENCES sample_school."Student"("ID"),
 CONSTRAINT UQ_Submission_AssignmentStudent UNIQUE ("AssignmentID", "StudentID"),
 CONSTRAINT CK_Submission_Points CHECK ("PointsEarned" >= 0)
);

-- Table 8: Attendance
CREATE TABLE sample_school."Attendance" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "StudentID" UUID NOT NULL,
 "CourseID" UUID NOT NULL,
 "AttendanceDate" DATE NOT NULL,
 "AttendanceTime" TIME NULL,
 "Status" VARCHAR(15) NOT NULL DEFAULT 'Present',
 "Notes" VARCHAR(500) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Attendance PRIMARY KEY ("ID"),
 CONSTRAINT FK_Attendance_Student FOREIGN KEY ("StudentID") REFERENCES sample_school."Student"("ID"),
 CONSTRAINT FK_Attendance_Course FOREIGN KEY ("CourseID") REFERENCES sample_school."Course"("ID"),
 CONSTRAINT CK_Attendance_Status CHECK ("Status" IN ('Present', 'Absent', 'Late', 'Excused'))
);

-- Filtered indexes
CREATE INDEX IF NOT EXISTS IX_Teacher_Active ON sample_school."Teacher"("DepartmentID") WHERE "IsFullTime" = 1;

CREATE INDEX IF NOT EXISTS IX_Student_Active ON sample_school."Student"("GradeLevel") WHERE "IsActive" = 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'SchoolReader') THEN
        CREATE ROLE "SchoolReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_school."vwStudentPerformance" AS SELECT
    s."ID" AS "StudentID",
    s."FirstName",
    s."LastName",
    s."GradeLevel",
    COUNT(e."ID") AS "TotalCourses",
    ROUND(AVG(e."Grade"), 2) AS "AverageGrade",
    SUM(CASE WHEN e."Status" = 'Completed' THEN 1 ELSE 0 END) AS "CompletedCourses",
    SUM(CASE WHEN e."Status" = 'Active' THEN 1 ELSE 0 END) AS "ActiveCourses",
    COALESCE(s."GPA", 0) AS "CurrentGPA",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - s."EnrollmentDate"::TIMESTAMPTZ)) AS "DaysEnrolled",
    CASE WHEN COALESCE(s."GPA", 0) >= 3.5 THEN 'Honor Roll' ELSE 'Regular' END AS "AcademicStatus"
FROM sample_school."Student" s
LEFT JOIN sample_school."Enrollment" e ON s."ID" = e."StudentID"
GROUP BY s."ID", s."FirstName", s."LastName", s."GradeLevel", s."GPA", s."EnrollmentDate";

CREATE OR REPLACE VIEW sample_school."vwCourseDashboard" AS SELECT
    c."ID" AS "CourseID",
    c."Name" AS "CourseName",
    c."CourseCode",
    c."Credits",
    d."Name" AS "DepartmentName",
    COALESCE(t."FirstName" || ' ' || t."LastName", 'Unassigned') AS "TeacherName",
    COUNT(e."ID") AS "EnrolledStudents",
    c."MaxStudents",
    c."MaxStudents" - COUNT(e."ID") AS "AvailableSeats",
    ROUND(AVG(CAST(e."Grade" AS DECIMAL(5,2))), 2) AS "AverageGrade",
    CASE WHEN COUNT(e."ID") >= c."MaxStudents" THEN 'Full' ELSE 'Open' END AS "CourseStatus"
FROM sample_school."Course" c
LEFT JOIN sample_school."Department" d ON c."DepartmentID" = d."ID"
LEFT JOIN sample_school."Teacher" t ON c."TeacherID" = t."ID"
LEFT JOIN sample_school."Enrollment" e ON c."ID" = e."CourseID" AND e."Status" = 'Active'
GROUP BY c."ID", c."Name", c."CourseCode", c."Credits", d."Name", t."FirstName", t."LastName", c."MaxStudents";

CREATE OR REPLACE VIEW sample_school."vwDepartmentOverview" AS SELECT
    d."ID" AS "DepartmentID",
    d."Name" AS "DepartmentName",
    d."BudgetAmount",
    COUNT(DISTINCT t."ID") AS "TeacherCount",
    COUNT(DISTINCT c."ID") AS "CourseCount",
    SUM(t."Salary") AS "TotalSalaryExpense",
    ROUND(AVG(t."Salary"), 2) AS "AverageSalary",
    COALESCE(SUM(CAST(CASE WHEN t."IsFullTime" = 1 THEN 1 ELSE 0 END AS INTEGER)), 0) AS "FullTimeTeachers",
    d."BudgetAmount" - COALESCE(SUM(t."Salary"), 0) AS "RemainingBudget",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear"
FROM sample_school."Department" d
LEFT JOIN sample_school."Teacher" t ON d."ID" = t."DepartmentID"
LEFT JOIN sample_school."Course" c ON d."ID" = c."DepartmentID"
GROUP BY d."ID", d."Name", d."BudgetAmount";

CREATE OR REPLACE VIEW sample_school."vwAttendanceReport" AS SELECT
    s."ID" AS "StudentID",
    s."FirstName" || ' ' || s."LastName" AS "StudentName",
    c."Name" AS "CourseName",
    COUNT(a."ID") AS "TotalRecords",
    SUM(CASE WHEN a."Status" = 'Present' THEN 1 ELSE 0 END) AS "PresentCount",
    SUM(CASE WHEN a."Status" = 'Absent' THEN 1 ELSE 0 END) AS "AbsentCount",
    SUM(CASE WHEN a."Status" = 'Late' THEN 1 ELSE 0 END) AS "LateCount",
    ROUND(
        CAST(SUM(CASE WHEN a."Status" = 'Present' THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        CASE WHEN COUNT(a."ID") = 0 THEN 1 ELSE COUNT(a."ID") END * 100,
    2) AS "AttendanceRate",
    EXTRACT(MONTH FROM NOW()) AS "ReportMonth",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear"
FROM sample_school."Student" s
LEFT JOIN sample_school."Attendance" a ON s."ID" = a."StudentID"
LEFT JOIN sample_school."Course" c ON a."CourseID" = c."ID"
GROUP BY s."ID", s."FirstName", s."LastName", c."Name"
HAVING COUNT(a."ID") > 0;


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- INSERT seed data
-- Departments
INSERT INTO sample_school."Department" ("ID", "Name", "Code", "BudgetAmount", "IsActive", "Description") VALUES
(gen_random_uuid(), 'Mathematics', 'MATH', 150000.00, 1, 'Mathematics and statistics department'),
(gen_random_uuid(), 'Science', 'SCI', 200000.00, 1, 'Natural and physical sciences'),
(gen_random_uuid(), 'English', 'ENG', 120000.00, 1, 'English language and literature'),
(gen_random_uuid(), 'History', 'HIST', 100000.00, 1, 'History and social studies'),
(gen_random_uuid(), 'Arts', 'ART', 80000.00, 1, 'Visual and performing arts');

-- Teachers
INSERT INTO sample_school."Teacher" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "HireDate", "Salary", "IsFullTime") VALUES
(gen_random_uuid(), 'Robert', 'Chen', 'robert.chen@school.edu', '555-0101', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'MATH'
LIMIT 1), '2018-08-15', 65000.00, 1),
(gen_random_uuid(), 'Maria', 'Santos', 'maria.santos@school.edu', '555-0102', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'SCI'
LIMIT 1), '2019-01-10', 68000.00, 1),
(gen_random_uuid(), 'James', 'Wilson', 'james.wilson@school.edu', '555-0103', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ENG'
LIMIT 1), '2020-08-20', 62000.00, 1),
(gen_random_uuid(), 'Sarah', 'Thompson', 'sarah.thompson@school.edu', '555-0104', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'HIST'
LIMIT 1), '2017-08-15', 70000.00, 1),
(gen_random_uuid(), 'David', 'Kim', 'david.kim@school.edu', '555-0105', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ART'
LIMIT 1), '2021-01-05', 58000.00, 1),
(gen_random_uuid(), 'Lisa', 'Brown', 'lisa.brown@school.edu', '555-0106', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'MATH'
LIMIT 1), '2022-08-20', 55000.00, 0),
(gen_random_uuid(), 'Michael', 'Davis', 'michael.davis@school.edu', '555-0107', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'SCI'
LIMIT 1), '2016-08-15', 72000.00, 1),
(gen_random_uuid(), 'Jennifer', 'Lee', 'jennifer.lee@school.edu', '555-0108', (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ENG'
LIMIT 1), '2023-01-10', 52000.00, 0);

-- Students
INSERT INTO sample_school."Student" ("ID", "FirstName", "LastName", "Email", "DateOfBirth", "EnrollmentDate", "GradeLevel", "GPA", "IsActive", "EmergencyContact", "EmergencyPhone") VALUES
(gen_random_uuid(), 'Alex', 'Johnson', 'alex.j@student.edu', '2008-03-15', '2022-09-01', 10, 3.75, 1, 'Mary Johnson', '555-1001'),
(gen_random_uuid(), 'Emma', 'Williams', 'emma.w@student.edu', '2009-07-22', '2023-09-01', 9, 3.50, 1, 'Tom Williams', '555-1002'),
(gen_random_uuid(), 'Ryan', 'Garcia', 'ryan.g@student.edu', '2008-11-08', '2022-09-01', 10, 2.80, 1, 'Rosa Garcia', '555-1003'),
(gen_random_uuid(), 'Sophie', 'Martinez', 'sophie.m@student.edu', '2007-01-30', '2021-09-01', 11, 3.90, 1, 'Carlos Martinez', '555-1004'),
(gen_random_uuid(), 'Noah', 'Anderson', 'noah.a@student.edu', '2009-05-17', '2023-09-01', 9, 3.20, 1, 'Julie Anderson', '555-1005'),
(gen_random_uuid(), 'Olivia', 'Taylor', 'olivia.t@student.edu', '2008-09-03', '2022-09-01', 10, 3.60, 1, 'Mark Taylor', '555-1006'),
(gen_random_uuid(), 'Ethan', 'Thomas', 'ethan.t@student.edu', '2007-12-11', '2021-09-01', 11, 2.50, 1, 'Linda Thomas', '555-1007'),
(gen_random_uuid(), 'Ava', 'Jackson', 'ava.j@student.edu', '2010-02-28', '2024-09-01', 8, 3.85, 1, 'Robert Jackson', '555-1008'),
(gen_random_uuid(), 'Liam', 'White', 'liam.w@student.edu', '2008-06-14', '2022-09-01', 10, NULL, 0, 'Karen White', '555-1009'),
(gen_random_uuid(), 'Mia', 'Harris', 'mia.h@student.edu', '2009-10-25', '2023-09-01', 9, 3.45, 1, 'Steve Harris', '555-1010');

-- Courses
INSERT INTO sample_school."Course" ("ID", "Name", "CourseCode", "Credits", "DepartmentID", "TeacherID", "MaxStudents", "IsElective", "Description") VALUES
(gen_random_uuid(), 'Algebra II', 'MATH201', 4, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'MATH'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'robert.chen@school.edu'
LIMIT 1), 30, 0, 'Advanced algebra concepts'),
(gen_random_uuid(), 'Biology', 'SCI101', 4, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'SCI'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'maria.santos@school.edu'
LIMIT 1), 25, 0, 'Introduction to biological sciences'),
(gen_random_uuid(), 'American Literature', 'ENG301', 3, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ENG'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'james.wilson@school.edu'
LIMIT 1), 28, 0, 'Survey of American literary works'),
(gen_random_uuid(), 'World History', 'HIST201', 3, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'HIST'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'sarah.thompson@school.edu'
LIMIT 1), 35, 0, 'Global historical perspectives'),
(gen_random_uuid(), 'Studio Art', 'ART101', 2, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ART'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'david.kim@school.edu'
LIMIT 1), 20, 1, 'Introductory visual arts studio'),
(gen_random_uuid(), 'Chemistry', 'SCI201', 4, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'SCI'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'michael.davis@school.edu'
LIMIT 1), 25, 0, 'General chemistry principles'),
(gen_random_uuid(), 'Statistics', 'MATH301', 3, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'MATH'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'lisa.brown@school.edu'
LIMIT 1), 30, 1, 'Introduction to statistical methods'),
(gen_random_uuid(), 'Creative Writing', 'ENG201', 3, (SELECT "ID" FROM sample_school."Department" WHERE "Code" = 'ENG'
LIMIT 1), (SELECT "ID" FROM sample_school."Teacher" WHERE "Email" = 'jennifer.lee@school.edu'
LIMIT 1), 22, 1, 'Fiction and poetry writing workshop');

-- Enrollments
INSERT INTO sample_school."Enrollment" ("ID", "StudentID", "CourseID", "EnrollmentDate", "Grade", "Status") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'alex.j@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-09-01', 88.50, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'alex.j@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI101'
LIMIT 1), '2024-09-01', 92.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'emma.w@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), '2024-09-01', 95.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'emma.w@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'HIST201'
LIMIT 1), '2024-09-01', 87.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'ryan.g@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-09-01', 72.50, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'sophie.m@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI201'
LIMIT 1), '2024-09-01', 96.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'sophie.m@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH301'
LIMIT 1), '2024-09-01', 91.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'noah.a@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ART101'
LIMIT 1), '2024-09-01', 85.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'olivia.t@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG201'
LIMIT 1), '2024-09-01', NULL, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'ethan.t@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'HIST201'
LIMIT 1), '2023-09-01', 68.00, 'Completed');

-- Assignments
INSERT INTO sample_school."Assignment" ("ID", "CourseID", "Title", "Description", "DueDate", "MaxPoints", "Weight", "IsExtraCredit") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), 'Quadratic Equations', 'Solve quadratic equation problems', '2024-10-15', 100.00, 1.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), 'Polynomial Functions', 'Graph and analyze polynomials', '2024-11-01', 100.00, 1.50, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI101'
LIMIT 1), 'Cell Structure Lab', 'Microscope observation report', '2024-10-20', 50.00, 1.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI101'
LIMIT 1), 'Ecosystem Research', 'Research paper on local ecosystem', '2024-11-15', 100.00, 2.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), 'Poetry Analysis', 'Analyze three American poems', '2024-10-10', 75.00, 1.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), 'Book Report', 'Report on chosen American novel', '2024-11-20', 100.00, 2.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'HIST201'
LIMIT 1), 'Timeline Project', 'Create an interactive timeline', '2024-10-25', 80.00, 1.50, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ART101'
LIMIT 1), 'Self Portrait', 'Mixed media self portrait', '2024-10-30', 100.00, 1.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI201'
LIMIT 1), 'Periodic Table Quiz', 'Elements and compounds quiz', '2024-10-05', 50.00, 0.50, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), 'Bonus Problem Set', 'Extra credit problems', '2024-12-01', 25.00, 0.50, 1);

-- Attendance records
INSERT INTO sample_school."Attendance" ("ID", "StudentID", "CourseID", "AttendanceDate", "AttendanceTime", "Status", "Notes") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'alex.j@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-10-01', '08:30:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'alex.j@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-10-02', '08:30:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'alex.j@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-10-03', '08:45:00', 'Late', 'Arrived 15 minutes late'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'emma.w@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), '2024-10-01', '10:00:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'emma.w@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), '2024-10-02', NULL, 'Absent', 'Family emergency'),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'emma.w@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ENG301'
LIMIT 1), '2024-10-03', '10:00:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'ryan.g@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-10-01', '08:30:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'ryan.g@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'MATH201'
LIMIT 1), '2024-10-02', NULL, 'Absent', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'sophie.m@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI201'
LIMIT 1), '2024-10-01', '13:00:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'sophie.m@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'SCI201'
LIMIT 1), '2024-10-02', '13:00:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'noah.a@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ART101'
LIMIT 1), '2024-10-01', '14:00:00', 'Present', NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_school."Student" WHERE "Email" = 'noah.a@student.edu'
LIMIT 1), (SELECT "ID" FROM sample_school."Course" WHERE "CourseCode" = 'ART101'
LIMIT 1), '2024-10-02', '14:00:00', 'Excused', 'School event');


-- ===================== FK & CHECK Constraints =====================

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_school."Department" ADD CONSTRAINT CK_Department_Code_Length CHECK (LENGTH("Code") BETWEEN 2 AND 10) NOT VALID;

ALTER TABLE sample_school."Teacher" ADD CONSTRAINT CK_Teacher_Email_Length CHECK (LENGTH("Email") >= 5) NOT VALID;

ALTER TABLE sample_school."Course" ADD CONSTRAINT CK_Course_Code_Length CHECK (LENGTH("CourseCode") >= 3) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_school TO "SchoolReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_school."Department" IS 'Academic departments';

COMMENT ON TABLE sample_school."Teacher" IS 'Teaching staff members';

COMMENT ON TABLE sample_school."Course" IS 'Available courses';

COMMENT ON TABLE sample_school."Student" IS 'Enrolled students';

COMMENT ON TABLE sample_school."Enrollment" IS 'Student-course enrollments';

COMMENT ON TABLE sample_school."Assignment" IS 'Course assignments';

COMMENT ON TABLE sample_school."Submission" IS 'Student assignment submissions';

COMMENT ON TABLE sample_school."Attendance" IS 'Daily attendance records';

COMMENT ON COLUMN sample_school."Student"."GPA" IS 'Overall grade point average';

COMMENT ON COLUMN sample_school."Teacher"."SupervisorID" IS 'Self-referencing supervisor';
