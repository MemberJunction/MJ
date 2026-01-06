-- Database Documentation Script
-- Generated: 2025-12-17T17:09:57.934Z
-- Database: mj_test
-- Server: sqlserver.local

-- This script adds MS_Description extended properties to database objects


-- Schema: AssociationDemo

-- Table: AssociationDemo.AccreditingBody
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the master registry of accrediting/issuing bodies (primarily in the dairy and food safety domain) that own certification programs. In addition to identity and contact details, it anchors a multi-organization catalog: each body can own multiple certification types/programs, with program policies (e.g., levels, renewal/recertification rules, and continuing-education requirements) managed per body. It serves as the parent entity referenced by certification-related tables to link records to their owning body and to support aggregates such as CertificationCount.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System-generated unique identifier for the accrediting body.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the accrediting organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'Abbreviation'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'Abbreviation';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short acronym or initialism for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'Abbreviation';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Summary of the organization''s purpose and focus areas.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary website URL for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'ContactEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'ContactEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'General contact email address for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'ContactEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'ContactPhone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'ContactPhone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary contact phone number for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'ContactPhone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the accrediting body is active/usable in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'IsRecognized'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'IsRecognized';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flags whether the organization is recognized/approved by the association for accreditation purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'IsRecognized';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'EstablishedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'EstablishedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the organization was founded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'EstablishedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country where the organization is based.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AccreditingBody'
    AND c.name = 'CertificationCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AccreditingBody',
        @level2type = N'COLUMN',
        @level2name = N'CertificationCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized count of certifications or certification types associated with this accrediting body (likely maintained by application logic).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AccreditingBody',
    @level2type = N'COLUMN',
    @level2name = N'CertificationCount';
GO

-- Table: AssociationDemo.AdvocacyAction
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Logs individual advocacy and government-relations interactions performed by members regarding specific legislative or regulatory issues, directed to particular government contacts. Each record captures the action type, date, narrative details, outcome, and follow-up planning.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the advocacy action record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'LegislativeIssueID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'LegislativeIssueID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the legislative or regulatory issue the action pertains to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'LegislativeIssueID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who performed or logged the advocacy action.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'GovernmentContactID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'GovernmentContactID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the government official or public-sector contact who was the target of the action.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'GovernmentContactID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'ActionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'ActionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes the outreach method (e.g., Email, Phone Call, Letter, Meeting, Testimony, Social Media, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'ActionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'ActionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'ActionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the advocacy action occurred or was logged.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'ActionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Narrative details describing the action’s content or context.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'Outcome'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'Outcome';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recorded result of the action (e.g., acknowledgment received, follow-up scheduled).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'Outcome';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'FollowUpRequired'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'FollowUpRequired';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether a follow-up is needed for this action.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'FollowUpRequired';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'FollowUpDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'FollowUpDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Planned date for the follow-up action, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'FollowUpDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'AdvocacyAction'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'AdvocacyAction',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional internal notes or comments related to the action.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'AdvocacyAction',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO

-- Table: AssociationDemo.BoardMember
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the history of which association members hold which board positions, including start/end of terms, election dates, and whether the assignment is currently active. It links a person to a governance role for a specific term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the board assignment record (a specific member serving in a specific board position for a term).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'BoardPositionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'BoardPositionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the board position (e.g., President, Treasurer) that the member is assigned to for this term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'BoardPositionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who is serving in the specified board position for this term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member’s term in the board position begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member’s term ends; null indicates the term is ongoing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this board assignment is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'ElectionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'ElectionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member was elected to the board position for this term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'ElectionDate';
GO

-- Table: AssociationDemo.BoardPosition
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the master list of governance roles (e.g., President, Vice President, Treasurer, Secretary, Directors at Large) with display order, officer flag, default/typical term length, and active status. It is referenced by AssociationDemo.BoardMember to assign members to roles. Positions are filled on an annual cycle with terms typically beginning around mid-November; about nine positions are active each cycle, reflecting a fixed slate of roles with a typical one-year term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the board position record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'PositionTitle'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'PositionTitle';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable title of the board position (e.g., President, Treasurer, Director at Large #1).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'PositionTitle';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'PositionOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'PositionOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric sort or precedence order for displaying or ranking positions.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'PositionOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional extended description of the position’s responsibilities or notes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'TermLengthYears'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'TermLengthYears';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Typical term length in years for the position.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'TermLengthYears';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'IsOfficer'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'IsOfficer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the position is an officer role.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'IsOfficer';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flags whether the position is currently in use.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Campaign
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores marketing/engagement campaign definitions—including name, type, status, scheduled dates, budgeted/actual costs, and descriptive metadata—used to coordinate member outreach, events, and course launches. Serves as the optional parent for linking targeted members and email sends; via those related tables, campaigns support per-recipient lifecycle tracking (Targeted, Sent, Responded, Converted, Opted Out) and can attribute conversion value for ROI. Note: in this dataset the campaign reference on communications is unused (100% null), indicating many sends are ad hoc and not campaign-driven.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID for the campaign; unique identifier generated sequentially.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable campaign title.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'CampaignType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'CampaignType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization of the campaign’s purpose (e.g., Member Engagement, Membership Renewal, Event Promotion, Course Launch, Donation Drive, Email).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'CampaignType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the campaign (Draft, Scheduled, Active, Completed, Cancelled).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the campaign is planned to begin.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the campaign is planned to end.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Budget'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Budget';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Planned budget allocation for the campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Budget';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'ActualCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'ActualCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual cost incurred by the campaign (captured post-execution).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'ActualCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'TargetAudience'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'TargetAudience';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description or identifier of the intended audience segment for the campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'TargetAudience';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Goals'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Goals';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Narrative goals or KPIs for the campaign (e.g., conversion targets, registrations).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Goals';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed narrative about the campaign’s content and intent.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO

-- Table: AssociationDemo.CampaignMember
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores per-member participation records for campaigns, tracking who was targeted, when they were added, the audience segment they came from, their response status, and any conversion value. It links individual members to specific campaigns and optionally to the segment definition used for targeting.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for this campaign-member record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'CampaignID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'CampaignID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the campaign in which the member was targeted or participated.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'CampaignID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the individual member who is part of the campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'SegmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'SegmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to the audience segment that included this member for the campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'SegmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'AddedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'AddedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the member was added/targeted for the campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'AddedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current campaign engagement status for the member: one of Targeted, Sent, Responded, Converted, or Opted Out.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ResponseDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ResponseDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the member responded or their status changed (e.g., responded, converted, opted out).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ResponseDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ConversionValue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ConversionValue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary or scoring value attributed to the member’s conversion for this campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ConversionValue';
GO

-- Table: AssociationDemo.Certificate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores issued course completion certificates for enrollments, including a human-readable certificate number, issuance and optional expiration dates, a link to the generated PDF, and a verification code. Each record ties to exactly one enrollment in AssociationDemo.Enrollment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID for the certificate record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'EnrollmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'EnrollmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the enrollment that earned this certificate; enforces a one-certificate-per-enrollment relationship.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'EnrollmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'CertificateNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'CertificateNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable certificate identifier with year-based sequencing (e.g., CERT-2025-000147).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'CertificateNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'IssuedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'IssuedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the certificate was issued.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'IssuedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional date when the certificate expires; null indicates non-expiring or not applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'CertificatePDFURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'CertificatePDFURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Direct URL to the generated certificate PDF file.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'CertificatePDFURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'VerificationCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'VerificationCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique code used to verify the authenticity of the certificate, likely via a public verification endpoint.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'VerificationCode';
GO

-- Table: AssociationDemo.Certification
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Certification stores individual members’ earned certifications/credentials, including the certification program type, credential number, issuance and expiration dates, status, exam score (if applicable), continuing education progress, and renewal tracking. It serves as the transactional record linking a person to a specific certification program instance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the certification record representing a specific member’s certification instance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member who holds this certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'CertificationTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'CertificationTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The certification program/type this record pertains to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'CertificationTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'CertificationNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'CertificationNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable credential number/code assigned to this certification instance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'CertificationNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'DateEarned'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'DateEarned';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the certification was initially earned/issued.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'DateEarned';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'DateExpires'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'DateExpires';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the certification is set to expire unless renewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'DateExpires';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the certification (e.g., Active, Pending Renewal, Expired, Suspended, Revoked, In Progress).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'Score'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'Score';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Exam or assessment score associated with earning the certification, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'Score';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text notes such as specializations or remarks relevant to this certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'VerificationURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'VerificationURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional external link to verify the certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'VerificationURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'IssuedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'IssuedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text issuer name for the certification, if recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'IssuedBy';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'LastRenewalDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'LastRenewalDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the certification was most recently renewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'LastRenewalDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'NextRenewalDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'NextRenewalDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Next renewal due date based on program cadence.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'NextRenewalDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'CECreditsEarned'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'CECreditsEarned';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing education credits accumulated toward renewal requirements for this certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'CECreditsEarned';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certification'
    AND c.name = 'RenewalCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certification',
        @level2type = N'COLUMN',
        @level2name = N'RenewalCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this certification has been renewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certification',
    @level2type = N'COLUMN',
    @level2name = N'RenewalCount';
GO

-- Table: AssociationDemo.CertificationRenewal
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.CertificationRenewal records renewal transactions for individual certifications, including effective renewal and new expiration dates, CE credits applied toward the renewal, fees and payment timing, and processing workflow status. It exists to track each renewal cycle for a certification held by a member.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the renewal record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'CertificationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'CertificationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the certification being renewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'CertificationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'RenewalDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'RenewalDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The effective date of the renewal cycle (when the renewed term starts or is recorded).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'RenewalDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The new expiration date set by this renewal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'CECreditsApplied'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'CECreditsApplied';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of continuing education credits applied toward fulfilling the renewal requirement.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'CECreditsApplied';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'FeePaid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'FeePaid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary fee paid for this renewal transaction.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'FeePaid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'PaymentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'PaymentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date payment for the renewal was received/recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'PaymentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Workflow status of the renewal (Pending, Completed, Late, or Rejected).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text notes about the renewal (e.g., exceptions or comments).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'ProcessedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'ProcessedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the staff user or system that processed the renewal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'ProcessedBy';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRenewal'
    AND c.name = 'ProcessedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRenewal',
        @level2type = N'COLUMN',
        @level2name = N'ProcessedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the renewal was processed/approved in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRenewal',
    @level2type = N'COLUMN',
    @level2name = N'ProcessedDate';
GO

-- Table: AssociationDemo.CertificationRequirement
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines the set of eligibility and assessment requirements for each certification program. Each row is a requirement (e.g., exam, training, education, experience, prerequisites, documentation/reference) attached to a specific certification type from AssociationDemo.CertificationType, with descriptive text, optional details, whether it is mandatory, and a display order for presentation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the requirement record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'CertificationTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'CertificationTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the certification program this requirement applies to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'CertificationTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'RequirementType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'RequirementType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes the requirement (e.g., Examination, Training, Experience, Prerequisites, Education, Documentation, Reference).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'RequirementType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable statement of the requirement to be met.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'IsRequired'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'IsRequired';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this requirement is mandatory for the certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'IsRequired';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering index for presenting requirements within a certification type.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationRequirement'
    AND c.name = 'Details'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationRequirement',
        @level2type = N'COLUMN',
        @level2name = N'Details';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional additional guidance or conditions for fulfilling the requirement.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationRequirement',
    @level2type = N'COLUMN',
    @level2name = N'Details';
GO

-- Table: AssociationDemo.CertificationType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Master catalog of certification programs overseen by accrediting bodies. Each row defines a program’s identity (name/code/description), level, cost, assessment flags, and lifecycle parameters (program duration, renewal cadence, CE credit requirements). It serves as the parent to a structured set of CertificationRequirement items—ordered and categorized (e.g., Examination, Training, Experience, Education, Prerequisites)—with IsRequired supporting both mandatory and optional components, enabling flexible program designs. The renewal and CE fields here drive expiry/renewal calculations on member Certification records and are fulfilled by continuing-education activity; the table may also cache an issued-certification count.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the certification program record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'AccreditingBodyID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'AccreditingBodyID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the accrediting body that owns or oversees this certification program.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'AccreditingBodyID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the certification program.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'Abbreviation'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'Abbreviation';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short code/acronym for the certification program.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'Abbreviation';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Narrative description of the certification’s scope and purpose.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'Level'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'Level';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the certification’s difficulty/seniority (Entry, Intermediate, Advanced, Specialty, Master).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'Level';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'DurationMonths'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'DurationMonths';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Typical program length or time-to-completion in months.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'DurationMonths';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'RenewalRequiredMonths'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'RenewalRequiredMonths';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recertification interval in months after credential issuance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'RenewalRequiredMonths';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'CECreditsRequired'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'CECreditsRequired';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of continuing education credits required per renewal cycle.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'CECreditsRequired';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'ExamRequired'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'ExamRequired';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if passing a formal exam is required to earn the certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'ExamRequired';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'PracticalRequired'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'PracticalRequired';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if a practical/skills assessment is required.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'PracticalRequired';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'CostUSD'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'CostUSD';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Fee charged for the certification application/exam/program in US dollars.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'CostUSD';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the certification program is currently offered/active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'Prerequisites'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'Prerequisites';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Eligibility requirements that must be met before enrollment or assessment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'Prerequisites';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'TargetAudience'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'TargetAudience';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Intended participant profile for the certification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'TargetAudience';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CertificationType'
    AND c.name = 'CertificationCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CertificationType',
        @level2type = N'COLUMN',
        @level2name = N'CertificationCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached/derived count of issued certifications tied to this program.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CertificationType',
    @level2type = N'COLUMN',
    @level2name = N'CertificationCount';
GO

-- Table: AssociationDemo.Chapter
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the master list of association chapters, including geographic and special-interest groups, their location/region, founding date, activity status, and meeting cadence. Serves as the parent entity for member enrollments in chapters and chapter officer assignments.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System-generated unique identifier for each chapter.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official chapter name.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'ChapterType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'ChapterType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the chapter (Geographic, Special Interest, or Industry).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'ChapterType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Region'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Region';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broader geographic region the chapter serves (e.g., Midwest, National, Canada).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Region';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City where the chapter is based or primarily meets, when applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State/province for the chapter’s location, when applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the chapter; defaults to ''United States''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'FoundedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'FoundedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the chapter was established.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'FoundedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short summary of the chapter’s focus and audience.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Chapter website URL, if maintained.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact email for the chapter.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the chapter is active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'MeetingFrequency'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'MeetingFrequency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Typical cadence of chapter meetings (e.g., Monthly, Quarterly).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'MeetingFrequency';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'MemberCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'MemberCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current or last-known member count for the chapter, if tracked.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'MemberCount';
GO

-- Table: AssociationDemo.ChapterMembership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.ChapterMembership stores the enrollment records linking individual members to specific chapters, including when they joined, whether the enrollment is currently active, and the role they hold within the chapter (currently recorded as ''Member''). It implements the many-to-many relationship between AssociationDemo.Member and AssociationDemo.Chapter and supports roster management and historical tracking via status and join date.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for a specific chapter membership record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the chapter the member is (or was) enrolled in.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the individual person who holds the chapter membership.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'JoinDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'JoinDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member joined the chapter for this enrollment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'JoinDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current state of the chapter membership for the member: ''Active'' or ''Inactive''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'Role'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'Role';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The role held within the chapter for this membership record; currently ''Member''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'Role';
GO

-- Table: AssociationDemo.ChapterOfficer
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the current officer assignments for association chapters, linking a member to a chapter with a specific officer position (President, Vice President, Secretary) and the term start/end dates. Used to manage and display chapter leadership rosters.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the chapter officer assignment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the chapter in which the officer serves.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who holds the officer position.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'Position'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'Position';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The officer role held within the chapter (e.g., President, Vice President, Secretary).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'Position';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the officer’s term begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the officer’s term ends; null when the term is ongoing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the officer assignment is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Committee
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Committee stores the master list of committees, task forces, and ad hoc groups in the association, including their type, purpose, meeting cadence, lifecycle dates, and optional membership size limits. It defines the groups to which members are linked via AssociationDemo.CommitteeMembership. Leadership positions (e.g., Chair, Vice Chair) are modeled as role assignments on CommitteeMembership records to support term-based leadership and historical tracking, rather than as a single static chair on the committee record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System-generated unique identifier for each committee or group.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name of the committee, task force, or ad hoc group.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'CommitteeType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'CommitteeType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the group as Standing, Ad Hoc, or Task Force.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'CommitteeType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'Purpose'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'Purpose';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Charter or mission statement describing the committee’s focus.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'Purpose';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'MeetingFrequency'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'MeetingFrequency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Typical meeting cadence of the committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'MeetingFrequency';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the committee is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'FormedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'FormedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee was established.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'FormedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'DisbandedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'DisbandedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee was disbanded (null if still active).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'DisbandedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'ChairMemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'ChairMemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the member who serves as committee chair.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'ChairMemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'MaxMembers'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'MaxMembers';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum allowed number of members on the committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'MaxMembers';
GO

-- Table: AssociationDemo.CommitteeMembership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores assignments of individual members to committees, including their role (Member/Chair/Vice Chair), the start and (optional) end of their term, active status, and who appointed them. It implements the many-to-many relationship between AssociationDemo.Member and AssociationDemo.Committee while capturing leadership roles and term history.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the committee membership record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'CommitteeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'CommitteeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the committee to which the member is assigned.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'CommitteeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who holds the committee assignment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'Role'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'Role';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role of the member within the committee, such as Member, Chair, or Vice Chair.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'Role';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee assignment or term begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee assignment or term ends; null means open-ended/current.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the committee assignment is active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'AppointedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'AppointedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text field indicating the authority or person who appointed the member to the committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'AppointedBy';
GO

-- Table: AssociationDemo.Competition
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Competition is the master record for an industry competition or awards event. It defines the event identity, host/organizer affiliation, schedule and key dates, venue/location, entry rules and parameters, and overall lifecycle status and metrics. As the root of operations, it anchors entries, fee schedules and per-entry payment status tracking, and a structured judging program with explicit roles (e.g., Head, Technical, Sensory), invitation/confirmation workflow, specialty alignment, optional category-level judge assignments, and compensation/expense management via related tables. It also governs the awards model for the event, supporting detailed judging progression to ranked results and standardized award tiers/levels (e.g., Gold/Silver/Bronze, Best in Show).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key identifier for the competition record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the competition/event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Year'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Year';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calendar year of this instance of the competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Year';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Narrative summary of the competition’s scope and positioning.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the competition event begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the competition event ends.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'JudgingDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'JudgingDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary date on which judging occurs (if distinct).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'JudgingDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'AwardsDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'AwardsDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when awards are announced or presented.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'AwardsDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Location'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Location';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City and region/country where the event is hosted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Location';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'EntryDeadline'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'EntryDeadline';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Last date to submit entries for the competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'EntryDeadline';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'EntryFee'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'EntryFee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Fee per entry submitted to the competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'EntryFee';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the competition (e.g., Upcoming, Open for Entries, Entries Closed, Judging, Completed, Cancelled).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'TotalEntries'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'TotalEntries';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Aggregate count of entries received for this competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'TotalEntries';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'TotalCategories'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'TotalCategories';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of award categories available in the competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'TotalCategories';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the competition’s official website or information page.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'ContactEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'ContactEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address for competition inquiries or administration.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'ContactEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'IsAnnual'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'IsAnnual';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the competition occurs annually.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'IsAnnual';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Competition'
    AND c.name = 'IsInternational'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Competition',
        @level2type = N'COLUMN',
        @level2name = N'IsInternational';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the competition has international scope/participation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Competition',
    @level2type = N'COLUMN',
    @level2name = N'IsInternational';
GO

-- Table: AssociationDemo.CompetitionEntry
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual competition entries for member products, linking each product to a specific competition and judging category. Captures submission and payment details and the internal judging workflow (status, score, ranking, and a provisional/operational award level). The canonical public-facing award is recorded in a separate award table, with at most one award record per entry, reflecting normalized reporting and historical tracking while this table remains the operational source for judging and entry processing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the competition entry record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'CompetitionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'CompetitionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The competition event this entry was submitted to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'CompetitionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific product being entered and judged.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'CategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'CategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The judging category/bracket under which the product is evaluated in the competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'CategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'EntryNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'EntryNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-facing entry code assigned at submission (e.g., for labeling/communication).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'EntryNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'SubmittedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'SubmittedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the entry was submitted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'SubmittedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the entry within the judging process.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'Score'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'Score';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judging score assigned to the entry.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'Score';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'Ranking'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'Ranking';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Placement of the entry (likely within its category) after judging.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'Ranking';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'AwardLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'AwardLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Award outcome assigned to the entry.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'AwardLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'JudgingNotes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'JudgingNotes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text notes from judges.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'JudgingNotes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'FeedbackProvided'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'FeedbackProvided';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether feedback has been delivered to the entrant.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'FeedbackProvided';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'EntryFee'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'EntryFee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Fee charged for this competition entry.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'EntryFee';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionEntry'
    AND c.name = 'PaymentStatus'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionEntry',
        @level2type = N'COLUMN',
        @level2name = N'PaymentStatus';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment state of the entry fee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionEntry',
    @level2type = N'COLUMN',
    @level2name = N'PaymentStatus';
GO

-- Table: AssociationDemo.CompetitionJudge
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the roster of judges for each competition, including the invited/confirmation workflow and a snapshot of judge profile details (contact, organization, credentials, experience, specialty), their judging role, optional category assignments, compensation, and notes. Each row represents a specific member serving as a judge for a specific competition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the competition-judge assignment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'CompetitionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'CompetitionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the competition this judge is assigned to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'CompetitionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who is serving as a judge.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'FirstName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'FirstName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judge’s first name captured for this assignment (snapshot for communications/rosters).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'FirstName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'LastName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'LastName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judge’s last name captured for this assignment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'LastName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judge’s email address for invitations and event communications.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Organization'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Organization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judge’s affiliated organization or employer.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Organization';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Credentials'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Credentials';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Professional certifications/qualifications of the judge.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Credentials';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'YearsExperience'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'YearsExperience';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Years of professional experience relevant to judging.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'YearsExperience';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Specialty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Specialty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary judging specialty or category focus.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Specialty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Role'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Role';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The judge’s role in the competition (e.g., Sensory Judge, Technical Judge, Head Judge).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Role';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'AssignedCategories'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'AssignedCategories';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Text field for listing specific competition categories assigned to this judge.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'AssignedCategories';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status of the judge’s participation (Invited, Confirmed, Declined, Completed, Removed).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'InvitedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'InvitedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the judge was invited.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'InvitedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'ConfirmedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'ConfirmedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the judge confirmed participation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'ConfirmedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'CompensationAmount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'CompensationAmount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional compensation or honorarium amount for the judge.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'CompensationAmount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CompetitionJudge'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CompetitionJudge',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form administrative notes about the judge assignment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CompetitionJudge',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO

-- Table: AssociationDemo.ContinuingEducation
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual members’ continuing education (CE) activity records, including activity details, provider, completion date, credits earned, and linkage to the member and (optionally) the specific certification the credits apply to. Used to track CE progress and support certification maintenance/renewal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the continuing education activity record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member who completed or is claiming the CE activity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'CertificationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'CertificationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific certification instance to which this CE activity’s credits are applied.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'CertificationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'ActivityTitle'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'ActivityTitle';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Title or name of the CE activity (course, webinar, workshop, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'ActivityTitle';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'ActivityType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'ActivityType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization of the CE activity format (e.g., Course, Workshop, Webinar, Conference, Self-Study).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'ActivityType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'Provider'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'Provider';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Organization or institution that delivered the CE activity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'Provider';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'CompletionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'CompletionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member completed the CE activity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'CompletionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'CreditsEarned'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'CreditsEarned';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of CE credits awarded for the activity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'CreditsEarned';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'CreditsType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'CreditsType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of credit awarded (default CE).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'CreditsType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'HoursSpent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'HoursSpent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total hours spent by the member on the activity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'HoursSpent';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'VerificationCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'VerificationCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Code or certificate number used to verify completion with the provider.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'VerificationCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Approval state of the CE record (Approved, Pending, Rejected, Expired).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form notes about the CE activity or review outcome.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ContinuingEducation'
    AND c.name = 'DocumentURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ContinuingEducation',
        @level2type = N'COLUMN',
        @level2name = N'DocumentURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to proof of completion (certificate, agenda, transcript).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ContinuingEducation',
    @level2type = N'COLUMN',
    @level2name = N'DocumentURL';
GO

-- Table: AssociationDemo.Course
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Catalog of association training courses, including codes, titles, descriptions, category and skill level, duration and CEU credits, public vs. member pricing, publication/activation details, instructor attribution, and an optional self-referential prerequisite to support sequenced learning paths.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System-generated unique identifier for the course record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Code'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Code';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable course code used for cataloging and search (e.g., CHZ-101).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Code';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The official course title shown in catalogs and on enrollment pages.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed summary of course content and scope.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discipline taxonomy for the course (e.g., Food Safety, Marketing).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Level'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Level';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Difficulty tier of the course: Beginner, Intermediate, or Advanced.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Level';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'DurationHours'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'DurationHours';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total instructional hours for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'DurationHours';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing Education Units awarded upon completion.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Price'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Price';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard (non-member) enrollment price for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Price';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'MemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'MemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discounted enrollment price available to association members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'MemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the course is active and available for enrollment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'PublishedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'PublishedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the course was published/made visible in the catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'PublishedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'InstructorName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'InstructorName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the instructor delivering the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'InstructorName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'PrerequisiteCourseID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'PrerequisiteCourseID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to another course that must be completed first.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'PrerequisiteCourseID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'ThumbnailURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'ThumbnailURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional URL to a thumbnail image for marketing the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'ThumbnailURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'LearningObjectives'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'LearningObjectives';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional detailed learning outcomes for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'LearningObjectives';
GO

-- Table: AssociationDemo.EmailClick
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.EmailClick stores one record per link click event that occurred in a specific outbound email send. Each row ties back to a single AssociationDemo.EmailSend, capturing the timestamp of the click, the destination URL, the link label as presented in the email, and optional client metadata (IP address and user agent) for engagement analytics and auditing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the click event record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'EmailSendID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'EmailSendID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the specific outbound email instance that generated this click.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'EmailSendID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'ClickDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'ClickDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient clicked the link in the email.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'ClickDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'URL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'URL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The destination URL that was clicked within the email.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'URL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'LinkName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'LinkName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-friendly label of the link as shown in the email (call-to-action text).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'LinkName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'IPAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'IPAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Client IP address captured at time of click, if tracked.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'IPAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'UserAgent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'UserAgent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Browser or client user-agent string captured at time of click, if available.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'UserAgent';
GO

-- Table: AssociationDemo.EmailSend
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.EmailSend stores one record per outbound email sent to a specific member, capturing the template used, optional campaign association, the subject at time of send, delivery/open/click/bounce/unsubscribe/spam timestamps and counts, and a normalized status. It serves as the engagement tracking and audit log for member communications and is the parent for detailed click events.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the email send event (one row per email sent to a member).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'TemplateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'TemplateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the email template used to generate this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'TemplateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'CampaignID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'CampaignID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the campaign under which this email was sent.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'CampaignID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recipient member for this email.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'Subject'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'Subject';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Subject line used for this specific send (captured at send time).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'Subject';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'SentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'SentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the system attempted to send the email.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'SentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'DeliveredDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'DeliveredDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the email was confirmed delivered by the provider.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'DeliveredDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'OpenedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'OpenedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the first open detected for this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'OpenedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'OpenCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'OpenCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of opens recorded for this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'OpenCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ClickedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ClickedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the first click recorded for this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ClickedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ClickCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ClickCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of link clicks recorded for this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ClickCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BouncedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BouncedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the message bounced (if applicable).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BouncedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BounceType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BounceType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the bounce (e.g., hard, soft).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BounceType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BounceReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BounceReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider-reported reason explaining why the email bounced.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BounceReason';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'UnsubscribedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'UnsubscribedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient unsubscribed related to this send.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'UnsubscribedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'SpamReportedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'SpamReportedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient reported this email as spam.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'SpamReportedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the email (e.g., Sent, Delivered, Opened, Clicked, Bounced).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ExternalMessageID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ExternalMessageID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider/ESP message identifier for cross-system reconciliation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ExternalMessageID';
GO

-- Table: AssociationDemo.EmailTemplate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores reusable email templates for member communications (e.g., welcomes, renewals, newsletters, event invitations). Each record provides the template’s name, default subject, sender identity (FromName/FromEmail, optional ReplyTo), category, preview text, tags, and activation status. Templates are referenced when generating email sends; the send records persist the subject actually used at send time—allowing overrides and preserving historical accuracy—rather than relying on the template’s current subject. In practice, only a small subset of templates are actively referenced by send records.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the email template; uniquely identifies a reusable template.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable template name used to identify and manage templates (e.g., Welcome, Renewal notices).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Subject'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Subject';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default email subject line for the template; may include tokens/placeholders.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Subject';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'FromName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'FromName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the sender associated with the template.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'FromName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'FromEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'FromEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sender email address to use when sending emails from this template.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'FromEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'ReplyToEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'ReplyToEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reply-to email address overriding the FromEmail for recipient replies.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'ReplyToEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'HtmlBody'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'HtmlBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTML content of the email template, possibly with merge fields; optional.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'HtmlBody';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'TextBody'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'TextBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Plain-text version of the email template; optional fallback for clients that do not render HTML.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'TextBody';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Template classification for organization and selection (e.g., Welcome, Renewal, Newsletter, Event).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the template is active and available for use in email sends.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'PreviewText'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'PreviewText';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Preheader text shown in inbox previews to complement the subject line.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'PreviewText';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Tags'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Tags';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional labels/keywords for searching or segmenting templates.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Tags';
GO

-- Table: AssociationDemo.Enrollment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks a member’s enrollment in a specific course, including lifecycle status, dates (enrolled/start/completion), progress, assessment results (score, pass/fail against a passing threshold), and optional commerce linkage. It serves as the learner–course junction and the single source that can produce at most one certificate per enrollment (0..1). Certificate issuance is driven by the enrollment’s completion/passing; certificate numbers are generated at issuance (year-sequenced, e.g., CERT-YYYY-######), and some certificates include an expiration date (time-bound credentials) while others do not. Recertifications are represented by new enrollments that may yield new certificates.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the enrollment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'CourseID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'CourseID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The course this enrollment pertains to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'CourseID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member (learner) who is enrolled.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'EnrollmentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'EnrollmentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member enrolled/registered for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'EnrollmentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the learner first started engaging with the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'CompletionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'CompletionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the course was completed by the member.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'CompletionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional date when the enrollment access expires.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the enrollment (Enrolled, In Progress, Completed, and allowed values for Withdrawn/Failed/Expired).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ProgressPercentage'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ProgressPercentage';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percent completion of the course content for this enrollment (0–100).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ProgressPercentage';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'LastAccessedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'LastAccessedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the learner’s most recent access to the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'LastAccessedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'TimeSpentMinutes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'TimeSpentMinutes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cumulative minutes the learner has spent in the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'TimeSpentMinutes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'FinalScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'FinalScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final numeric score or grade achieved for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'FinalScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'PassingScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'PassingScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum score required to pass the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'PassingScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'Passed'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'Passed';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the learner met the passing criteria for the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'Passed';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the invoice when the enrollment is associated with a purchase.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO

-- Table: AssociationDemo.Event
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores master (header) records for association events (conferences, webinars, workshops). Defines the overall run window, high-level location/virtual info, publication/registration status, and default capacity/price/CEU values. Serves as the parent for registrations, registration-pricing tiers (e.g., Early Bird/Standard with effective date windows), attendee check-ins, CEU awards, and the session agenda. Sessions carry their own times, rooms, speakers, capacities, and CEU credits, enabling multi-track agendas and per-session CEU accumulation; attendee CEUs are ultimately awarded at the registrant level based on attendance, with event-level CEU values acting as defaults or caps.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID for the event record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public-facing title of the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'EventType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'EventType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization of the event format/content (e.g., Webinar, Conference, Workshop).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'EventType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date/time the event begins, stored as datetime (likely UTC) to be interpreted with Timezone.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date/time the event ends.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Timezone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Timezone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IANA timezone identifier for the event’s local time context.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Timezone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Location'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Location';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Physical venue name/address for in-person events, or ''Virtual'' when no venue is used.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Location';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'IsVirtual'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'IsVirtual';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the event is virtual (true) or has an in-person component (false).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'IsVirtual';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'VirtualPlatform'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'VirtualPlatform';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Platform used for virtual delivery when applicable (e.g., Zoom, Teams).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'VirtualPlatform';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'MeetingURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'MeetingURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Join/link URL for virtual events.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'MeetingURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to the chapter hosting the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Capacity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Capacity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of registrants permitted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Capacity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationOpenDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationOpenDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date/time when event registration opens.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationOpenDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationCloseDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationCloseDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date/time when event registration closes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationCloseDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationFee'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationFee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Legacy or optional flat registration fee; superseded by member/non-member pricing in this dataset.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationFee';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'MemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'MemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price charged to association members; 0 indicates free for members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'MemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'NonMemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'NonMemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price charged to non-members; may differ from member pricing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'NonMemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing Education Units awarded upon completion.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed summary/marketing copy for the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the event (e.g., Draft, Published, Registration Open, Completed; also supports Cancelled, In Progress, Sold Out).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO

-- Table: AssociationDemo.EventRegistration
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores event registrations linking members to events, including registration details, status, check-in/attendance, and CEU (Continuing Education Unit) awarding for each registrant.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the registration record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'EventID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'EventID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the event the member registered for.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'EventID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who registered.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'RegistrationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the registration was created/recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'RegistrationType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pricing/registration tier selected, such as Early Bird or Standard.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current state of the registration (Registered, Attended, No Show; also supports Cancelled and Waitlisted).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CheckInTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CheckInTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual check-in timestamp when the registrant was marked present.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CheckInTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to an invoice for this registration, if billed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CEUAwarded'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CEUAwarded';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether CEUs were awarded to this registrant.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CEUAwarded';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CEUAwardedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CEUAwardedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when CEUs were posted/awarded to the registrant.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CEUAwardedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CancellationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CancellationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the registration was cancelled, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CancellationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CancellationReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CancellationReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text reason provided for cancelling the registration.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CancellationReason';
GO

-- Table: AssociationDemo.EventSession
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.EventSession stores the individual sessions that make up an event agenda (e.g., keynotes, breakouts, workshops) for a parent record in AssociationDemo.Event. It captures session metadata such as title, description, schedule, room, speaker, type, capacity, and CEU credits to support agenda building, scheduling, and attendee planning.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the session record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'EventID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'EventID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the session to its parent event in AssociationDemo.Event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'EventID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Session title or name displayed on the event agenda.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed session description or abstract.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'StartTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'StartTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduled start date and time for the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'StartTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'EndTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'EndTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduled end date and time for the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'EndTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Room'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Room';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Assigned room or location for the session, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Room';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'SpeakerName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'SpeakerName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the speaker or presenter for the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'SpeakerName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'SessionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'SessionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization of the session (e.g., keynote, breakout, workshop, panel).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'SessionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Capacity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Capacity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of attendees allowed for this session; null may imply no specific limit.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Capacity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing education credits awarded for attending this session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO

-- Table: AssociationDemo.ForumCategory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores forum categories for the association’s community, including a self-referential hierarchy (parent/child categories), UI display metadata (order, icon, color), access controls (membership gating, active flag), and denormalized activity rollups (thread/post counts and last-post info) used to render forum navigation and summaries.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the forum category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the category shown in the forum UI.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short explanatory text about the category’s topic.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'ParentCategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'ParentCategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a parent category, enabling nested (sub-)categories.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'ParentCategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sort order for rendering categories within the same parent.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'Icon'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'Icon';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Icon CSS class to visually represent the category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'Icon';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'Color'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'Color';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color used for theming or badges in the category UI.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'Color';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the category is visible/usable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'RequiresMembership'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'RequiresMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether access to the category is restricted to members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'RequiresMembership';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'ThreadCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'ThreadCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized count of threads in the category (and possibly descendants).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'ThreadCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'PostCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'PostCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized count of posts within the category’s threads.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'PostCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'LastPostDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'LastPostDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent post in the category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'LastPostDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumCategory'
    AND c.name = 'LastPostAuthorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumCategory',
        @level2type = N'COLUMN',
        @level2name = N'LastPostAuthorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who authored the most recent post in the category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumCategory',
    @level2type = N'COLUMN',
    @level2name = N'LastPostAuthorID';
GO

-- Table: AssociationDemo.ForumModeration
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the auditable moderation/report history for forum posts. Each row captures a member’s report of a specific post, the reason, when it was reported, and the moderation workflow outcome (status, moderator, notes, and action taken).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the moderation/report record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'PostID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'PostID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The forum post that was reported and/or moderated.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'PostID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ReportedByID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ReportedByID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who submitted the report/flag on the post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ReportedByID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ReportedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ReportedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the report was filed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ReportedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ReportReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ReportReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorized reason for the report (e.g., spam, duplicate, off-topic).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ReportReason';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ModerationStatus'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ModerationStatus';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the moderation workflow for this report (Pending, Reviewing, Approved, Dismissed, Removed).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ModerationStatus';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ModeratedByID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ModeratedByID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Moderator (member/staff) who reviewed and set the outcome.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ModeratedByID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ModeratedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ModeratedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the moderation decision was recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ModeratedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'ModeratorNotes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'ModeratorNotes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text notes documenting the rationale per community guidelines.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'ModeratorNotes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumModeration'
    AND c.name = 'Action'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumModeration',
        @level2type = N'COLUMN',
        @level2name = N'Action';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Outcome taken as a result of moderation (e.g., warning, no action, post edited).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumModeration',
    @level2type = N'COLUMN',
    @level2name = N'Action';
GO

-- Table: AssociationDemo.ForumPost
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual forum posts within discussion threads (root posts and nested replies) as the canonical content record. Captures authorship, body content, posting/editing timestamps, lifecycle status, and an accepted‑answer marker. Provides lightweight moderation fields (e.g., Status, IsFlagged), while detailed moderation states/actions and reasons are tracked in an external audit/history table. Caches aggregated reaction counters derived from a granular PostReaction child table, supporting multiple modalities (Like, Helpful, Thanks, Bookmark, Flag). Supports file attachments via a child table using externalized URLs with MIME types and download tracking; attachments can be uploaded by users other than the post author. Enables topical tagging through a child post‑tag table that supports multiple tags per post from a controlled taxonomy, with tag additions managed independently after posting.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the forum post record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'ThreadID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'ThreadID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the thread this post belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'ThreadID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'ParentPostID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'ParentPostID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to the parent post for nested replies; NULL indicates a root post for the thread.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'ParentPostID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'AuthorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'AuthorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who authored the post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'AuthorID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'Content'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'Content';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The text body of the post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'Content';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'PostedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'PostedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the post was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'PostedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'EditedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'EditedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent edit, if any.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'EditedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'EditedByID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'EditedByID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who performed the most recent edit (author or moderator).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'EditedByID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'LikeCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'LikeCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached count of ''like'' reactions on the post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'LikeCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'HelpfulCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'HelpfulCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached count of ''helpful'' reactions on the post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'HelpfulCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'IsAcceptedAnswer'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'IsAcceptedAnswer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this post is the accepted answer in a Q&A-style thread.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'IsAcceptedAnswer';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'IsFlagged'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'IsFlagged';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the post is flagged for moderation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'IsFlagged';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumPost'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumPost',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the post (Draft, Published, Edited, Moderated, Deleted).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumPost',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO

-- Table: AssociationDemo.ForumThread
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores forum discussion threads (topics) for the association’s community. Each row is the thread container holding header/metadata (title, category, author, timestamps, view/reply counts, last activity, moderation flags like pinned/locked/featured, and status). The opening message is not stored in the thread row; it lives in AssociationDemo.ForumPost as the root post for the thread (ParentPostID NULL), with subsequent replies as child posts. Threads can also operate in Q&A mode where a single reply may be marked as the accepted answer.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the forum thread.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'CategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'CategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Forum category that this thread belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'CategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Thread title (topic) shown in forum listings.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'AuthorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'AuthorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who created (started) the thread.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'AuthorID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date/time the thread was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'ViewCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'ViewCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the thread has been viewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'ViewCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'ReplyCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'ReplyCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of replies in the thread (denormalized count).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'ReplyCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'LastActivityDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'LastActivityDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent activity in the thread (e.g., last post/reply).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'LastActivityDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'LastReplyAuthorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'LastReplyAuthorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who authored the most recent reply.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'LastReplyAuthorID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'IsPinned'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'IsPinned';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the thread is pinned to the top of its category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'IsPinned';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'IsLocked'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'IsLocked';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the thread is locked and cannot receive new replies.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'IsLocked';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'IsFeatured'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'IsFeatured';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the thread is marked as featured/promoted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'IsFeatured';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ForumThread'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ForumThread',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the thread: Active, Closed, Archived, or Deleted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ForumThread',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO

-- Table: AssociationDemo.GovernmentContact
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.GovernmentContact stores a curated, prioritized roster of government officials and public-sector contacts (e.g., legislators, senators, representatives, agency heads) linked to a specific governmental/legislative body. It captures role classification, party, district, committee affiliations, term dates, and contact information, and serves as the canonical target list for advocacy outreach. The table is operationally central to interaction histories: AssociationDemo.AdvocacyAction records outreach against these contacts, with repeated actions concentrated on a relatively small subset of high-priority contacts.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the government contact record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'LegislativeBodyID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'LegislativeBodyID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the governmental or legislative body this contact belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'LegislativeBodyID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'FirstName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'FirstName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact''s given name.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'FirstName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'LastName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'LastName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact''s family/surname.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'LastName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official title or role description as displayed (e.g., ''State Senator, District 14'', ''Administrator, Agricultural Marketing Service'').',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'ContactType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'ContactType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes the contact’s role (e.g., Legislator, Senator, Representative, Agency Head).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'ContactType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Party'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Party';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Political party affiliation when applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Party';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'District'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'District';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Geographic district or jurisdiction associated with the contact.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'District';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Committee'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Committee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Committee membership or leadership designation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Committee';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary email address for contacting the official/staff.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Phone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Phone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary phone number for the contact.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Phone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'OfficeAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'OfficeAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Mailing or physical office address for the contact.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'OfficeAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official website or profile URL.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'TermStart'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'TermStart';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Start date of the current term or appointment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'TermStart';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'TermEnd'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'TermEnd';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End date of the current term; null if ongoing or unspecified.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'TermEnd';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text notes relevant to advocacy or contact context.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'GovernmentContact'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'GovernmentContact',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the contact is currently active for outreach.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'GovernmentContact',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Invoice
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores invoices issued to members as the header/master record. It supports consolidating charges across business areas (events, memberships, courses) through associated InvoiceLineItem rows, which hold a polymorphic reference to the originating entity; the invoice header itself does not store those associations. Financial totals on the invoice are derived from its line items (summing line amounts and per-line tax). Payments are recorded in a related table and typically settle the invoice in a single online transaction (e.g., credit card, ACH, PayPal/Stripe), which drives status updates. While the model supports multiple line items and partial payments, current data shows most invoices have one line item and one payment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the invoice record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'InvoiceNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable invoice code, unique per invoice (e.g., INV-YYYY-XXXXXX).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The billed member (customer) for the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'InvoiceDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the invoice was issued.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'DueDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'DueDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment due date for the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'DueDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'SubTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'SubTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sum of line items before tax and discounts.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'SubTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Tax'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Tax';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total tax applied to the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Tax';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Discount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Discount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total discount applied to the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Discount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Total'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Total';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Grand total amount due (SubTotal + Tax − Discount).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Total';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'AmountPaid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'AmountPaid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cumulative payments applied to this invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'AmountPaid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Balance'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Balance';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Outstanding balance (Total − AmountPaid).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Balance';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the invoice (Draft, Sent, Partial, Paid, Overdue, Cancelled, Refunded).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-form notes for the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'PaymentTerms'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'PaymentTerms';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Textual payment terms (e.g., Net 30, Due on receipt).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'PaymentTerms';
GO

-- Table: AssociationDemo.InvoiceLineItem
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual line items attached to invoices, detailing what was billed (membership dues, event registrations, course enrollments, etc.), pricing, quantity, tax per line, and an optional link to the originating business entity (event, membership, or course).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the invoice line item.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the parent invoice that this line item belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of the billed item (e.g., membership type, event name, course title).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'ItemType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'ItemType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes the line item (e.g., Event Registration, Membership Dues, Course Enrollment; also supports Donation, Merchandise, Other).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'ItemType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of units billed on this line; defaults to 1 and is 1 for all rows observed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'UnitPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'UnitPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price per unit for the item on this line.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'UnitPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Amount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Amount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Extended line amount (typically Quantity × UnitPrice); equals UnitPrice when Quantity is 1.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Amount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'TaxAmount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'TaxAmount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax applied to this line item, if any; defaults to 0.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'TaxAmount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'RelatedEntityType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'RelatedEntityType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of business entity that originated the charge (Event, Membership, or Course).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'RelatedEntityType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'RelatedEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'RelatedEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the specific entity (event, membership, or course) associated with this line item; used with RelatedEntityType to form a polymorphic reference.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'RelatedEntityID';
GO

-- Table: AssociationDemo.LegislativeBody
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores a canonical list of government entities across Federal and State levels—including legislative chambers and committees, executive departments and regulatory agencies (e.g., USDA, FDA), and judicial bodies—used for advocacy and policy tracking. Captures body type, level, jurisdiction (state/country), descriptive info, and official website. Serves as a master lookup referenced by LegislativeIssue (covering legislation, regulations/rules, executive orders, court cases) and supports multiple GovernmentContact records per body.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate unique identifier for the governmental/legislative body record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the legislative body or government agency.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'BodyType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'BodyType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization of the entity (e.g., State Legislature, Federal Congress, Federal Agency, State Agency).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'BodyType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'Level'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'Level';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Government level at which the body operates (Federal or State).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'Level';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Two-letter state abbreviation when applicable for state-level bodies.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the body; defaults to ''United States''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short description of the body''s role or chamber (e.g., upper/lower chamber, regulatory scope).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official website URL for the body.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'SessionSchedule'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'SessionSchedule';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Intended to store information about the body''s meeting or legislative session schedule.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'SessionSchedule';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeBody'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeBody',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the body is currently active and should be selectable in the application.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeBody',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.LegislativeIssue
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.LegislativeIssue stores tracked public policy items (bills, rules, and regulations) across various legislative and regulatory bodies, including their identifiers, status in the lawmaking/regulatory process, key dates, categorization, and assessed impact for advocacy purposes. It exists to power government-relations tracking, prioritization, and downstream actions like policy positions and regulatory comments.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID for the legislative/regulatory issue record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'LegislativeBodyID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'LegislativeBodyID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the governmental body (legislature, agency, committee, etc.) responsible for the issue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'LegislativeBodyID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short descriptive title of the bill, rule, or regulation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'IssueType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'IssueType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of policy item (e.g., Bill, Regulation, Rule), used to classify the issue and drive workflows.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'IssueType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'BillNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'BillNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official identifier or citation (e.g., H.R., S., AB/SB, CFR/agency docket).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'BillNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current stage of the issue in the legislative/regulatory process.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'IntroducedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'IntroducedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the issue was introduced or noticed (e.g., bill introduction or proposed rule publication).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'IntroducedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'LastActionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'LastActionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most recent recorded action date for the issue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'LastActionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'EffectiveDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'EffectiveDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the measure becomes effective (if enacted/adopted).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'EffectiveDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'Summary'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'Summary';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief narrative summary of the issue’s content.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'Summary';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'ImpactLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'ImpactLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority/severity assessment for the association (Monitoring/Low/Medium/High/Critical).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'ImpactLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'ImpactDescription'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'ImpactDescription';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Explanation of how the issue would affect stakeholders or operations.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'ImpactDescription';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Topical classification (e.g., Food Safety, Labeling, Raw Milk, Environmental).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'Sponsor'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'Sponsor';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary sponsor or originating entity (legislator, committee, or agency).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'Sponsor';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'TrackingURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'TrackingURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to the official docket or bill page for ongoing tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'TrackingURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'LegislativeIssue'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'LegislativeIssue',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the issue is actively tracked.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'LegislativeIssue',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Member
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Member stores person, staff, and system-service accounts that act as the identity backbone for the association platform. It is the system of record for communication, billing, permissions, and attribution, and underpins participation across modules: memberships (multiple terms per person); chapter affiliation (many-to-many with chapter-level roles); events with attendance and outcomes; continuing-education logging at the member level (activities with formats/providers and potential approvals) in addition to event-issued CEUs; certifications (concurrent credentials); committees/governance roles (multiple concurrent appointments with future-dated starts and full term history); advocacy; marketing/campaigns (per-campaign opt-outs and per-send engagement); community/forums (thread creators and last-reply authors, reporters and moderators/staff/system, attachment uploaders, bookmarking and flagging actions, and last-post author rollups); commerce/invoicing (bill-to customer with payment/AR status); role-based assignments such as competition judging; and producer/vendor roles where members own products that participate in competitions and accrue awards. Member also supports an LMS and content library: members as learners with per-course enrollments, progress, scores, completions, and certificates; and as content authors/contributors, editors, and reviewers (e.g., AuthorID/EditedByID) and uploaders of resource versions, with audit trails and consumption attribution used for analytics, interest scoring, and gating/compliance checks.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the member record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s unique email address, likely used for contact and login/identity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'FirstName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'FirstName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s given name.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'FirstName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LastName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LastName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s family/surname.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LastName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s job title or role at their organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'OrganizationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'OrganizationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the member’s employer or associated organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'OrganizationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Industry'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Industry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s industry classification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Industry';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'JobFunction'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'JobFunction';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s functional role (e.g., Sales, Quality Control, Executive).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'JobFunction';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'YearsInProfession'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'YearsInProfession';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Self-reported years of experience in the profession.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'YearsInProfession';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'JoinDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'JoinDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the individual joined the association/platform.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'JoinDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LinkedInURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LinkedInURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the member’s LinkedIn profile.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LinkedInURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Bio'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Bio';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text biography for the member’s profile.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Bio';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'PreferredLanguage'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'PreferredLanguage';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Language/locale preference for communications and UI.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'PreferredLanguage';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Timezone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Timezone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member’s time zone for scheduling and notifications.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Timezone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Phone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Phone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary phone number (likely work phone).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Phone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Mobile'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Mobile';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Mobile phone number.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Mobile';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City of the member’s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State or province of the member’s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the member’s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'PostalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'PostalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal or ZIP code of the member’s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'PostalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'EngagementScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'EngagementScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated metric representing member engagement.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'EngagementScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LastActivityDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LastActivityDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the member’s most recent activity on the platform.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LastActivityDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'ProfilePhotoURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'ProfilePhotoURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the member’s profile image/avatar.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'ProfilePhotoURL';
GO

-- Table: AssociationDemo.MemberFollow
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.MemberFollow stores member-initiated follow/subscription relationships to various entity types (members, forum threads, categories, and tags), including when the follow was created and whether the follower wants notifications about activity. It enables feed/notification features across the community platform.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the follow record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'FollowerID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'FollowerID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member who is following/subscribing to an entity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'FollowerID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'FollowType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'FollowType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The type of entity being followed (Member, Thread, Category, Tag).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'FollowType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'FollowedEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'FollowedEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier of the target entity being followed; polymorphic depending on FollowType.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'FollowedEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the follow was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MemberFollow'
    AND c.name = 'NotifyOnActivity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MemberFollow',
        @level2type = N'COLUMN',
        @level2name = N'NotifyOnActivity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the follower should receive notifications about activity on the followed entity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MemberFollow',
    @level2type = N'COLUMN',
    @level2name = N'NotifyOnActivity';
GO

-- Table: AssociationDemo.Membership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Membership stores the lifecycle records of an individual''s membership with the association. Each row represents one membership term for a member under a specific membership type, capturing status, start/end dates, renewal details, and auto-renew preferences.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the membership term record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member to whom this membership term belongs.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'MembershipTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'MembershipTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The type/category of membership for this term (e.g., Student, Corporate).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'MembershipTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the membership term (Active, Lapsed, Cancelled; allowed also Pending, Suspended).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership term begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership term ends.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'RenewalDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'RenewalDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date on which the membership was renewed or is scheduled/processed for renewal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'RenewalDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'AutoRenew'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'AutoRenew';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this membership term is set to auto-renew.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'AutoRenew';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'CancellationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'CancellationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership term was cancelled before its EndDate.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'CancellationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'CancellationReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'CancellationReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason provided for cancelling the membership term.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'CancellationReason';
GO

-- Table: AssociationDemo.MembershipType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the catalog of membership types offered by the association (e.g., Student, Corporate, Lifetime), including pricing, renewal cadence, eligibility/approval rules, and benefit summaries. It serves as a lookup/configuration table used to classify individual membership records in AssociationDemo.Membership and to drive dues and renewal logic.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate unique identifier for each membership type.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name of the membership type.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short narrative describing the membership type and its intent/eligibility.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'AnnualDues'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'AnnualDues';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard dues amount for the type, typically per year; can be zero for complimentary types.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'AnnualDues';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'RenewalPeriodMonths'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'RenewalPeriodMonths';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The renewal interval in months for this type (e.g., 12 for annual, very large for lifetime).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'RenewalPeriodMonths';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this membership type is currently offered/usable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'AllowAutoRenew'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'AllowAutoRenew';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether members of this type may be automatically renewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'AllowAutoRenew';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'RequiresApproval'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'RequiresApproval';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether joining this type requires manual review/approval.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'RequiresApproval';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Benefits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Benefits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed list of benefits and entitlements included with the membership type.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Benefits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UI ordering hint for how membership types should be presented.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO

-- Table: AssociationDemo.Organization
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores organizations/companies (employers, corporate members, partners, vendors) with profile, location, and optional financial/public-market details. Acts as the master organization directory used to optionally link members to an employer/partner; member records also carry their own Industry and JobFunction tags, so organization data is primarily for entity profiles rather than member classification.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the organization record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official organization name.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Industry'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Industry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Industry or sector classification for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Industry';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'EmployeeCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'EmployeeCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Approximate number of employees.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'EmployeeCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'AnnualRevenue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'AnnualRevenue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Estimated annual revenue for the organization (in currency units).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'AnnualRevenue';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'MarketCapitalization'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'MarketCapitalization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public market capitalization for publicly traded organizations.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'MarketCapitalization';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'TickerSymbol'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'TickerSymbol';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock ticker symbol if the organization is publicly traded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'TickerSymbol';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Exchange'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Exchange';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock exchange where the ticker is listed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Exchange';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official website URL of the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short description or summary of the organization’s activities or offerings.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'YearFounded'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'YearFounded';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Year the organization was founded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'YearFounded';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City of the organization’s primary location or headquarters.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State or province of the primary location.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the primary location; defaults to United States.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'PostalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'PostalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal or ZIP code for the organization’s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'PostalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Phone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Phone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary contact phone number for the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Phone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'LogoURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'LogoURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the organization’s logo image.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'LogoURL';
GO

-- Table: AssociationDemo.Payment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual payment transactions applied to invoices, including amount, method, gateway transaction reference, status, and processing timestamps. Each row represents a single payment recorded against an invoice in the billing workflow.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the payment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the invoice this payment is applied to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'PaymentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'PaymentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the payment was made or recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'PaymentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Amount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Amount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary amount of the payment applied to the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Amount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'PaymentMethod'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'PaymentMethod';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Method used to pay the invoice (e.g., Credit Card, ACH, PayPal, Stripe).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'PaymentMethod';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'TransactionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'TransactionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'External or system transaction reference for the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'TransactionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current outcome of the payment transaction (e.g., Completed, Failed).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'ProcessedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'ProcessedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the payment was processed/posted by the system or gateway.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'ProcessedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'FailureReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'FailureReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reason provided when a payment fails.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'FailureReason';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional internal notes about the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO

-- Table: AssociationDemo.PolicyPosition
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.PolicyPosition stores the association’s formal stance on specific legislative or regulatory issues tracked in AssociationDemo.LegislativeIssue, including the selected position, public-facing statement, rationale, adoption metadata (who adopted it and when), priority for advocacy, visibility flag, and optional supporting link and contact.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the policy position record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'LegislativeIssueID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'LegislativeIssueID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the legislative or regulatory issue this position addresses.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'LegislativeIssueID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'Position'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'Position';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The association’s stance on the issue (e.g., Support, Support with Amendments, Oppose, Neutral, Monitoring).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'Position';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'PositionStatement'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'PositionStatement';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public-facing summary of the association’s position on the issue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'PositionStatement';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'Rationale'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'Rationale';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Explanation of the reasoning behind the position, including conditions or implementation requests.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'Rationale';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'AdoptedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'AdoptedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the position was formally adopted by the approving body.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'AdoptedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'AdoptedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'AdoptedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Governing body that adopted the position (e.g., Board of Directors, Chapter Board).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'AdoptedBy';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional date when the position expires or is scheduled for sunset.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'Priority'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'Priority';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Advocacy priority level for the issue tied to this position (Low, Medium, High, Critical).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'Priority';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'IsPublic'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'IsPublic';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the position is intended for public display.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'IsPublic';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'DocumentURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'DocumentURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to a detailed policy brief or supporting document.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'DocumentURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'ContactPerson'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'ContactPerson';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional internal contact responsible for inquiries about the position.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'ContactPerson';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PolicyPosition'
    AND c.name = 'LastReviewedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PolicyPosition',
        @level2type = N'COLUMN',
        @level2name = N'LastReviewedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional date when the position was last reviewed for accuracy or currency.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PolicyPosition',
    @level2type = N'COLUMN',
    @level2name = N'LastReviewedDate';
GO

-- Table: AssociationDemo.PostAttachment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores files attached to forum posts, including storage location, MIME type, file size, upload audit fields, and a running download counter. It links each attachment to a specific post and the member who uploaded it, enabling display, access control, and analytics for attachments within the community forums.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the attachment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'PostID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'PostID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the forum post this file is attached to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'PostID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'FileName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'FileName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User-visible name of the uploaded file (original filename).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'FileName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'FileURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'FileURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Canonical storage URL or path to the attachment in the system’s attachment store/CDN.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'FileURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'FileType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'FileType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MIME type of the file for content handling (e.g., image/jpeg, application/pdf).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'FileType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'FileSizeBytes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'FileSizeBytes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Size of the file in bytes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'FileSizeBytes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'UploadedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'UploadedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the attachment was uploaded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'UploadedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'UploadedByID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'UploadedByID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member who uploaded the attachment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'UploadedByID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostAttachment'
    AND c.name = 'DownloadCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostAttachment',
        @level2type = N'COLUMN',
        @level2name = N'DownloadCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cumulative number of times the attachment has been downloaded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostAttachment',
    @level2type = N'COLUMN',
    @level2name = N'DownloadCount';
GO

-- Table: AssociationDemo.PostReaction
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual member reactions to forum posts, including likes, thanks, helpful votes, bookmarks, and flags, with timestamps. Each row records a single member’s reaction on a specific post.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the reaction record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND c.name = 'PostID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction',
        @level2type = N'COLUMN',
        @level2name = N'PostID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The forum post that received the reaction.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction',
    @level2type = N'COLUMN',
    @level2name = N'PostID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The member who performed the reaction (liking, thanking, marking helpful, bookmarking, or flagging).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND c.name = 'ReactionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction',
        @level2type = N'COLUMN',
        @level2name = N'ReactionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of reaction applied to the post: Like, Helpful, Thanks, Bookmark, or Flag.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction',
    @level2type = N'COLUMN',
    @level2name = N'ReactionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostReaction'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostReaction',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the reaction was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostReaction',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO

-- Table: AssociationDemo.PostTag
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostTag'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostTag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the tags applied to forum posts. Each row represents one tag assignment for a single post in AssociationDemo.ForumPost, capturing the tag label and when it was added.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostTag';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostTag'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostTag',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the tag assignment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostTag',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostTag'
    AND c.name = 'PostID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostTag',
        @level2type = N'COLUMN',
        @level2name = N'PostID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the forum post that this tag is applied to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostTag',
    @level2type = N'COLUMN',
    @level2name = N'PostID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostTag'
    AND c.name = 'TagName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostTag',
        @level2type = N'COLUMN',
        @level2name = N'TagName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The tag label applied to the post, drawn from a controlled set of topic categories.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostTag',
    @level2type = N'COLUMN',
    @level2name = N'TagName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'PostTag'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'PostTag',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this tag assignment was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'PostTag',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO

-- Table: AssociationDemo.Product
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores member-produced cheese products with classification, attributes, pricing, and tasting/pairing details; acts as the master product catalog for sales/pricing and competition participation (entries, scoring, rankings, awards); and serves as the public-facing source for external catalogs/websites where product-level awards and recognition are displayed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the product record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The producing/owning member associated with this product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'CategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'CategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cheese category/style (and sub-style) classification for the product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'CategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Marketed name of the cheese product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'General product description summarizing style and characteristics.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'CheeseType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'CheeseType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'High-level cheese type (e.g., Cheddar, Blue) denormalized for convenience.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'CheeseType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'MilkSource'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'MilkSource';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Animal milk source used to produce the cheese.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'MilkSource';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'AgeMonths'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'AgeMonths';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maturation/aging time in months.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'AgeMonths';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'Weight'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Weight';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Packaged weight of the product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Weight';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'WeightUnit'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'WeightUnit';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unit of measure for Weight (defaults to ounces).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'WeightUnit';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'RetailPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'RetailPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Suggested/standard retail price for the product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'RetailPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'IsOrganic'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'IsOrganic';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the product is certified organic.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'IsOrganic';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'IsRawMilk'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'IsRawMilk';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the cheese is made from raw milk.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'IsRawMilk';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'IsAwardWinner'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'IsAwardWinner';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quick flag indicating the product has won at least one award.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'IsAwardWinner';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'DateIntroduced'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'DateIntroduced';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the product was introduced or added to the catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'DateIntroduced';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status of the product (Active, Seasonal, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'ImageURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ImageURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to a product image.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ImageURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'TastingNotes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'TastingNotes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed tasting profile for the cheese.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'TastingNotes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'PairingNotes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'PairingNotes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recommended beverage/food pairings.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'PairingNotes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'ProductionMethod'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductionMethod';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional notes about how the cheese is produced.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductionMethod';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Product'
    AND c.name = 'AwardCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'AwardCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of awards the product has received.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'AwardCount';
GO

-- Table: AssociationDemo.ProductAward
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores product-level award records resulting from industry competitions, linking a specific product and its competition entry to the award details (level, category, score, date) and optional display metadata for public/marketing use.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the award record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the product that received the award.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'CompetitionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'CompetitionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the competition event where the award was granted.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'CompetitionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'CompetitionEntryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'CompetitionEntryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the specific competition entry for this product in that event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'CompetitionEntryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'AwardName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'AwardName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display-friendly name of the award, often combining event and level (e.g., ''World Championship Cheese Contest - Gold'').',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'AwardName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'AwardLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'AwardLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standardized award level received (Gold, Silver, Bronze, Best in Show).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'AwardLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'AwardingOrganization'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'AwardingOrganization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the organization that issued the award.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'AwardingOrganization';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'AwardDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'AwardDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the award was conferred/announced.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'AwardDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'Year'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'Year';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Convenience year extracted from the award date for filtering and reporting.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'Year';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judging category or cheese style under which the product was evaluated.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'Score'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'Score';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Judging score associated with the entry/award.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'Score';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional narrative or notes about the award.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'CertificateURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'CertificateURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to a digital award certificate or announcement page.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'CertificateURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'IsDisplayed'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'IsDisplayed';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether this award should be shown publicly (e.g., on product pages).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'IsDisplayed';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductAward'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductAward',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering index for presenting multiple awards for the same product.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductAward',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO

-- Table: AssociationDemo.ProductCategory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores a hierarchical taxonomy of cheese categories (top-level styles and sub-styles) used to classify products and to define competition judging brackets. Supports self-referential parent-child relationships, curated sibling display ordering, activation status, and optional imagery for each category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for a category (sequential GUID).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable category name (e.g., Fresh Cheese, Brie-Style).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Explanatory text describing the category’s characteristics.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'ParentCategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'ParentCategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to the parent category, enabling a two-level hierarchy of styles and sub-styles.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'ParentCategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Integer used to control the display sequence of categories within the same parent.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the category is active/usable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ProductCategory'
    AND c.name = 'ImageURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'ImageURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional URL to an image representing the category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'ImageURL';
GO

-- Table: AssociationDemo.RegulatoryComment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores regulatory/public comments submitted in response to tracked policy items, capturing the comment text, submitter and submission details, docket identifier, applicable comment window, workflow status, and optional attachments, all linked to the related policy item in AssociationDemo.LegislativeIssue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the regulatory comment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'LegislativeIssueID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'LegislativeIssueID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the policy item (bill/rule/regulation) this comment addresses.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'LegislativeIssueID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'DocketNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'DocketNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'External regulatory docket identifier associated with the comment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'DocketNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'CommentPeriodStart'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'CommentPeriodStart';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Start date of the official comment window for the docket/issue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'CommentPeriodStart';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'CommentPeriodEnd'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'CommentPeriodEnd';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End date of the official comment window for the docket/issue.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'CommentPeriodEnd';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'SubmittedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'SubmittedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the comment was submitted to the regulatory body/portal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'SubmittedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'SubmittedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'SubmittedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text name of the submitter (organization or individual).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'SubmittedBy';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'CommentText'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'CommentText';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full content of the submitted comment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'CommentText';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'CommentType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'CommentType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the comment submitter or format: Individual, Organization, Technical, Coalition, or Public Hearing.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'CommentType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'AttachmentURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'AttachmentURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to supporting attachments (e.g., PDFs) submitted with the comment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'AttachmentURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'ConfirmationNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'ConfirmationNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional external confirmation or tracking number from the submission portal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'ConfirmationNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Workflow state of the comment (Draft, Submitted, Acknowledged, Published, Considered, Rejected).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'Response'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'Response';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional text capturing an agency response or internal disposition/summary.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'Response';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'RegulatoryComment'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'RegulatoryComment',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional internal notes about the comment for staff use.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'RegulatoryComment',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO

-- Table: AssociationDemo.Resource
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AssociationDemo.Resource is the canonical header record for the association’s content-library items (documents, PDFs, spreadsheets, templates, articles, videos, and external links). It stores authoritative metadata such as title/description, resource type, category, author, publication status/dates, access controls, and aggregated engagement fields. Binary files are managed in AssociationDemo.ResourceVersion, which holds per-version file URL/MIME/size and supports flexible version labels with a designated current version—separating master metadata from versioned artifacts. The Resource row anchors related event-level downloads (capturing IP and user agent for analytics/audit), member ratings and textual reviews (1–5 stars; schema allows multiple reviews per member per resource), and many-to-many free-text tags (no tag master), enabling search/filtering and roll-up metrics at the resource level.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the resource; uniquely identifies each content item.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'CategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'CategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the resource’s category used for navigation, grouping, and access policies.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'CategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable title of the resource as shown in listings and detail pages.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short summary or abstract describing the resource content.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'ResourceType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'ResourceType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classification of the resource format (e.g., PDF, Video, Link, Template).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'ResourceType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'FileURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'FileURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Path or URL to the file or external resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'FileURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'FileSizeBytes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'FileSizeBytes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Size of the stored file in bytes; 0 when not applicable (e.g., external links).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'FileSizeBytes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'MimeType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'MimeType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MIME type of the resource (e.g., application/pdf, video/mp4, text/html).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'MimeType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'AuthorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'AuthorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the member who authored or uploaded the resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'AuthorID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'PublishedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'PublishedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the resource was published or made visible; defaults to creation time.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'PublishedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'LastUpdatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'LastUpdatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last content update, if tracked.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'LastUpdatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'ViewCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'ViewCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the resource detail page has been viewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'ViewCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'DownloadCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'DownloadCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the resource file has been downloaded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'DownloadCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'AverageRating'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'AverageRating';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Aggregate average user rating for the resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'AverageRating';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'RatingCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'RatingCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of ratings received for the resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'RatingCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'IsFeatured'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'IsFeatured';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the resource should be highlighted in the library.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'IsFeatured';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'RequiresMembership'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'RequiresMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating the resource is gated and requires an active membership to access.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'RequiresMembership';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Resource'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Resource',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of the resource (Draft, Published, Archived, Deleted).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Resource',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO

-- Table: AssociationDemo.ResourceCategory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the hierarchical set of categories for the association’s resource/content library, including presentation metadata (icon, color, display order), access control flags (membership required), activation status, and an optional denormalized resource count. Supports multi-level navigation via a self-referencing parent category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the category record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the resource category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longer description explaining the category’s scope and contents.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'ParentCategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'ParentCategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to the parent category to form a hierarchy; NULL indicates a top-level category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'ParentCategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sort order to control how categories are listed among siblings.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'Icon'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'Icon';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UI icon (e.g., Font Awesome class) used when displaying the category.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'Icon';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'Color'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'Color';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color code for theming the category in the UI.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'Color';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the category is active and should be shown.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'RequiresMembership'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'RequiresMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating that access to this category (and its resources) is limited to members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'RequiresMembership';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceCategory'
    AND c.name = 'ResourceCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceCategory',
        @level2type = N'COLUMN',
        @level2name = N'ResourceCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized count of resources associated with the category (possibly including descendants) for display/performance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceCategory',
    @level2type = N'COLUMN',
    @level2name = N'ResourceCount';
GO

-- Table: AssociationDemo.ResourceDownload
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores a detailed audit trail of member-initiated downloads of content library resources. Each row represents a single download event, linking a member to a resource with timestamp, originating IP, and browser/user agent for analytics, security, and engagement reporting.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the download event record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'ResourceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'ResourceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the content resource that was downloaded.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'ResourceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the member who initiated the download.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'DownloadDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'DownloadDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the download occurred (insertion time).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'DownloadDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'IPAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'IPAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IP address from which the download was made; used for security, geolocation, and analytics.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'IPAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceDownload'
    AND c.name = 'UserAgent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceDownload',
        @level2type = N'COLUMN',
        @level2name = N'UserAgent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Browser/OS user agent string of the client performing the download.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceDownload',
    @level2type = N'COLUMN',
    @level2name = N'UserAgent';
GO

-- Table: AssociationDemo.ResourceRating
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores member-submitted ratings and written reviews for items in the content library. Each row represents a single review event by a member on a specific resource, capturing a 1–5 star score, optional commentary, creation timestamp, and a helpfulness flag.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the review record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'ResourceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'ResourceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the content library resource being rated/reviewed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'ResourceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the member who authored the rating/review.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'Rating'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'Rating';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric star rating for the resource on a 1–5 scale.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'Rating';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'Review'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'Review';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text review/comments provided by the member.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'Review';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the review was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceRating'
    AND c.name = 'IsHelpful'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceRating',
        @level2type = N'COLUMN',
        @level2name = N'IsHelpful';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating the review is marked or considered helpful (e.g., by moderation or default).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceRating',
    @level2type = N'COLUMN',
    @level2name = N'IsHelpful';
GO

-- Table: AssociationDemo.ResourceTag
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceTag'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceTag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the tags applied to content library resources, one row per tag assignment. It links a resource in AssociationDemo.Resource to a free-text TagName and captures when the tag was added.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceTag';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceTag'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceTag',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the tag assignment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceTag',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceTag'
    AND c.name = 'ResourceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceTag',
        @level2type = N'COLUMN',
        @level2name = N'ResourceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the resource being tagged.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceTag',
    @level2type = N'COLUMN',
    @level2name = N'ResourceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceTag'
    AND c.name = 'TagName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceTag',
        @level2type = N'COLUMN',
        @level2name = N'TagName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The free-text tag applied to the resource (keyword/label).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceTag',
    @level2type = N'COLUMN',
    @level2name = N'TagName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceTag'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceTag',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the tag was added to the resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceTag',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO

-- Table: AssociationDemo.ResourceVersion
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the file-based version history for items in the content library. Each row represents a specific version of a resource, including its version label, release notes, file location and size, creator, creation date, and whether it is the current version.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the resource version record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'ResourceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'ResourceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the resource this version belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'ResourceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'VersionNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'VersionNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable version label for the resource (semantic or date-based).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'VersionNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'VersionNotes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'VersionNotes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Release notes or change log describing what changed in this version.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'VersionNotes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'FileURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'FileURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Path/URL to the versioned file stored by the system (e.g., PDF, DOCX, XLSX).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'FileURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'FileSizeBytes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'FileSizeBytes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Size of the file at FileURL in bytes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'FileSizeBytes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'CreatedByID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'CreatedByID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the member who uploaded/created this version.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'CreatedByID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'CreatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'CreatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this version record was created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'CreatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ResourceVersion'
    AND c.name = 'IsCurrent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ResourceVersion',
        @level2type = N'COLUMN',
        @level2name = N'IsCurrent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether this is the current (active) version for the resource.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ResourceVersion',
    @level2type = N'COLUMN',
    @level2name = N'IsCurrent';
GO

-- Table: AssociationDemo.Segment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores definitions of member audience segments used for targeting, reporting, and campaigns. Each row defines a segment (e.g., Active Members, Lapsed Members, West Coast Region) with its type/category, an optional filter definition, a cached member count with last calculated timestamp, and an active flag. It serves as a lookup/master list of segments referenced by campaign membership records.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID for the segment definition.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name of the segment (e.g., Active Members, West Coast Region).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief explanation of the segment’s criteria or purpose.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'SegmentType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'SegmentType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category/classification of the segment (e.g., Membership Status, Industry, Geography).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'SegmentType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'FilterCriteria'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'FilterCriteria';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Serialized or textual definition of the rules/filters that determine segment membership.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'FilterCriteria';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'MemberCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'MemberCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached count of members currently matching the segment at the time of last calculation.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'MemberCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'LastCalculatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'LastCalculatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the segment’s member count (and possibly membership) was last computed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'LastCalculatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the segment is active and available for use.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
