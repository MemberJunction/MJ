/* =============================================
   Sample School Management System
   Schema: sample_school
   Pass 14 - SQL Converter Validation
   ============================================= */

-- Create schema
CREATE SCHEMA sample_school;
GO

USE SampleSchool;
GO

PRINT 'Creating School Management tables...';
GO

-- Table 1: Department
CREATE TABLE sample_school.Department (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Code VARCHAR(10) NOT NULL,
    BudgetAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    Description NVARCHAR(MAX) NULL,
    HeadOfDepartmentID UNIQUEIDENTIFIER NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Department PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Department_Code UNIQUE (Code),
    CONSTRAINT UQ_Department_Name UNIQUE (Name),
    CONSTRAINT CK_Department_Budget CHECK (BudgetAmount >= 0)
);
GO

-- Table 2: Teacher
CREATE TABLE sample_school.Teacher (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Phone VARCHAR(20) NULL,
    DepartmentID UNIQUEIDENTIFIER NOT NULL,
    HireDate DATE NOT NULL,
    Salary DECIMAL(10,2) NOT NULL,
    IsFullTime BIT NOT NULL DEFAULT 1,
    SupervisorID UNIQUEIDENTIFIER NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Teacher PRIMARY KEY (ID),
    CONSTRAINT FK_Teacher_Department FOREIGN KEY (DepartmentID) REFERENCES sample_school.Department(ID),
    CONSTRAINT FK_Teacher_Supervisor FOREIGN KEY (SupervisorID) REFERENCES sample_school.Teacher(ID),
    CONSTRAINT UQ_Teacher_Email UNIQUE (Email),
    CONSTRAINT CK_Teacher_Salary CHECK (Salary > 0)
);
GO

-- Table 3: Course
CREATE TABLE sample_school.Course (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(150) NOT NULL,
    CourseCode VARCHAR(15) NOT NULL,
    Credits SMALLINT NOT NULL DEFAULT 3,
    DepartmentID UNIQUEIDENTIFIER NOT NULL,
    TeacherID UNIQUEIDENTIFIER NULL,
    MaxStudents INT NOT NULL DEFAULT 30,
    IsElective BIT NOT NULL DEFAULT 0,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Course PRIMARY KEY (ID),
    CONSTRAINT FK_Course_Department FOREIGN KEY (DepartmentID) REFERENCES sample_school.Department(ID),
    CONSTRAINT FK_Course_Teacher FOREIGN KEY (TeacherID) REFERENCES sample_school.Teacher(ID),
    CONSTRAINT UQ_Course_Code UNIQUE (CourseCode),
    CONSTRAINT CK_Course_Credits CHECK (Credits BETWEEN 1 AND 6),
    CONSTRAINT CK_Course_MaxStudents CHECK (MaxStudents BETWEEN 5 AND 200)
);
GO

-- Table 4: Student
CREATE TABLE sample_school.Student (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    DateOfBirth DATE NOT NULL,
    EnrollmentDate DATE NOT NULL,
    GradeLevel SMALLINT NOT NULL,
    GPA DECIMAL(3,2) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    EmergencyContact NVARCHAR(100) NULL,
    EmergencyPhone VARCHAR(20) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Student PRIMARY KEY (ID),
    CONSTRAINT UQ_Student_Email UNIQUE (Email),
    CONSTRAINT CK_Student_GradeLevel CHECK (GradeLevel BETWEEN 1 AND 12),
    CONSTRAINT CK_Student_GPA CHECK (GPA BETWEEN 0.00 AND 4.00)
);
GO

-- Table 5: Enrollment
CREATE TABLE sample_school.Enrollment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StudentID UNIQUEIDENTIFIER NOT NULL,
    CourseID UNIQUEIDENTIFIER NOT NULL,
    EnrollmentDate DATE NOT NULL,
    Grade DECIMAL(5,2) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Active',
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Enrollment PRIMARY KEY (ID),
    CONSTRAINT FK_Enrollment_Student FOREIGN KEY (StudentID) REFERENCES sample_school.Student(ID),
    CONSTRAINT FK_Enrollment_Course FOREIGN KEY (CourseID) REFERENCES sample_school.Course(ID),
    CONSTRAINT UQ_Enrollment_StudentCourse UNIQUE (StudentID, CourseID),
    CONSTRAINT CK_Enrollment_Grade CHECK (Grade BETWEEN 0 AND 100),
    CONSTRAINT CK_Enrollment_Status CHECK (Status IN (N'Active', N'Dropped', N'Completed', N'Withdrawn'))
);
GO

-- Table 6: Assignment
CREATE TABLE sample_school.Assignment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CourseID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DueDate DATETIME NOT NULL,
    MaxPoints DECIMAL(6,2) NOT NULL DEFAULT 100,
    Weight DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    IsExtraCredit BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Assignment PRIMARY KEY (ID),
    CONSTRAINT FK_Assignment_Course FOREIGN KEY (CourseID) REFERENCES sample_school.Course(ID),
    CONSTRAINT CK_Assignment_MaxPoints CHECK (MaxPoints > 0),
    CONSTRAINT CK_Assignment_Weight CHECK (Weight BETWEEN 0.01 AND 10.00)
);
GO

-- Table 7: Submission
CREATE TABLE sample_school.Submission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AssignmentID UNIQUEIDENTIFIER NOT NULL,
    StudentID UNIQUEIDENTIFIER NOT NULL,
    SubmittedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    PointsEarned DECIMAL(6,2) NULL,
    Feedback NVARCHAR(MAX) NULL,
    IsLate BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Submission PRIMARY KEY (ID),
    CONSTRAINT FK_Submission_Assignment FOREIGN KEY (AssignmentID) REFERENCES sample_school.Assignment(ID),
    CONSTRAINT FK_Submission_Student FOREIGN KEY (StudentID) REFERENCES sample_school.Student(ID),
    CONSTRAINT UQ_Submission_AssignmentStudent UNIQUE (AssignmentID, StudentID),
    CONSTRAINT CK_Submission_Points CHECK (PointsEarned >= 0)
);
GO

-- Table 8: Attendance
CREATE TABLE sample_school.Attendance (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StudentID UNIQUEIDENTIFIER NOT NULL,
    CourseID UNIQUEIDENTIFIER NOT NULL,
    AttendanceDate DATE NOT NULL,
    AttendanceTime TIME NULL,
    Status NVARCHAR(15) NOT NULL DEFAULT N'Present',
    Notes NVARCHAR(500) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Attendance PRIMARY KEY (ID),
    CONSTRAINT FK_Attendance_Student FOREIGN KEY (StudentID) REFERENCES sample_school.Student(ID),
    CONSTRAINT FK_Attendance_Course FOREIGN KEY (CourseID) REFERENCES sample_school.Course(ID),
    CONSTRAINT CK_Attendance_Status CHECK (Status IN (N'Present', N'Absent', N'Late', N'Excused'))
);
GO

-- Filtered indexes
CREATE INDEX IX_Teacher_Active ON sample_school.Teacher(DepartmentID) WHERE IsFullTime = 1;
GO

CREATE INDEX IX_Student_Active ON sample_school.Student(GradeLevel) WHERE IsActive = 1;
GO

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_school.Department ADD CONSTRAINT CK_Department_Code_Length CHECK (LEN(Code) BETWEEN 2 AND 10);
GO

ALTER TABLE sample_school.Teacher ADD CONSTRAINT CK_Teacher_Email_Length CHECK (LEN(Email) >= 5);
GO

ALTER TABLE sample_school.Course ADD CONSTRAINT CK_Course_Code_Length CHECK (LEN(CourseCode) >= 3);
GO

-- View 1: Student Performance Summary
CREATE VIEW sample_school.vwStudentPerformance AS
SELECT
    s.ID AS StudentID,
    s.FirstName,
    s.LastName,
    s.GradeLevel,
    COUNT(e.ID) AS TotalCourses,
    ROUND(AVG(e.Grade), 2) AS AverageGrade,
    SUM(CASE WHEN e.Status = N'Completed' THEN 1 ELSE 0 END) AS CompletedCourses,
    SUM(CASE WHEN e.Status = N'Active' THEN 1 ELSE 0 END) AS ActiveCourses,
    ISNULL(s.GPA, 0) AS CurrentGPA,
    DATEDIFF(DAY, s.EnrollmentDate, GETUTCDATE()) AS DaysEnrolled,
    IIF(ISNULL(s.GPA, 0) >= 3.5, N'Honor Roll', N'Regular') AS AcademicStatus
FROM sample_school.Student s
LEFT JOIN sample_school.Enrollment e ON s.ID = e.StudentID
GROUP BY s.ID, s.FirstName, s.LastName, s.GradeLevel, s.GPA, s.EnrollmentDate;
GO

-- View 2: Course Dashboard
CREATE VIEW sample_school.vwCourseDashboard AS
SELECT
    c.ID AS CourseID,
    c.Name AS CourseName,
    c.CourseCode,
    c.Credits,
    d.Name AS DepartmentName,
    COALESCE(t.FirstName + N' ' + t.LastName, N'Unassigned') AS TeacherName,
    COUNT(e.ID) AS EnrolledStudents,
    c.MaxStudents,
    c.MaxStudents - COUNT(e.ID) AS AvailableSeats,
    ROUND(AVG(CAST(e.Grade AS DECIMAL(5,2))), 2) AS AverageGrade,
    IIF(COUNT(e.ID) >= c.MaxStudents, N'Full', N'Open') AS CourseStatus
FROM sample_school.Course c
LEFT JOIN sample_school.Department d ON c.DepartmentID = d.ID
LEFT JOIN sample_school.Teacher t ON c.TeacherID = t.ID
LEFT JOIN sample_school.Enrollment e ON c.ID = e.CourseID AND e.Status = N'Active'
GROUP BY c.ID, c.Name, c.CourseCode, c.Credits, d.Name, t.FirstName, t.LastName, c.MaxStudents;
GO

-- View 3: Department Overview
CREATE VIEW sample_school.vwDepartmentOverview AS
SELECT
    d.ID AS DepartmentID,
    d.Name AS DepartmentName,
    d.BudgetAmount,
    COUNT(DISTINCT t.ID) AS TeacherCount,
    COUNT(DISTINCT c.ID) AS CourseCount,
    SUM(t.Salary) AS TotalSalaryExpense,
    ROUND(AVG(t.Salary), 2) AS AverageSalary,
    COALESCE(SUM(CAST(IIF(t.IsFullTime = 1, 1, 0) AS INT)), 0) AS FullTimeTeachers,
    d.BudgetAmount - ISNULL(SUM(t.Salary), 0) AS RemainingBudget,
    YEAR(GETUTCDATE()) AS ReportYear
FROM sample_school.Department d
LEFT JOIN sample_school.Teacher t ON d.ID = t.DepartmentID
LEFT JOIN sample_school.Course c ON d.ID = c.DepartmentID
GROUP BY d.ID, d.Name, d.BudgetAmount;
GO

-- View 4: Attendance Report
CREATE VIEW sample_school.vwAttendanceReport AS
SELECT
    s.ID AS StudentID,
    s.FirstName + N' ' + s.LastName AS StudentName,
    c.Name AS CourseName,
    COUNT(a.ID) AS TotalRecords,
    SUM(CASE WHEN a.Status = N'Present' THEN 1 ELSE 0 END) AS PresentCount,
    SUM(CASE WHEN a.Status = N'Absent' THEN 1 ELSE 0 END) AS AbsentCount,
    SUM(CASE WHEN a.Status = N'Late' THEN 1 ELSE 0 END) AS LateCount,
    ROUND(
        CAST(SUM(CASE WHEN a.Status = N'Present' THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        IIF(COUNT(a.ID) = 0, 1, COUNT(a.ID)) * 100,
    2) AS AttendanceRate,
    MONTH(GETUTCDATE()) AS ReportMonth,
    YEAR(GETUTCDATE()) AS ReportYear
FROM sample_school.Student s
LEFT JOIN sample_school.Attendance a ON s.ID = a.StudentID
LEFT JOIN sample_school.Course c ON a.CourseID = c.ID
GROUP BY s.ID, s.FirstName, s.LastName, c.Name
HAVING COUNT(a.ID) > 0;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Academic departments', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Department';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Teaching staff members', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Teacher';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Available courses', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Course';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Enrolled students', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Student';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Student-course enrollments', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Enrollment';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Course assignments', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Assignment';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Student assignment submissions', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Submission';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Daily attendance records', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Attendance';
GO

-- Column-level extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Overall grade point average', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Student', @level2type=N'COLUMN', @level2name=N'GPA';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-referencing supervisor', @level0type=N'SCHEMA', @level0name=N'sample_school', @level1type=N'TABLE', @level1name=N'Teacher', @level2type=N'COLUMN', @level2name=N'SupervisorID';
GO

-- Role and Grant
CREATE ROLE [SchoolReader];
GO
GRANT SELECT ON SCHEMA::sample_school TO [SchoolReader];
GO

-- INSERT seed data
-- Departments
INSERT INTO sample_school.Department (ID, Name, Code, BudgetAmount, IsActive, Description) VALUES
(NEWID(), N'Mathematics', N'MATH', 150000.00, 1, N'Mathematics and statistics department'),
(NEWID(), N'Science', N'SCI', 200000.00, 1, N'Natural and physical sciences'),
(NEWID(), N'English', N'ENG', 120000.00, 1, N'English language and literature'),
(NEWID(), N'History', N'HIST', 100000.00, 1, N'History and social studies'),
(NEWID(), N'Arts', N'ART', 80000.00, 1, N'Visual and performing arts');
GO

-- Teachers
INSERT INTO sample_school.Teacher (ID, FirstName, LastName, Email, Phone, DepartmentID, HireDate, Salary, IsFullTime) VALUES
(NEWID(), N'Robert', N'Chen', N'robert.chen@school.edu', N'555-0101', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'MATH'), '2018-08-15', 65000.00, 1),
(NEWID(), N'Maria', N'Santos', N'maria.santos@school.edu', N'555-0102', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'SCI'), '2019-01-10', 68000.00, 1),
(NEWID(), N'James', N'Wilson', N'james.wilson@school.edu', N'555-0103', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ENG'), '2020-08-20', 62000.00, 1),
(NEWID(), N'Sarah', N'Thompson', N'sarah.thompson@school.edu', N'555-0104', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'HIST'), '2017-08-15', 70000.00, 1),
(NEWID(), N'David', N'Kim', N'david.kim@school.edu', N'555-0105', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ART'), '2021-01-05', 58000.00, 1),
(NEWID(), N'Lisa', N'Brown', N'lisa.brown@school.edu', N'555-0106', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'MATH'), '2022-08-20', 55000.00, 0),
(NEWID(), N'Michael', N'Davis', N'michael.davis@school.edu', N'555-0107', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'SCI'), '2016-08-15', 72000.00, 1),
(NEWID(), N'Jennifer', N'Lee', N'jennifer.lee@school.edu', N'555-0108', (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ENG'), '2023-01-10', 52000.00, 0);
GO

-- Students
INSERT INTO sample_school.Student (ID, FirstName, LastName, Email, DateOfBirth, EnrollmentDate, GradeLevel, GPA, IsActive, EmergencyContact, EmergencyPhone) VALUES
(NEWID(), N'Alex', N'Johnson', N'alex.j@student.edu', '2008-03-15', '2022-09-01', 10, 3.75, 1, N'Mary Johnson', N'555-1001'),
(NEWID(), N'Emma', N'Williams', N'emma.w@student.edu', '2009-07-22', '2023-09-01', 9, 3.50, 1, N'Tom Williams', N'555-1002'),
(NEWID(), N'Ryan', N'Garcia', N'ryan.g@student.edu', '2008-11-08', '2022-09-01', 10, 2.80, 1, N'Rosa Garcia', N'555-1003'),
(NEWID(), N'Sophie', N'Martinez', N'sophie.m@student.edu', '2007-01-30', '2021-09-01', 11, 3.90, 1, N'Carlos Martinez', N'555-1004'),
(NEWID(), N'Noah', N'Anderson', N'noah.a@student.edu', '2009-05-17', '2023-09-01', 9, 3.20, 1, N'Julie Anderson', N'555-1005'),
(NEWID(), N'Olivia', N'Taylor', N'olivia.t@student.edu', '2008-09-03', '2022-09-01', 10, 3.60, 1, N'Mark Taylor', N'555-1006'),
(NEWID(), N'Ethan', N'Thomas', N'ethan.t@student.edu', '2007-12-11', '2021-09-01', 11, 2.50, 1, N'Linda Thomas', N'555-1007'),
(NEWID(), N'Ava', N'Jackson', N'ava.j@student.edu', '2010-02-28', '2024-09-01', 8, 3.85, 1, N'Robert Jackson', N'555-1008'),
(NEWID(), N'Liam', N'White', N'liam.w@student.edu', '2008-06-14', '2022-09-01', 10, NULL, 0, N'Karen White', N'555-1009'),
(NEWID(), N'Mia', N'Harris', N'mia.h@student.edu', '2009-10-25', '2023-09-01', 9, 3.45, 1, N'Steve Harris', N'555-1010');
GO

-- Courses
INSERT INTO sample_school.Course (ID, Name, CourseCode, Credits, DepartmentID, TeacherID, MaxStudents, IsElective, Description) VALUES
(NEWID(), N'Algebra II', N'MATH201', 4, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'MATH'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'robert.chen@school.edu'), 30, 0, N'Advanced algebra concepts'),
(NEWID(), N'Biology', N'SCI101', 4, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'SCI'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'maria.santos@school.edu'), 25, 0, N'Introduction to biological sciences'),
(NEWID(), N'American Literature', N'ENG301', 3, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ENG'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'james.wilson@school.edu'), 28, 0, N'Survey of American literary works'),
(NEWID(), N'World History', N'HIST201', 3, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'HIST'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'sarah.thompson@school.edu'), 35, 0, N'Global historical perspectives'),
(NEWID(), N'Studio Art', N'ART101', 2, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ART'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'david.kim@school.edu'), 20, 1, N'Introductory visual arts studio'),
(NEWID(), N'Chemistry', N'SCI201', 4, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'SCI'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'michael.davis@school.edu'), 25, 0, N'General chemistry principles'),
(NEWID(), N'Statistics', N'MATH301', 3, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'MATH'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'lisa.brown@school.edu'), 30, 1, N'Introduction to statistical methods'),
(NEWID(), N'Creative Writing', N'ENG201', 3, (SELECT TOP 1 ID FROM sample_school.Department WHERE Code = N'ENG'), (SELECT TOP 1 ID FROM sample_school.Teacher WHERE Email = N'jennifer.lee@school.edu'), 22, 1, N'Fiction and poetry writing workshop');
GO

-- Enrollments
INSERT INTO sample_school.Enrollment (ID, StudentID, CourseID, EnrollmentDate, Grade, Status) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'alex.j@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-09-01', 88.50, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'alex.j@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI101'), '2024-09-01', 92.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'emma.w@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), '2024-09-01', 95.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'emma.w@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'HIST201'), '2024-09-01', 87.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'ryan.g@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-09-01', 72.50, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'sophie.m@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI201'), '2024-09-01', 96.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'sophie.m@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH301'), '2024-09-01', 91.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'noah.a@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ART101'), '2024-09-01', 85.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'olivia.t@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG201'), '2024-09-01', NULL, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'ethan.t@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'HIST201'), '2023-09-01', 68.00, N'Completed');
GO

-- Assignments
INSERT INTO sample_school.Assignment (ID, CourseID, Title, Description, DueDate, MaxPoints, Weight, IsExtraCredit) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), N'Quadratic Equations', N'Solve quadratic equation problems', '2024-10-15', 100.00, 1.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), N'Polynomial Functions', N'Graph and analyze polynomials', '2024-11-01', 100.00, 1.50, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI101'), N'Cell Structure Lab', N'Microscope observation report', '2024-10-20', 50.00, 1.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI101'), N'Ecosystem Research', N'Research paper on local ecosystem', '2024-11-15', 100.00, 2.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), N'Poetry Analysis', N'Analyze three American poems', '2024-10-10', 75.00, 1.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), N'Book Report', N'Report on chosen American novel', '2024-11-20', 100.00, 2.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'HIST201'), N'Timeline Project', N'Create an interactive timeline', '2024-10-25', 80.00, 1.50, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ART101'), N'Self Portrait', N'Mixed media self portrait', '2024-10-30', 100.00, 1.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI201'), N'Periodic Table Quiz', N'Elements and compounds quiz', '2024-10-05', 50.00, 0.50, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), N'Bonus Problem Set', N'Extra credit problems', '2024-12-01', 25.00, 0.50, 1);
GO

-- Attendance records
INSERT INTO sample_school.Attendance (ID, StudentID, CourseID, AttendanceDate, AttendanceTime, Status, Notes) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'alex.j@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-10-01', '08:30:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'alex.j@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-10-02', '08:30:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'alex.j@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-10-03', '08:45:00', N'Late', N'Arrived 15 minutes late'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'emma.w@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), '2024-10-01', '10:00:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'emma.w@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), '2024-10-02', NULL, N'Absent', N'Family emergency'),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'emma.w@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ENG301'), '2024-10-03', '10:00:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'ryan.g@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-10-01', '08:30:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'ryan.g@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'MATH201'), '2024-10-02', NULL, N'Absent', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'sophie.m@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI201'), '2024-10-01', '13:00:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'sophie.m@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'SCI201'), '2024-10-02', '13:00:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'noah.a@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ART101'), '2024-10-01', '14:00:00', N'Present', NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_school.Student WHERE Email = N'noah.a@student.edu'), (SELECT TOP 1 ID FROM sample_school.Course WHERE CourseCode = N'ART101'), '2024-10-02', '14:00:00', N'Excused', N'School event');
GO
