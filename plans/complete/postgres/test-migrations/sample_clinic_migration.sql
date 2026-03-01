/*
 * Sample Medical Clinic Migration (T-SQL)
 * Schema: sample_clinic
 * 8 tables, 5 views, CHECK constraints (inline + ALTER TABLE),
 * extended properties, GRANT/ROLE, 150+ seed rows.
 * SQL constructs: DATEDIFF, ISNULL, GETDATE(), GETUTCDATE(), YEAR(), MONTH(), DAY(),
 *                 COALESCE, CASE WHEN, IIF, ROUND, CAST, LEN, COUNT, SUM, AVG,
 *                 GROUP BY, HAVING, LEFT JOIN, subqueries
 *
 * This migration exercises ALL constructs fixed in passes 1-9:
 * - Inline CHECK constraints with PascalCase column names
 * - ALTER TABLE CHECK constraints
 * - Self-referencing FK
 * - Multi-FK to same table (Billing → Doctor, LabResult → Doctor)
 * - TIME columns
 * - SMALLINT columns
 * - DECIMAL with varied precision
 * - VARCHAR(MAX) / NVARCHAR(MAX)
 * - DATETIME DEFAULT GETUTCDATE()
 * - DATETIME DEFAULT GETDATE() (both variants)
 * - UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()
 * - BIT DEFAULT 0/1
 * - DEFAULT string values
 * - UNIQUE constraints on columns
 * - Composite UNIQUE constraint
 * - CLUSTERED PRIMARY KEY
 * - N-string literals in INSERTs
 * - LEN() in a CHECK constraint
 * - DATEDIFF with nested function calls (balanced parens)
 * - DATEDIFF with TIME expressions
 * - Numeric + between columns (NOT string concat)
 * - sp_addextendedproperty for tables and columns
 * - CREATE ROLE with quoted name + GRANT SELECT ON SCHEMA
 * - GO batch separators
 * - Comments with PascalCase words (-- and block styles)
 * - FK REFERENCES with schema prefix
 */

-- ============================================================
-- Schema Creation
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_clinic')
    EXEC('CREATE SCHEMA sample_clinic');
GO

-- ============================================================
-- Tables
-- ============================================================

/* Specialty - Medical specialization categories for DoctorAssignment */
CREATE TABLE sample_clinic.Specialty (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Specialty PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Specialty_Name UNIQUE (Name)
);
GO

-- Doctor - Physician records with LicenseNumber and ConsultationFee
CREATE TABLE sample_clinic.Doctor (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    SpecialtyID UNIQUEIDENTIFIER NOT NULL,
    LicenseNumber VARCHAR(30) NOT NULL,
    HireDate DATE NOT NULL,
    ConsultationFee DECIMAL(8,2) NOT NULL CHECK (ConsultationFee >= 0),
    IsAcceptingPatients BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Doctor PRIMARY KEY (ID),
    CONSTRAINT UQ_Doctor_Email UNIQUE (Email),
    CONSTRAINT UQ_Doctor_LicenseNumber UNIQUE (LicenseNumber),
    CONSTRAINT FK_Doctor_Specialty FOREIGN KEY (SpecialtyID) REFERENCES sample_clinic.Specialty(ID)
);
GO

/* Patient - PatientRegistration with EmergencyContact and InsuranceProvider details */
CREATE TABLE sample_clinic.Patient (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NULL,
    Phone VARCHAR(20) NOT NULL,
    DateOfBirth DATE NOT NULL,
    Gender VARCHAR(10) NOT NULL CHECK (Gender IN ('Male', 'Female', 'Other')),
    Address NVARCHAR(300) NULL,
    EmergencyContactName NVARCHAR(200) NOT NULL,
    EmergencyContactPhone VARCHAR(20) NOT NULL,
    PrimaryDoctorID UNIQUEIDENTIFIER NOT NULL,
    InsuranceProvider NVARCHAR(200) NULL,
    InsurancePolicyNumber VARCHAR(50) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    RegisteredAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Patient PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Patient_Doctor FOREIGN KEY (PrimaryDoctorID) REFERENCES sample_clinic.Doctor(ID)
);
GO

-- Appointment - Scheduling with self-referencing PreviousAppointmentID for FollowUp tracking
CREATE TABLE sample_clinic.Appointment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PatientID UNIQUEIDENTIFIER NOT NULL,
    DoctorID UNIQUEIDENTIFIER NOT NULL,
    AppointmentDate DATE NOT NULL,
    AppointmentTime TIME NOT NULL,
    DurationMinutes INT NOT NULL DEFAULT 30,
    Status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK (Status IN ('Scheduled', 'Confirmed', 'InProgress', 'Completed', 'Cancelled', 'NoShow')),
    ReasonForVisit NVARCHAR(500) NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CancelledAt DATETIME NULL,
    IsFollowUp BIT NOT NULL DEFAULT 0,
    PreviousAppointmentID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_Appointment PRIMARY KEY (ID),
    CONSTRAINT FK_Appointment_Patient FOREIGN KEY (PatientID) REFERENCES sample_clinic.Patient(ID),
    CONSTRAINT FK_Appointment_Doctor FOREIGN KEY (DoctorID) REFERENCES sample_clinic.Doctor(ID),
    CONSTRAINT FK_Appointment_Previous FOREIGN KEY (PreviousAppointmentID) REFERENCES sample_clinic.Appointment(ID),
    CONSTRAINT UQ_Appointment_PatientDateTime UNIQUE (PatientID, AppointmentDate, AppointmentTime)
);
GO

/* Diagnosis - Clinical DiagnosisRecord with ICDCode and SeverityLevel */
CREATE TABLE sample_clinic.Diagnosis (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AppointmentID UNIQUEIDENTIFIER NOT NULL,
    ICDCode VARCHAR(10) NOT NULL,
    Description NVARCHAR(500) NOT NULL,
    Severity VARCHAR(20) NOT NULL DEFAULT 'Moderate' CHECK (Severity IN ('Mild', 'Moderate', 'Severe', 'Critical')),
    DiagnosedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Diagnosis PRIMARY KEY (ID),
    CONSTRAINT FK_Diagnosis_Appointment FOREIGN KEY (AppointmentID) REFERENCES sample_clinic.Appointment(ID)
);
GO

-- Prescription - MedicationPrescription with Refills count and DosageInformation
CREATE TABLE sample_clinic.Prescription (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    DiagnosisID UNIQUEIDENTIFIER NOT NULL,
    MedicationName NVARCHAR(200) NOT NULL,
    Dosage NVARCHAR(100) NOT NULL,
    Frequency NVARCHAR(100) NOT NULL,
    DurationDays INT NOT NULL CHECK (DurationDays > 0),
    Quantity INT NOT NULL CHECK (Quantity > 0),
    Refills SMALLINT NOT NULL DEFAULT 0,
    PrescribedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Prescription PRIMARY KEY (ID),
    CONSTRAINT FK_Prescription_Diagnosis FOREIGN KEY (DiagnosisID) REFERENCES sample_clinic.Diagnosis(ID)
);
GO

/* Billing - PaymentProcessing with multi-FK to Doctor and Patient, InsuranceCoverage tracking */
CREATE TABLE sample_clinic.Billing (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AppointmentID UNIQUEIDENTIFIER NOT NULL,
    PatientID UNIQUEIDENTIFIER NOT NULL,
    DoctorID UNIQUEIDENTIFIER NOT NULL,
    ServiceDescription NVARCHAR(300) NOT NULL,
    Amount DECIMAL(10,2) NOT NULL CHECK (Amount >= 0),
    InsuranceCoverage DECIMAL(10,2) NOT NULL DEFAULT 0,
    PatientResponsibility DECIMAL(10,2) NOT NULL,
    PaymentStatus VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending', 'Billed', 'Paid', 'Denied', 'Appealed')),
    BilledAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    PaidAt DATETIME NULL,
    PaymentMethod VARCHAR(20) NULL,
    CONSTRAINT PK_Billing PRIMARY KEY (ID),
    CONSTRAINT FK_Billing_Appointment FOREIGN KEY (AppointmentID) REFERENCES sample_clinic.Appointment(ID),
    CONSTRAINT FK_Billing_Patient FOREIGN KEY (PatientID) REFERENCES sample_clinic.Patient(ID),
    CONSTRAINT FK_Billing_Doctor FOREIGN KEY (DoctorID) REFERENCES sample_clinic.Doctor(ID)
);
GO

-- LabResult - TestResult with multi-FK: AppointmentID and OrderedByDoctorID both reference different tables
CREATE TABLE sample_clinic.LabResult (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AppointmentID UNIQUEIDENTIFIER NOT NULL,
    TestName NVARCHAR(200) NOT NULL,
    TestDate DATE NOT NULL,
    ResultValue NVARCHAR(100) NOT NULL,
    NormalRange NVARCHAR(100) NULL,
    IsAbnormal BIT NOT NULL DEFAULT 0,
    OrderedByDoctorID UNIQUEIDENTIFIER NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    ReceivedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_LabResult PRIMARY KEY (ID),
    CONSTRAINT FK_LabResult_Appointment FOREIGN KEY (AppointmentID) REFERENCES sample_clinic.Appointment(ID),
    CONSTRAINT FK_LabResult_Doctor FOREIGN KEY (OrderedByDoctorID) REFERENCES sample_clinic.Doctor(ID)
);
GO

-- ============================================================
-- ALTER TABLE CHECK Constraints
-- ============================================================

-- PatientResponsibility must be non-negative
ALTER TABLE sample_clinic.Billing ADD CONSTRAINT CK_Billing_PatientResponsibility CHECK (PatientResponsibility >= 0);
GO

-- ICDCode length must be between 3 and 10 characters - LEN() in CHECK
ALTER TABLE sample_clinic.Diagnosis ADD CONSTRAINT CK_Diagnosis_ICDCodeLength CHECK (LEN(ICDCode) BETWEEN 3 AND 10);
GO

-- ============================================================
-- Views
-- ============================================================

/* vwDoctorSchedule - DoctorAppointment schedule for today with PatientName and TimeSlot */
CREATE VIEW sample_clinic.vwDoctorSchedule AS
SELECT
    d.ID AS DoctorID,
    d.FirstName + N' ' + d.LastName AS DoctorName,
    s.Name AS SpecialtyName,
    a.ID AS AppointmentID,
    p.FirstName + N' ' + p.LastName AS PatientName,
    a.AppointmentDate,
    a.AppointmentTime,
    a.DurationMinutes,
    a.Status,
    a.ReasonForVisit,
    ISNULL(a.Notes, N'No notes') AS AppointmentNotes,
    DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), a.AppointmentTime) AS MinutesFromNow,
    CASE
        WHEN DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), a.AppointmentTime) < 0 THEN N'Past'
        WHEN DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), a.AppointmentTime) <= 15 THEN N'Imminent'
        ELSE N'Upcoming'
    END AS TimeStatus,
    CASE WHEN a.IsFollowUp = 1 THEN N'Yes' ELSE N'No' END AS IsFollowUpVisit
FROM sample_clinic.Appointment a
INNER JOIN sample_clinic.Doctor d ON d.ID = a.DoctorID
INNER JOIN sample_clinic.Patient p ON p.ID = a.PatientID
INNER JOIN sample_clinic.Specialty s ON s.ID = d.SpecialtyID
WHERE a.AppointmentDate = CAST(GETDATE() AS DATE)
  AND a.Status NOT IN ('Cancelled', 'NoShow');
GO

-- vwPatientHistory - Patient summary with AppointmentCount, DiagnosisCount, TotalBilled, OutstandingBalance
CREATE VIEW sample_clinic.vwPatientHistory AS
SELECT
    p.ID AS PatientID,
    p.FirstName + N' ' + p.LastName AS PatientName,
    p.DateOfBirth,
    YEAR(GETUTCDATE()) - YEAR(p.DateOfBirth) AS ApproxAge,
    p.Gender,
    p.InsuranceProvider,
    COALESCE(p.InsurancePolicyNumber, N'Uninsured') AS PolicyNumber,
    d.FirstName + N' ' + d.LastName AS PrimaryDoctorName,
    (SELECT COUNT(*) FROM sample_clinic.Appointment a WHERE a.PatientID = p.ID) AS AppointmentCount,
    (SELECT COUNT(*) FROM sample_clinic.Diagnosis diag
     INNER JOIN sample_clinic.Appointment a2 ON a2.ID = diag.AppointmentID
     WHERE a2.PatientID = p.ID) AS DiagnosisCount,
    COALESCE((SELECT SUM(b.Amount) FROM sample_clinic.Billing b WHERE b.PatientID = p.ID), 0) AS TotalBilled,
    COALESCE((SELECT SUM(b.PatientResponsibility) FROM sample_clinic.Billing b WHERE b.PatientID = p.ID AND b.PaymentStatus != 'Paid'), 0) AS OutstandingBalance,
    p.RegisteredAt,
    DAY(p.RegisteredAt) AS RegisteredDay
FROM sample_clinic.Patient p
INNER JOIN sample_clinic.Doctor d ON d.ID = p.PrimaryDoctorID;
GO

/* vwRevenueSummary - Monthly RevenueBreakdown with InsuranceSplit and PatientSplit */
CREATE VIEW sample_clinic.vwRevenueSummary AS
SELECT
    YEAR(b.BilledAt) AS BillingYear,
    MONTH(b.BilledAt) AS BillingMonth,
    COUNT(b.ID) AS InvoiceCount,
    ROUND(SUM(b.Amount), 2) AS TotalBilled,
    ROUND(SUM(CASE WHEN b.PaymentStatus = 'Paid' THEN b.Amount ELSE 0 END), 2) AS TotalPaid,
    ROUND(SUM(b.InsuranceCoverage), 2) AS TotalInsurancePaid,
    ROUND(SUM(b.Amount + b.InsuranceCoverage), 2) AS TotalWithCoverage,
    ROUND(SUM(b.PatientResponsibility), 2) AS TotalPatientResponsibility,
    IIF(SUM(b.Amount) > 0,
        ROUND(CAST(SUM(b.InsuranceCoverage) AS DECIMAL(12,2)) / CAST(SUM(b.Amount) AS DECIMAL(12,2)) * 100, 1),
        0
    ) AS InsuranceCoveragePercent,
    CASE
        WHEN SUM(b.Amount) >= 50000 THEN N'High Volume'
        WHEN SUM(b.Amount) >= 20000 THEN N'Medium Volume'
        ELSE N'Low Volume'
    END AS VolumeCategory
FROM sample_clinic.Billing b
GROUP BY YEAR(b.BilledAt), MONTH(b.BilledAt)
HAVING COUNT(b.ID) > 0;
GO

-- vwLabResults - LabTestResults with DoctorName, PatientName, DaysSinceTest using nested DATEDIFF
CREATE VIEW sample_clinic.vwLabResults AS
SELECT
    lr.ID AS LabResultID,
    lr.TestName,
    lr.TestDate,
    lr.ResultValue,
    COALESCE(lr.NormalRange, N'Not specified') AS NormalRange,
    CASE WHEN lr.IsAbnormal = 1 THEN N'Abnormal' ELSE N'Normal' END AS ResultStatus,
    d.FirstName + N' ' + d.LastName AS OrderedByDoctor,
    p.FirstName + N' ' + p.LastName AS PatientName,
    DATEDIFF(DAY, lr.TestDate, CAST(GETUTCDATE() AS DATE)) AS DaysSinceTest,
    CASE
        WHEN DATEDIFF(DAY, lr.TestDate, CAST(GETUTCDATE() AS DATE)) <= 7 THEN N'Recent'
        WHEN DATEDIFF(DAY, lr.TestDate, CAST(GETUTCDATE() AS DATE)) <= 30 THEN N'This Month'
        ELSE N'Older'
    END AS Recency,
    LEN(lr.ResultValue) AS ResultValueLength,
    lr.Notes AS LabNotes,
    lr.ReceivedAt
FROM sample_clinic.LabResult lr
INNER JOIN sample_clinic.Appointment a ON a.ID = lr.AppointmentID
INNER JOIN sample_clinic.Doctor d ON d.ID = lr.OrderedByDoctorID
INNER JOIN sample_clinic.Patient p ON p.ID = a.PatientID;
GO

/* vwAppointmentMetrics - Appointment analytics: StatusBreakdown, AvgDuration, CancellationRate */
CREATE VIEW sample_clinic.vwAppointmentMetrics AS
SELECT
    YEAR(a.AppointmentDate) AS AppointmentYear,
    MONTH(a.AppointmentDate) AS AppointmentMonth,
    COUNT(a.ID) AS TotalAppointments,
    AVG(a.DurationMinutes) AS AvgDurationMinutes,
    SUM(CASE WHEN a.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedCount,
    SUM(CASE WHEN a.Status = 'Cancelled' THEN 1 ELSE 0 END) AS CancelledCount,
    SUM(CASE WHEN a.Status = 'NoShow' THEN 1 ELSE 0 END) AS NoShowCount,
    SUM(CASE WHEN a.IsFollowUp = 1 THEN 1 ELSE 0 END) AS FollowUpCount,
    CAST(
        CASE WHEN COUNT(a.ID) > 0
             THEN ROUND(CAST(SUM(CASE WHEN a.Status = 'Cancelled' THEN 1 ELSE 0 END) AS DECIMAL(10,2))
                        / CAST(COUNT(a.ID) AS DECIMAL(10,2)) * 100, 1)
             ELSE 0
        END AS DECIMAL(5,1)
    ) AS CancellationRate,
    CAST(
        CASE WHEN COUNT(a.ID) > 0
             THEN ROUND(CAST(SUM(CASE WHEN a.IsFollowUp = 1 THEN 1 ELSE 0 END) AS DECIMAL(10,2))
                        / CAST(COUNT(a.ID) AS DECIMAL(10,2)) * 100, 1)
             ELSE 0
        END AS DECIMAL(5,1)
    ) AS FollowUpRate,
    LEN(CAST(COUNT(a.ID) AS VARCHAR(10))) AS DigitCount
FROM sample_clinic.Appointment a
GROUP BY YEAR(a.AppointmentDate), MONTH(a.AppointmentDate);
GO

-- ============================================================
-- Extended Properties
-- ============================================================

-- Tables
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Medical specialization categories for doctors', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Specialty';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Physician records with licensing and fee information', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Doctor';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Patient registration with insurance and emergency contacts', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Patient';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Appointment scheduling with follow-up chain tracking', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Appointment';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Clinical diagnosis records with ICD codes', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Diagnosis';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Medication prescriptions linked to diagnoses', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Prescription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Billing and payment tracking for appointments', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Billing';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Laboratory test results linked to appointments', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'LabResult';
GO

-- Key Columns
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Medical specialty name such as Cardiology or Dermatology', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Specialty', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Doctor state medical license number', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Doctor', @level2type=N'COLUMN', @level2name=N'LicenseNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base consultation fee per appointment', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Doctor', @level2type=N'COLUMN', @level2name=N'ConsultationFee';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether doctor is currently accepting new patients', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Doctor', @level2type=N'COLUMN', @level2name=N'IsAcceptingPatients';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Patient biological sex for medical records', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Patient', @level2type=N'COLUMN', @level2name=N'Gender';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp when patient first registered', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Patient', @level2type=N'COLUMN', @level2name=N'RegisteredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Scheduled time slot for the appointment', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Appointment', @level2type=N'COLUMN', @level2name=N'AppointmentTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current appointment lifecycle status', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Appointment', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-referencing link for follow-up chain', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Appointment', @level2type=N'COLUMN', @level2name=N'PreviousAppointmentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'International Classification of Diseases code', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Diagnosis', @level2type=N'COLUMN', @level2name=N'ICDCode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Diagnosis severity from Mild to Critical', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Diagnosis', @level2type=N'COLUMN', @level2name=N'Severity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of prescription refills allowed', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Prescription', @level2type=N'COLUMN', @level2name=N'Refills';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total service charge amount', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Billing', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Insurance portion of the bill', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Billing', @level2type=N'COLUMN', @level2name=N'InsuranceCoverage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Amount the patient owes after insurance', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Billing', @level2type=N'COLUMN', @level2name=N'PatientResponsibility';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current payment processing status', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'Billing', @level2type=N'COLUMN', @level2name=N'PaymentStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether test result is outside normal range', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'LabResult', @level2type=N'COLUMN', @level2name=N'IsAbnormal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Doctor who ordered the lab test', @level0type=N'SCHEMA', @level0name=N'sample_clinic', @level1type=N'TABLE', @level1name=N'LabResult', @level2type=N'COLUMN', @level2name=N'OrderedByDoctorID';
GO

-- ============================================================
-- Security: Role + GRANT
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'ClinicReader' AND type = 'R')
    CREATE ROLE [ClinicReader];
GO

GRANT SELECT ON SCHEMA::sample_clinic TO [ClinicReader];
GO

-- ============================================================
-- Seed Data
-- ============================================================

-- Specialty (5)
INSERT INTO sample_clinic.Specialty (ID, Name, Description, IsActive) VALUES
    ('10000001-0001-0001-0001-000000000001', N'Cardiology', N'Heart and cardiovascular system disorders', 1),
    ('10000001-0001-0001-0001-000000000002', N'Dermatology', N'Skin, hair, and nail conditions', 1),
    ('10000001-0001-0001-0001-000000000003', N'Orthopedics', N'Musculoskeletal system injuries and diseases', 1),
    ('10000001-0001-0001-0001-000000000004', N'Pediatrics', N'Medical care for infants, children, and adolescents', 1),
    ('10000001-0001-0001-0001-000000000005', N'Neurology', N'Nervous system and brain disorders', 1);
GO

-- Doctor (8)
INSERT INTO sample_clinic.Doctor (ID, FirstName, LastName, Email, Phone, SpecialtyID, LicenseNumber, HireDate, ConsultationFee, IsAcceptingPatients) VALUES
    ('20000001-0001-0001-0001-000000000001', N'Sarah', N'Mitchell', N'sarah.mitchell@clinic.com', '555-1001', '10000001-0001-0001-0001-000000000001', 'MD-2019-0451', '2019-03-15', 250.00, 1),
    ('20000001-0001-0001-0001-000000000002', N'James', N'Park', N'james.park@clinic.com', '555-1002', '10000001-0001-0001-0001-000000000001', 'MD-2018-0322', '2018-06-01', 275.00, 1),
    ('20000001-0001-0001-0001-000000000003', N'Elena', N'Vasquez', N'elena.vasquez@clinic.com', '555-1003', '10000001-0001-0001-0001-000000000002', 'MD-2020-0198', '2020-01-10', 200.00, 1),
    ('20000001-0001-0001-0001-000000000004', N'Robert', N'Chen', N'robert.chen@clinic.com', '555-1004', '10000001-0001-0001-0001-000000000003', 'MD-2017-0567', '2017-09-20', 225.00, 1),
    ('20000001-0001-0001-0001-000000000005', N'Aisha', N'Johnson', N'aisha.johnson@clinic.com', '555-1005', '10000001-0001-0001-0001-000000000003', 'MD-2021-0089', '2021-02-14', 225.00, 1),
    ('20000001-0001-0001-0001-000000000006', N'Michael', N'O''Brien', N'michael.obrien@clinic.com', '555-1006', '10000001-0001-0001-0001-000000000004', 'MD-2016-0734', '2016-04-01', 200.00, 1),
    ('20000001-0001-0001-0001-000000000007', N'Priya', N'Sharma', N'priya.sharma@clinic.com', '555-1007', '10000001-0001-0001-0001-000000000005', 'MD-2019-0612', '2019-08-15', 300.00, 1),
    ('20000001-0001-0001-0001-000000000008', N'David', N'Kim', N'david.kim@clinic.com', '555-1008', '10000001-0001-0001-0001-000000000004', 'MD-2022-0045', '2022-05-01', 195.00, 0);
GO

-- Patient (20)
INSERT INTO sample_clinic.Patient (ID, FirstName, LastName, Email, Phone, DateOfBirth, Gender, Address, EmergencyContactName, EmergencyContactPhone, PrimaryDoctorID, InsuranceProvider, InsurancePolicyNumber, IsActive, Notes) VALUES
    ('30000001-0001-0001-0001-000000000001', N'Alice', N'Thompson', N'alice.t@email.com', '555-2001', '1985-04-12', 'Female', N'123 Oak Street, Suite 4A', N'Bob Thompson', '555-2101', '20000001-0001-0001-0001-000000000001', N'Blue Cross', 'BC-100001', 1, NULL),
    ('30000001-0001-0001-0001-000000000002', N'Marcus', N'Williams', N'marcus.w@email.com', '555-2002', '1978-11-23', 'Male', N'456 Elm Avenue', N'Linda Williams', '555-2102', '20000001-0001-0001-0001-000000000001', N'Aetna', 'AE-200002', 1, N'History of hypertension'),
    ('30000001-0001-0001-0001-000000000003', N'Sofia', N'Garcia', N'sofia.g@email.com', '555-2003', '1992-07-08', 'Female', N'789 Pine Road', N'Carlos Garcia', '555-2103', '20000001-0001-0001-0001-000000000003', N'United Healthcare', 'UH-300003', 1, NULL),
    ('30000001-0001-0001-0001-000000000004', N'Tyler', N'Davis', NULL, '555-2004', '2015-02-14', 'Male', N'321 Maple Lane', N'Jennifer Davis', '555-2104', '20000001-0001-0001-0001-000000000006', N'Cigna', 'CI-400004', 1, N'Pediatric patient, parent consent required'),
    ('30000001-0001-0001-0001-000000000005', N'Hannah', N'Wilson', N'hannah.w@email.com', '555-2005', '1990-09-30', 'Female', NULL, N'David Wilson', '555-2105', '20000001-0001-0001-0001-000000000002', N'Blue Cross', 'BC-500005', 1, NULL),
    ('30000001-0001-0001-0001-000000000006', N'James', N'Brown', N'james.b@email.com', '555-2006', '1965-01-17', 'Male', N'654 Cedar Court', N'Patricia Brown', '555-2106', '20000001-0001-0001-0001-000000000001', N'Medicare', 'MC-600006', 1, N'Diabetes management program'),
    ('30000001-0001-0001-0001-000000000007', N'Olivia', N'Martinez', N'olivia.m@email.com', '555-2007', '1988-12-05', 'Female', N'987 Birch Drive', N'Miguel Martinez', '555-2107', '20000001-0001-0001-0001-000000000004', N'Aetna', 'AE-700007', 1, NULL),
    ('30000001-0001-0001-0001-000000000008', N'Ethan', N'Anderson', NULL, '555-2008', '2018-06-22', 'Male', N'147 Walnut Street', N'Sara Anderson', '555-2108', '20000001-0001-0001-0001-000000000006', N'United Healthcare', 'UH-800008', 1, N'Pediatric asthma patient'),
    ('30000001-0001-0001-0001-000000000009', N'Mia', N'Taylor', N'mia.t@email.com', '555-2009', '1975-03-28', 'Female', N'258 Spruce Avenue', N'Kevin Taylor', '555-2109', '20000001-0001-0001-0001-000000000007', N'Cigna', 'CI-900009', 1, N'Migraine disorder history'),
    ('30000001-0001-0001-0001-000000000010', N'Daniel', N'Lee', N'daniel.l@email.com', '555-2010', '1982-08-15', 'Male', N'369 Ash Boulevard', N'Jenny Lee', '555-2110', '20000001-0001-0001-0001-000000000004', NULL, NULL, 1, N'Self-pay patient, no insurance'),
    ('30000001-0001-0001-0001-000000000011', N'Ava', N'Jackson', N'ava.j@email.com', '555-2011', '1995-05-20', 'Female', N'741 Poplar Way', N'Michael Jackson', '555-2111', '20000001-0001-0001-0001-000000000003', N'Blue Cross', 'BC-110011', 1, NULL),
    ('30000001-0001-0001-0001-000000000012', N'Ryan', N'White', N'ryan.w@email.com', '555-2012', '1970-10-03', 'Male', N'852 Redwood Circle', N'Susan White', '555-2112', '20000001-0001-0001-0001-000000000002', N'Aetna', 'AE-120012', 1, N'Post-cardiac surgery follow-ups'),
    ('30000001-0001-0001-0001-000000000013', N'Emma', N'Harris', N'emma.h@email.com', '555-2013', '2010-11-11', 'Female', NULL, N'Tom Harris', '555-2113', '20000001-0001-0001-0001-000000000006', N'Cigna', 'CI-130013', 1, NULL),
    ('30000001-0001-0001-0001-000000000014', N'Liam', N'Clark', N'liam.c@email.com', '555-2014', '1998-02-27', 'Male', N'963 Sycamore Street', N'Nancy Clark', '555-2114', '20000001-0001-0001-0001-000000000005', N'United Healthcare', 'UH-140014', 1, NULL),
    ('30000001-0001-0001-0001-000000000015', N'Isabella', N'Lewis', N'isabella.l@email.com', '555-2015', '1987-06-14', 'Female', N'174 Hickory Lane', N'George Lewis', '555-2115', '20000001-0001-0001-0001-000000000007', N'Medicare', 'MC-150015', 1, N'Chronic migraine management'),
    ('30000001-0001-0001-0001-000000000016', N'Noah', N'Robinson', N'noah.r@email.com', '555-2016', '1960-12-30', 'Male', N'285 Dogwood Road', N'Helen Robinson', '555-2116', '20000001-0001-0001-0001-000000000001', N'Medicare', 'MC-160016', 1, N'Pacemaker monitoring'),
    ('30000001-0001-0001-0001-000000000017', N'Charlotte', N'Walker', NULL, '555-2017', '1993-04-09', 'Female', N'396 Magnolia Drive', N'Frank Walker', '555-2117', '20000001-0001-0001-0001-000000000002', N'Blue Cross', 'BC-170017', 1, NULL),
    ('30000001-0001-0001-0001-000000000018', N'Lucas', N'Hall', N'lucas.h@email.com', '555-2018', '2012-08-18', 'Male', N'507 Willow Court', N'Anna Hall', '555-2118', '20000001-0001-0001-0001-000000000008', N'Aetna', 'AE-180018', 1, N'Pediatric wellness check schedule'),
    ('30000001-0001-0001-0001-000000000019', N'Amelia', N'Young', N'amelia.y@email.com', '555-2019', '1980-07-25', 'Female', N'618 Cypress Avenue', N'Jack Young', '555-2119', '20000001-0001-0001-0001-000000000005', N'Cigna', 'CI-190019', 1, NULL),
    ('30000001-0001-0001-0001-000000000020', N'Benjamin', N'King', N'benjamin.k@email.com', '555-2020', '1955-01-02', 'Male', N'729 Juniper Terrace', N'Martha King', '555-2120', '20000001-0001-0001-0001-000000000007', NULL, NULL, 1, N'Self-pay, neurological eval pending');
GO

-- Appointment (40) - Mix of statuses, TIME values, some follow-ups
INSERT INTO sample_clinic.Appointment (ID, PatientID, DoctorID, AppointmentDate, AppointmentTime, DurationMinutes, Status, ReasonForVisit, Notes, IsFollowUp, PreviousAppointmentID) VALUES
    ('40000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-01-15', '09:00', 30, 'Completed', N'Annual cardiac check-up', N'EKG normal, blood pressure slightly elevated', 0, NULL),
    ('40000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', '2026-01-15', '09:30', 45, 'Completed', N'Hypertension follow-up', N'Medication adjusted', 0, NULL),
    ('40000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', '2026-01-16', '10:00', 30, 'Completed', N'Skin rash evaluation', N'Prescribed topical cream', 0, NULL),
    ('40000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', '2026-01-16', '10:30', 30, 'Completed', N'Pediatric wellness check', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000005', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-01-17', '11:00', 30, 'Completed', N'Chest pain evaluation', N'Stress test recommended', 0, NULL),
    ('40000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', '2026-01-17', '14:00', 45, 'Completed', N'Diabetes and cardiac review', N'A1C levels improved', 0, NULL),
    ('40000001-0001-0001-0001-000000000007', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-01-20', '08:30', 30, 'Completed', N'Knee pain assessment', N'X-ray ordered', 0, NULL),
    ('40000001-0001-0001-0001-000000000008', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', '2026-01-20', '09:00', 30, 'Completed', N'Asthma management review', N'Inhaler technique reviewed', 0, NULL),
    ('40000001-0001-0001-0001-000000000009', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', '2026-01-21', '10:00', 45, 'Completed', N'Migraine consultation', N'New preventive medication started', 0, NULL),
    ('40000001-0001-0001-0001-000000000010', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', '2026-01-21', '11:00', 30, 'Completed', N'Shoulder injury evaluation', NULL, 0, NULL);
GO

-- Appointments 11-20 (more completed + cancelled + follow-ups)
INSERT INTO sample_clinic.Appointment (ID, PatientID, DoctorID, AppointmentDate, AppointmentTime, DurationMinutes, Status, ReasonForVisit, Notes, IsFollowUp, PreviousAppointmentID) VALUES
    ('40000001-0001-0001-0001-000000000011', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-01-29', '09:00', 30, 'Completed', N'Blood pressure follow-up', N'BP normalized on new dosage', 1, '40000001-0001-0001-0001-000000000001'),
    ('40000001-0001-0001-0001-000000000012', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-01-31', '11:00', 60, 'Completed', N'Stress test results review', N'Results within normal limits', 1, '40000001-0001-0001-0001-000000000005'),
    ('40000001-0001-0001-0001-000000000013', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', '2026-02-03', '09:30', 30, 'Completed', N'Acne treatment consultation', N'Started oral medication', 0, NULL),
    ('40000001-0001-0001-0001-000000000014', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', '2026-02-03', '14:00', 45, 'Completed', N'Post-surgery cardiac check', N'Healing well, echo normal', 0, NULL),
    ('40000001-0001-0001-0001-000000000015', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-02-05', '08:30', 30, 'Completed', N'Knee X-ray review', N'Mild arthritis, physical therapy recommended', 1, '40000001-0001-0001-0001-000000000007'),
    ('40000001-0001-0001-0001-000000000016', '30000001-0001-0001-0001-000000000013', '20000001-0001-0001-0001-000000000006', '2026-02-05', '10:00', 30, 'Cancelled', N'Annual checkup', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000017', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', '2026-02-07', '15:00', 30, 'Completed', N'Sports injury assessment', N'MRI ordered for torn ligament suspicion', 0, NULL),
    ('40000001-0001-0001-0001-000000000018', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', '2026-02-07', '16:00', 45, 'Completed', N'Migraine pattern review', N'Botox treatment discussed', 1, '40000001-0001-0001-0001-000000000009'),
    ('40000001-0001-0001-0001-000000000019', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', '2026-02-10', '09:00', 45, 'Completed', N'Pacemaker monitoring', N'Device functioning normally', 0, NULL),
    ('40000001-0001-0001-0001-000000000020', '30000001-0001-0001-0001-000000000017', '20000001-0001-0001-0001-000000000002', '2026-02-10', '10:30', 30, 'NoShow', N'Cardiac screening', NULL, 0, NULL);
GO

-- Appointments 21-30
INSERT INTO sample_clinic.Appointment (ID, PatientID, DoctorID, AppointmentDate, AppointmentTime, DurationMinutes, Status, ReasonForVisit, Notes, IsFollowUp, PreviousAppointmentID) VALUES
    ('40000001-0001-0001-0001-000000000021', '30000001-0001-0001-0001-000000000018', '20000001-0001-0001-0001-000000000008', '2026-02-12', '09:00', 30, 'Completed', N'Pediatric growth check', N'Height and weight on track', 0, NULL),
    ('40000001-0001-0001-0001-000000000022', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', '2026-02-12', '13:00', 30, 'Completed', N'Back pain evaluation', N'Physical therapy prescribed', 0, NULL),
    ('40000001-0001-0001-0001-000000000023', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', '2026-02-14', '10:00', 60, 'Completed', N'Neurological evaluation', N'Full neurological exam performed', 0, NULL),
    ('40000001-0001-0001-0001-000000000024', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', '2026-02-14', '14:30', 30, 'Completed', N'Hypertension medication review', N'Dosage maintained, BP well controlled', 1, '40000001-0001-0001-0001-000000000002'),
    ('40000001-0001-0001-0001-000000000025', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', '2026-02-17', '09:00', 30, 'Cancelled', N'Skin rash follow-up', NULL, 1, '40000001-0001-0001-0001-000000000003'),
    ('40000001-0001-0001-0001-000000000026', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', '2026-02-17', '15:00', 30, 'Completed', N'MRI results review', N'Partial ligament tear confirmed, brace prescribed', 1, '40000001-0001-0001-0001-000000000017'),
    ('40000001-0001-0001-0001-000000000027', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', '2026-02-19', '09:00', 45, 'Completed', N'Quarterly diabetes check', N'Blood glucose well managed', 0, NULL),
    ('40000001-0001-0001-0001-000000000028', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', '2026-02-19', '11:00', 30, 'Completed', N'Shoulder therapy progress', N'Range of motion improving', 1, '40000001-0001-0001-0001-000000000010'),
    ('40000001-0001-0001-0001-000000000029', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', '2026-02-20', '10:00', 30, 'Completed', N'Migraine medication adjustment', N'Reduced frequency noted', 1, '40000001-0001-0001-0001-000000000018'),
    ('40000001-0001-0001-0001-000000000030', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', '2026-02-20', '14:00', 30, 'Completed', N'Cardiac rehab progress', N'Exercise tolerance improved significantly', 1, '40000001-0001-0001-0001-000000000014');
GO

-- Appointments 31-40 (today + future, scheduled/confirmed)
INSERT INTO sample_clinic.Appointment (ID, PatientID, DoctorID, AppointmentDate, AppointmentTime, DurationMinutes, Status, ReasonForVisit, Notes, IsFollowUp, PreviousAppointmentID) VALUES
    ('40000001-0001-0001-0001-000000000031', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-02-23', '09:00', 30, 'Confirmed', N'Blood pressure recheck', NULL, 1, '40000001-0001-0001-0001-000000000011'),
    ('40000001-0001-0001-0001-000000000032', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-02-23', '09:30', 30, 'Confirmed', N'Annual cardiac review', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000033', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', '2026-02-23', '10:00', 30, 'Scheduled', N'Vaccination update', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000034', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', '2026-02-23', '10:30', 30, 'Scheduled', N'Acne treatment follow-up', NULL, 1, '40000001-0001-0001-0001-000000000013'),
    ('40000001-0001-0001-0001-000000000035', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', '2026-02-23', '14:00', 45, 'InProgress', N'Pacemaker quarterly check', NULL, 1, '40000001-0001-0001-0001-000000000019'),
    ('40000001-0001-0001-0001-000000000036', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', '2026-02-23', '15:00', 60, 'Scheduled', N'Neurological follow-up', NULL, 1, '40000001-0001-0001-0001-000000000023'),
    ('40000001-0001-0001-0001-000000000037', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-02-25', '08:30', 30, 'Scheduled', N'Knee therapy review', NULL, 1, '40000001-0001-0001-0001-000000000015'),
    ('40000001-0001-0001-0001-000000000038', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', '2026-02-25', '13:00', 30, 'Scheduled', N'Back pain progress', NULL, 1, '40000001-0001-0001-0001-000000000022'),
    ('40000001-0001-0001-0001-000000000039', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', '2026-02-26', '09:00', 30, 'Scheduled', N'Asthma check-up', NULL, 1, '40000001-0001-0001-0001-000000000008'),
    ('40000001-0001-0001-0001-000000000040', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', '2026-02-27', '10:00', 45, 'Scheduled', N'Migraine Botox treatment', NULL, 1, '40000001-0001-0001-0001-000000000029');
GO

-- Diagnosis (25)
INSERT INTO sample_clinic.Diagnosis (ID, AppointmentID, ICDCode, Description, Severity, Notes) VALUES
    ('50000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', 'I10', N'Essential hypertension', 'Mild', N'Borderline elevated, lifestyle changes recommended'),
    ('50000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000002', 'I10', N'Essential hypertension', 'Moderate', N'Medication dosage increased'),
    ('50000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000003', 'L30.9', N'Dermatitis, unspecified', 'Mild', NULL),
    ('50000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000005', 'R07.9', N'Chest pain, unspecified', 'Moderate', N'Stress test ordered'),
    ('50000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000006', 'E11.65', N'Type 2 diabetes mellitus with hyperglycemia', 'Moderate', N'A1C improved from 7.8 to 7.1'),
    ('50000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000007', 'M17.11', N'Primary osteoarthritis, right knee', 'Moderate', N'Physical therapy referral'),
    ('50000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000008', 'J45.20', N'Mild intermittent asthma, uncomplicated', 'Mild', N'Technique correction helped'),
    ('50000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000009', 'G43.909', N'Migraine, unspecified, not intractable', 'Severe', N'Preventive medication prescribed'),
    ('50000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000010', 'M75.111', N'Incomplete rotator cuff tear of right shoulder', 'Moderate', N'Conservative treatment recommended'),
    ('50000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000011', 'I10', N'Essential hypertension, controlled', 'Mild', N'Blood pressure normalized'),
    ('50000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000013', 'L70.0', N'Acne vulgaris', 'Moderate', N'Started isotretinoin'),
    ('50000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000014', 'Z95.1', N'Presence of aortocoronary bypass graft', 'Mild', N'Post-surgical recovery progressing well'),
    ('50000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000015', 'M17.11', N'Primary osteoarthritis, right knee', 'Moderate', N'PT showing improvement'),
    ('50000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000017', 'S83.511', N'Sprain of anterior cruciate ligament of right knee', 'Severe', N'MRI confirms partial tear'),
    ('50000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000018', 'G43.909', N'Migraine, chronic', 'Severe', N'Botox candidacy evaluation positive'),
    ('50000001-0001-0001-0001-000000000016', '40000001-0001-0001-0001-000000000019', 'Z95.0', N'Presence of cardiac pacemaker', 'Mild', N'Device check satisfactory'),
    ('50000001-0001-0001-0001-000000000017', '40000001-0001-0001-0001-000000000022', 'M54.5', N'Low back pain', 'Moderate', N'Physical therapy prescribed'),
    ('50000001-0001-0001-0001-000000000018', '40000001-0001-0001-0001-000000000023', 'G40.909', N'Epilepsy, unspecified, evaluation', 'Severe', N'Full workup ordered'),
    ('50000001-0001-0001-0001-000000000019', '40000001-0001-0001-0001-000000000024', 'I10', N'Hypertension maintenance', 'Mild', N'Well controlled on current meds'),
    ('50000001-0001-0001-0001-000000000020', '40000001-0001-0001-0001-000000000026', 'S83.511', N'ACL partial tear follow-up', 'Moderate', N'Brace fitted, rehab started'),
    ('50000001-0001-0001-0001-000000000021', '40000001-0001-0001-0001-000000000027', 'E11.65', N'Type 2 diabetes quarterly review', 'Mild', N'A1C stable at 6.9'),
    ('50000001-0001-0001-0001-000000000022', '40000001-0001-0001-0001-000000000028', 'M75.111', N'Rotator cuff tear progress', 'Mild', N'Range of motion 80 percent restored'),
    ('50000001-0001-0001-0001-000000000023', '40000001-0001-0001-0001-000000000029', 'G43.909', N'Migraine frequency reduced', 'Moderate', N'From 15 to 8 days per month'),
    ('50000001-0001-0001-0001-000000000024', '40000001-0001-0001-0001-000000000030', 'Z95.1', N'Cardiac rehab milestone', 'Mild', N'Exercise capacity significantly improved'),
    ('50000001-0001-0001-0001-000000000025', '40000001-0001-0001-0001-000000000021', 'Z00.00', N'General pediatric examination', 'Mild', NULL);
GO

-- Prescription (20)
INSERT INTO sample_clinic.Prescription (ID, DiagnosisID, MedicationName, Dosage, Frequency, DurationDays, Quantity, Refills, IsActive) VALUES
    ('60000001-0001-0001-0001-000000000001', '50000001-0001-0001-0001-000000000001', N'Lisinopril', N'10mg', N'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000002', '50000001-0001-0001-0001-000000000002', N'Amlodipine', N'5mg', N'Once daily', 30, 30, 2, 1),
    ('60000001-0001-0001-0001-000000000003', '50000001-0001-0001-0001-000000000003', N'Hydrocortisone cream', N'1% topical', N'Twice daily', 14, 1, 0, 0),
    ('60000001-0001-0001-0001-000000000004', '50000001-0001-0001-0001-000000000005', N'Metformin', N'500mg', N'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000005', '50000001-0001-0001-0001-000000000005', N'Glipizide', N'5mg', N'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000006', '50000001-0001-0001-0001-000000000006', N'Ibuprofen', N'400mg', N'Three times daily', 14, 42, 1, 0),
    ('60000001-0001-0001-0001-000000000007', '50000001-0001-0001-0001-000000000007', N'Albuterol inhaler', N'90mcg', N'As needed', 30, 1, 5, 1),
    ('60000001-0001-0001-0001-000000000008', '50000001-0001-0001-0001-000000000008', N'Topiramate', N'25mg', N'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000009', '50000001-0001-0001-0001-000000000008', N'Sumatriptan', N'50mg', N'As needed for acute migraine', 30, 9, 2, 1),
    ('60000001-0001-0001-0001-000000000010', '50000001-0001-0001-0001-000000000009', N'Naproxen', N'500mg', N'Twice daily', 14, 28, 0, 0),
    ('60000001-0001-0001-0001-000000000011', '50000001-0001-0001-0001-000000000011', N'Isotretinoin', N'20mg', N'Once daily', 180, 180, 0, 1),
    ('60000001-0001-0001-0001-000000000012', '50000001-0001-0001-0001-000000000014', N'Acetaminophen', N'500mg', N'Every 6 hours as needed', 14, 56, 1, 1),
    ('60000001-0001-0001-0001-000000000013', '50000001-0001-0001-0001-000000000015', N'Amitriptyline', N'10mg', N'At bedtime', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000014', '50000001-0001-0001-0001-000000000017', N'Cyclobenzaprine', N'10mg', N'Three times daily', 14, 42, 0, 1),
    ('60000001-0001-0001-0001-000000000015', '50000001-0001-0001-0001-000000000018', N'Levetiracetam', N'500mg', N'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000016', '50000001-0001-0001-0001-000000000019', N'Lisinopril', N'10mg', N'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000017', '50000001-0001-0001-0001-000000000020', N'Acetaminophen', N'500mg', N'As needed', 30, 60, 1, 1),
    ('60000001-0001-0001-0001-000000000018', '50000001-0001-0001-0001-000000000021', N'Metformin', N'500mg', N'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000019', '50000001-0001-0001-0001-000000000023', N'Sumatriptan', N'50mg', N'As needed', 30, 9, 2, 1),
    ('60000001-0001-0001-0001-000000000020', '50000001-0001-0001-0001-000000000025', N'Vitamin D', N'1000 IU', N'Once daily', 90, 90, 4, 1);
GO

-- Billing (30)
INSERT INTO sample_clinic.Billing (ID, AppointmentID, PatientID, DoctorID, ServiceDescription, Amount, InsuranceCoverage, PatientResponsibility, PaymentStatus, PaidAt, PaymentMethod) VALUES
    ('70000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', N'Cardiac consultation with EKG', 350.00, 280.00, 70.00, 'Paid', '2026-01-30', 'Card'),
    ('70000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', N'Hypertension management visit', 250.00, 200.00, 50.00, 'Paid', '2026-01-30', 'Card'),
    ('70000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', N'Dermatology consultation', 200.00, 160.00, 40.00, 'Paid', '2026-01-31', 'Card'),
    ('70000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', N'Pediatric wellness visit', 175.00, 140.00, 35.00, 'Paid', '2026-01-31', 'Card'),
    ('70000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000005', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', N'Chest pain evaluation and stress test order', 400.00, 320.00, 80.00, 'Paid', '2026-02-01', 'Card'),
    ('70000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', N'Diabetes and cardiac comprehensive review', 375.00, 337.50, 37.50, 'Paid', '2026-02-01', 'Check'),
    ('70000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000007', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', N'Orthopedic knee consultation with X-ray', 325.00, 260.00, 65.00, 'Paid', '2026-02-03', 'Card'),
    ('70000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000008', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', N'Pediatric asthma management', 175.00, 140.00, 35.00, 'Paid', '2026-02-03', 'Card'),
    ('70000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000009', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', N'Neurology migraine consultation', 450.00, 360.00, 90.00, 'Paid', '2026-02-04', 'Card'),
    ('70000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000010', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', N'Shoulder injury evaluation', 225.00, 0, 225.00, 'Paid', '2026-02-04', 'Cash'),
    ('70000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000011', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', N'Blood pressure follow-up', 150.00, 120.00, 30.00, 'Paid', '2026-02-05', 'Card'),
    ('70000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000012', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', N'Stress test results consultation', 300.00, 240.00, 60.00, 'Paid', '2026-02-05', 'Card'),
    ('70000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000013', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', N'Acne treatment consultation', 200.00, 160.00, 40.00, 'Paid', '2026-02-07', 'Card'),
    ('70000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000014', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', N'Post-surgery cardiac assessment', 500.00, 400.00, 100.00, 'Paid', '2026-02-07', 'Card'),
    ('70000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000015', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', N'Knee arthritis follow-up', 225.00, 180.00, 45.00, 'Paid', '2026-02-10', 'Card'),
    ('70000001-0001-0001-0001-000000000016', '40000001-0001-0001-0001-000000000017', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', N'Sports injury with MRI order', 425.00, 340.00, 85.00, 'Paid', '2026-02-10', 'Card'),
    ('70000001-0001-0001-0001-000000000017', '40000001-0001-0001-0001-000000000018', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', N'Migraine pattern review and Botox eval', 450.00, 337.50, 112.50, 'Paid', '2026-02-12', 'Card'),
    ('70000001-0001-0001-0001-000000000018', '40000001-0001-0001-0001-000000000019', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', N'Pacemaker monitoring visit', 500.00, 450.00, 50.00, 'Paid', '2026-02-14', 'Card'),
    ('70000001-0001-0001-0001-000000000019', '40000001-0001-0001-0001-000000000021', '30000001-0001-0001-0001-000000000018', '20000001-0001-0001-0001-000000000008', N'Pediatric growth assessment', 175.00, 140.00, 35.00, 'Paid', '2026-02-14', 'Card'),
    ('70000001-0001-0001-0001-000000000020', '40000001-0001-0001-0001-000000000022', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', N'Back pain evaluation and therapy referral', 225.00, 180.00, 45.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000021', '40000001-0001-0001-0001-000000000023', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', N'Comprehensive neurological evaluation', 600.00, 0, 600.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000022', '40000001-0001-0001-0001-000000000024', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', N'Hypertension follow-up', 150.00, 120.00, 30.00, 'Paid', '2026-02-17', 'Card'),
    ('70000001-0001-0001-0001-000000000023', '40000001-0001-0001-0001-000000000026', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', N'MRI results and brace fitting', 350.00, 280.00, 70.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000024', '40000001-0001-0001-0001-000000000027', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', N'Diabetes quarterly management', 275.00, 247.50, 27.50, 'Paid', '2026-02-21', 'Card'),
    ('70000001-0001-0001-0001-000000000025', '40000001-0001-0001-0001-000000000028', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', N'Shoulder therapy progress check', 225.00, 0, 225.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000026', '40000001-0001-0001-0001-000000000029', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', N'Migraine medication adjustment visit', 300.00, 240.00, 60.00, 'Paid', '2026-02-22', 'Card'),
    ('70000001-0001-0001-0001-000000000027', '40000001-0001-0001-0001-000000000030', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', N'Cardiac rehabilitation progress', 350.00, 280.00, 70.00, 'Denied', NULL, NULL),
    ('70000001-0001-0001-0001-000000000028', '40000001-0001-0001-0001-000000000031', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', N'Blood pressure recheck', 150.00, 120.00, 30.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000029', '40000001-0001-0001-0001-000000000032', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', N'Annual cardiac review', 275.00, 220.00, 55.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000030', '40000001-0001-0001-0001-000000000035', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', N'Pacemaker quarterly check', 500.00, 450.00, 50.00, 'Pending', NULL, NULL);
GO

-- LabResult (15)
INSERT INTO sample_clinic.LabResult (ID, AppointmentID, TestName, TestDate, ResultValue, NormalRange, IsAbnormal, OrderedByDoctorID, Notes) VALUES
    ('80000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', N'Complete Blood Count', '2026-01-15', N'WBC: 7.2 x10^9/L', N'4.5-11.0 x10^9/L', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000001', N'Lipid Panel', '2026-01-15', N'Total Cholesterol: 215 mg/dL', N'< 200 mg/dL', 1, '20000001-0001-0001-0001-000000000001', N'Slightly elevated, dietary counseling recommended'),
    ('80000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000002', N'Basic Metabolic Panel', '2026-01-15', N'Potassium: 4.1 mEq/L', N'3.5-5.0 mEq/L', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000005', N'Troponin I', '2026-01-17', N'< 0.04 ng/mL', N'< 0.04 ng/mL', 0, '20000001-0001-0001-0001-000000000002', N'Normal, rules out MI'),
    ('80000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000006', N'HbA1c', '2026-01-17', N'7.1%', N'< 5.7% (normal), < 7% (diabetic goal)', 1, '20000001-0001-0001-0001-000000000001', N'Improved from 7.8 percent'),
    ('80000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000009', N'MRI Brain', '2026-01-22', N'No structural abnormalities', NULL, 0, '20000001-0001-0001-0001-000000000007', N'Clear scan, migraine not structural'),
    ('80000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000012', N'Stress Test ECG', '2026-01-31', N'Duke score: +5', N'> +5 low risk', 0, '20000001-0001-0001-0001-000000000002', N'Normal exercise capacity, no ST changes'),
    ('80000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000014', N'Echocardiogram', '2026-02-03', N'EF: 55%', N'55-70%', 0, '20000001-0001-0001-0001-000000000002', N'Normal ejection fraction post-surgery'),
    ('80000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000017', N'MRI Right Knee', '2026-02-08', N'Partial ACL tear, grade II', NULL, 1, '20000001-0001-0001-0001-000000000005', N'Surgical consult recommended if conservative treatment fails'),
    ('80000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000023', N'EEG', '2026-02-14', N'Focal epileptiform activity left temporal', NULL, 1, '20000001-0001-0001-0001-000000000007', N'Consistent with focal epilepsy'),
    ('80000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000024', N'Basic Metabolic Panel', '2026-02-14', N'All values within range', N'Reference ranges met', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000027', N'HbA1c', '2026-02-19', N'6.9%', N'< 7% (diabetic goal)', 0, '20000001-0001-0001-0001-000000000001', N'Reached target, maintain current therapy'),
    ('80000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000019', N'Pacemaker Interrogation', '2026-02-10', N'Battery 85%, lead impedance normal', NULL, 0, '20000001-0001-0001-0001-000000000001', N'All parameters within normal limits'),
    ('80000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000021', N'CBC with differential', '2026-02-12', N'All counts normal', N'Age-adjusted reference', 0, '20000001-0001-0001-0001-000000000008', N'Routine pediatric screening'),
    ('80000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000030', N'BNP', '2026-02-20', N'45 pg/mL', N'< 100 pg/mL', 0, '20000001-0001-0001-0001-000000000002', N'Heart failure markers within normal range');
GO
