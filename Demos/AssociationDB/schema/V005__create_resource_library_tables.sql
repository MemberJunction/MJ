/******************************************************************************
 * Association Sample Database - Resource Library Domain
 * File: V005__create_resource_library_tables.sql
 *
 * This file creates the Resource Library tables for knowledge management.
 * All tables use the [AssociationDemo] schema prefix to avoid naming conflicts.
 *
 * Domain: Resource Library/Knowledge Base
 * - ResourceCategory: Hierarchical organization of resources
 * - Resource: Documents, files, articles, and knowledge base content
 * - ResourceVersion: Version control for updated resources
 * - ResourceDownload: Download tracking and analytics
 * - ResourceRating: Member ratings and reviews
 * - ResourceTag: Tagging for searchability
 *
 * Total Tables: 6
 ******************************************************************************/

-- ============================================================================
-- RESOURCE LIBRARY DOMAIN
-- ============================================================================

-- ============================================================================
-- ResourceCategory Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ResourceCategory] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [ParentCategoryID] UNIQUEIDENTIFIER,
    [DisplayOrder] INT DEFAULT 0,
    [Icon] NVARCHAR(100),
    [Color] NVARCHAR(50),
    [IsActive] BIT DEFAULT 1,
    [RequiresMembership] BIT DEFAULT 0,
    [ResourceCount] INT DEFAULT 0,
    CONSTRAINT FK_ResourceCategory_Parent FOREIGN KEY ([ParentCategoryID])
        REFERENCES [AssociationDemo].[ResourceCategory]([ID])
);
GO

-- ============================================================================
-- Resource Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Resource] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(500) NOT NULL,
    [Description] NVARCHAR(MAX),
    [ResourceType] NVARCHAR(50) NOT NULL CHECK ([ResourceType] IN ('PDF', 'Video', 'Article', 'Template', 'Spreadsheet', 'Presentation', 'Link', 'Document')),
    [FileURL] NVARCHAR(1000),
    [FileSizeBytes] BIGINT,
    [MimeType] NVARCHAR(100),
    [AuthorID] UNIQUEIDENTIFIER,
    [PublishedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [LastUpdatedDate] DATETIME,
    [ViewCount] INT DEFAULT 0,
    [DownloadCount] INT DEFAULT 0,
    [AverageRating] DECIMAL(3,2) DEFAULT 0,
    [RatingCount] INT DEFAULT 0,
    [IsFeatured] BIT DEFAULT 0,
    [RequiresMembership] BIT DEFAULT 0,
    [Status] NVARCHAR(20) DEFAULT 'Published' CHECK ([Status] IN ('Draft', 'Published', 'Archived', 'Deleted')),
    CONSTRAINT FK_Resource_Category FOREIGN KEY ([CategoryID])
        REFERENCES [AssociationDemo].[ResourceCategory]([ID]),
    CONSTRAINT FK_Resource_Author FOREIGN KEY ([AuthorID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ResourceVersion Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ResourceVersion] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ResourceID] UNIQUEIDENTIFIER NOT NULL,
    [VersionNumber] NVARCHAR(20) NOT NULL,
    [VersionNotes] NVARCHAR(MAX),
    [FileURL] NVARCHAR(1000),
    [FileSizeBytes] BIGINT,
    [CreatedByID] UNIQUEIDENTIFIER NOT NULL,
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [IsCurrent] BIT DEFAULT 0,
    CONSTRAINT FK_ResourceVersion_Resource FOREIGN KEY ([ResourceID])
        REFERENCES [AssociationDemo].[Resource]([ID]),
    CONSTRAINT FK_ResourceVersion_CreatedBy FOREIGN KEY ([CreatedByID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ResourceDownload Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ResourceDownload] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ResourceID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [DownloadDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [IPAddress] NVARCHAR(50),
    [UserAgent] NVARCHAR(500),
    CONSTRAINT FK_ResourceDownload_Resource FOREIGN KEY ([ResourceID])
        REFERENCES [AssociationDemo].[Resource]([ID]),
    CONSTRAINT FK_ResourceDownload_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ResourceRating Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ResourceRating] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ResourceID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Rating] INT NOT NULL CHECK ([Rating] BETWEEN 1 AND 5),
    [Review] NVARCHAR(MAX),
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [IsHelpful] BIT DEFAULT 1,
    CONSTRAINT FK_ResourceRating_Resource FOREIGN KEY ([ResourceID])
        REFERENCES [AssociationDemo].[Resource]([ID]),
    CONSTRAINT FK_ResourceRating_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT UQ_ResourceRating_MemberResource UNIQUE ([ResourceID], [MemberID])
);
GO

-- ============================================================================
-- ResourceTag Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ResourceTag] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ResourceID] UNIQUEIDENTIFIER NOT NULL,
    [TagName] NVARCHAR(100) NOT NULL,
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ResourceTag_Resource FOREIGN KEY ([ResourceID])
        REFERENCES [AssociationDemo].[Resource]([ID]),
    CONSTRAINT UQ_ResourceTag_ResourceTag UNIQUE ([ResourceID], [TagName])
);
GO
