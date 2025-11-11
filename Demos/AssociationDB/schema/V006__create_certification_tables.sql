/******************************************************************************
 * Association Sample Database - Certifications/Credentials Domain
 * File: V006__create_certification_tables.sql
 *
 * This file creates the Certifications and Credentials tables for professional
 * development tracking. All tables use the [AssociationDemo] schema prefix.
 *
 * Domain: Certifications/Credentials/Professional Development
 * - AccreditingBody: Organizations that grant certifications
 * - CertificationType: Types of certifications available
 * - Certification: Individual certifications earned by members
 * - CertificationRequirement: Prerequisites and requirements
 * - CertificationRenewal: Renewal tracking and history
 * - ContinuingEducation: CE credits and training records
 *
 * Total Tables: 6
 ******************************************************************************/

-- ============================================================================
-- CERTIFICATIONS/CREDENTIALS DOMAIN
-- ============================================================================

-- ============================================================================
-- AccreditingBody Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[AccreditingBody] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Abbreviation] NVARCHAR(50),
    [Description] NVARCHAR(MAX),
    [Website] NVARCHAR(500),
    [ContactEmail] NVARCHAR(255),
    [ContactPhone] NVARCHAR(50),
    [IsActive] BIT DEFAULT 1,
    [IsRecognized] BIT DEFAULT 1,
    [EstablishedDate] DATE,
    [Country] NVARCHAR(100),
    [CertificationCount] INT DEFAULT 0
);
GO

-- ============================================================================
-- CertificationType Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CertificationType] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AccreditingBodyID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Abbreviation] NVARCHAR(50),
    [Description] NVARCHAR(MAX),
    [Level] NVARCHAR(50) CHECK ([Level] IN ('Entry', 'Intermediate', 'Advanced', 'Master', 'Specialty')),
    [DurationMonths] INT,
    [RenewalRequiredMonths] INT,
    [CECreditsRequired] INT DEFAULT 0,
    [ExamRequired] BIT DEFAULT 0,
    [PracticalRequired] BIT DEFAULT 0,
    [CostUSD] DECIMAL(10,2),
    [IsActive] BIT DEFAULT 1,
    [Prerequisites] NVARCHAR(MAX),
    [TargetAudience] NVARCHAR(500),
    [CertificationCount] INT DEFAULT 0,
    CONSTRAINT FK_CertificationType_AccreditingBody FOREIGN KEY ([AccreditingBodyID])
        REFERENCES [AssociationDemo].[AccreditingBody]([ID])
);
GO

-- ============================================================================
-- Certification Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Certification] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [CertificationTypeID] UNIQUEIDENTIFIER NOT NULL,
    [CertificationNumber] NVARCHAR(100),
    [DateEarned] DATE NOT NULL,
    [DateExpires] DATE,
    [Status] NVARCHAR(50) DEFAULT 'Active' CHECK ([Status] IN ('Active', 'Expired', 'Suspended', 'Revoked', 'Pending Renewal', 'In Progress')),
    [Score] INT,
    [Notes] NVARCHAR(MAX),
    [VerificationURL] NVARCHAR(500),
    [IssuedBy] NVARCHAR(255),
    [LastRenewalDate] DATE,
    [NextRenewalDate] DATE,
    [CECreditsEarned] INT DEFAULT 0,
    [RenewalCount] INT DEFAULT 0,
    CONSTRAINT FK_Certification_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_Certification_CertificationType FOREIGN KEY ([CertificationTypeID])
        REFERENCES [AssociationDemo].[CertificationType]([ID])
);
GO

-- ============================================================================
-- CertificationRequirement Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CertificationRequirement] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CertificationTypeID] UNIQUEIDENTIFIER NOT NULL,
    [RequirementType] NVARCHAR(100) NOT NULL CHECK ([RequirementType] IN ('Education', 'Experience', 'Examination', 'Prerequisites', 'Documentation', 'Reference', 'Training', 'Other')),
    [Description] NVARCHAR(MAX) NOT NULL,
    [IsRequired] BIT DEFAULT 1,
    [DisplayOrder] INT DEFAULT 0,
    [Details] NVARCHAR(MAX),
    CONSTRAINT FK_CertificationRequirement_CertificationType FOREIGN KEY ([CertificationTypeID])
        REFERENCES [AssociationDemo].[CertificationType]([ID])
);
GO

-- ============================================================================
-- CertificationRenewal Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CertificationRenewal] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CertificationID] UNIQUEIDENTIFIER NOT NULL,
    [RenewalDate] DATE NOT NULL,
    [ExpirationDate] DATE NOT NULL,
    [CECreditsApplied] INT DEFAULT 0,
    [FeePaid] DECIMAL(10,2),
    [PaymentDate] DATE,
    [Status] NVARCHAR(50) DEFAULT 'Completed' CHECK ([Status] IN ('Completed', 'Pending', 'Rejected', 'Late')),
    [Notes] NVARCHAR(MAX),
    [ProcessedBy] NVARCHAR(255),
    [ProcessedDate] DATE,
    CONSTRAINT FK_CertificationRenewal_Certification FOREIGN KEY ([CertificationID])
        REFERENCES [AssociationDemo].[Certification]([ID])
);
GO

-- ============================================================================
-- ContinuingEducation Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ContinuingEducation] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [CertificationID] UNIQUEIDENTIFIER,
    [ActivityTitle] NVARCHAR(500) NOT NULL,
    [ActivityType] NVARCHAR(100) NOT NULL CHECK ([ActivityType] IN ('Course', 'Workshop', 'Conference', 'Webinar', 'Self-Study', 'Publication', 'Presentation', 'Teaching', 'Other')),
    [Provider] NVARCHAR(255),
    [CompletionDate] DATE NOT NULL,
    [CreditsEarned] DECIMAL(5,2) NOT NULL,
    [CreditsType] NVARCHAR(50) DEFAULT 'CE' CHECK ([CreditsType] IN ('CE', 'CEU', 'PDH', 'CPE', 'CME', 'Other')),
    [HoursSpent] DECIMAL(5,2),
    [VerificationCode] NVARCHAR(100),
    [Status] NVARCHAR(50) DEFAULT 'Approved' CHECK ([Status] IN ('Approved', 'Pending', 'Rejected', 'Expired')),
    [Notes] NVARCHAR(MAX),
    [DocumentURL] NVARCHAR(500),
    CONSTRAINT FK_ContinuingEducation_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_ContinuingEducation_Certification FOREIGN KEY ([CertificationID])
        REFERENCES [AssociationDemo].[Certification]([ID])
);
GO
