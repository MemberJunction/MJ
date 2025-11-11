/******************************************************************************
 * Association Sample Database - Community/Forums Domain
 * File: V004__create_community_tables.sql
 *
 * This file creates the Community and Forums tables for member engagement.
 * All tables use the [AssociationDemo] schema prefix to avoid naming conflicts.
 *
 * Domain: Community/Forums
 * - ForumCategory: Hierarchical discussion organization
 * - ForumThread: Discussion topics
 * - ForumPost: Original posts and replies
 * - PostReaction: Likes, helpful votes, bookmarks
 * - PostTag: Content organization tags
 * - MemberFollow: Following members, threads, categories
 * - PostAttachment: Images, documents, videos
 * - ForumModeration: Flagged content and moderation
 *
 * Total Tables: 8
 ******************************************************************************/

-- ============================================================================
-- COMMUNITY/FORUMS DOMAIN
-- ============================================================================

-- ============================================================================
-- ForumCategory Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ForumCategory] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [ParentCategoryID] UNIQUEIDENTIFIER,
    [DisplayOrder] INT DEFAULT 0,
    [Icon] NVARCHAR(100),
    [Color] NVARCHAR(50),
    [IsActive] BIT DEFAULT 1,
    [RequiresMembership] BIT DEFAULT 0,
    [ThreadCount] INT DEFAULT 0,
    [PostCount] INT DEFAULT 0,
    [LastPostDate] DATETIME,
    [LastPostAuthorID] UNIQUEIDENTIFIER,
    CONSTRAINT FK_ForumCategory_Parent FOREIGN KEY ([ParentCategoryID])
        REFERENCES [AssociationDemo].[ForumCategory]([ID]),
    CONSTRAINT FK_ForumCategory_LastPostAuthor FOREIGN KEY ([LastPostAuthorID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ForumThread Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ForumThread] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(500) NOT NULL,
    [AuthorID] UNIQUEIDENTIFIER NOT NULL,
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [ViewCount] INT DEFAULT 0,
    [ReplyCount] INT DEFAULT 0,
    [LastActivityDate] DATETIME,
    [LastReplyAuthorID] UNIQUEIDENTIFIER,
    [IsPinned] BIT DEFAULT 0,
    [IsLocked] BIT DEFAULT 0,
    [IsFeatured] BIT DEFAULT 0,
    [Status] NVARCHAR(20) DEFAULT 'Active' CHECK ([Status] IN ('Active', 'Closed', 'Archived', 'Deleted')),
    CONSTRAINT FK_ForumThread_Category FOREIGN KEY ([CategoryID])
        REFERENCES [AssociationDemo].[ForumCategory]([ID]),
    CONSTRAINT FK_ForumThread_Author FOREIGN KEY ([AuthorID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_ForumThread_LastReplyAuthor FOREIGN KEY ([LastReplyAuthorID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ForumPost Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ForumPost] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ThreadID] UNIQUEIDENTIFIER NOT NULL,
    [ParentPostID] UNIQUEIDENTIFIER,
    [AuthorID] UNIQUEIDENTIFIER NOT NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [PostedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [EditedDate] DATETIME,
    [EditedByID] UNIQUEIDENTIFIER,
    [LikeCount] INT DEFAULT 0,
    [HelpfulCount] INT DEFAULT 0,
    [IsAcceptedAnswer] BIT DEFAULT 0,
    [IsFlagged] BIT DEFAULT 0,
    [Status] NVARCHAR(20) DEFAULT 'Published' CHECK ([Status] IN ('Draft', 'Published', 'Edited', 'Deleted', 'Moderated')),
    CONSTRAINT FK_ForumPost_Thread FOREIGN KEY ([ThreadID])
        REFERENCES [AssociationDemo].[ForumThread]([ID]),
    CONSTRAINT FK_ForumPost_Parent FOREIGN KEY ([ParentPostID])
        REFERENCES [AssociationDemo].[ForumPost]([ID]),
    CONSTRAINT FK_ForumPost_Author FOREIGN KEY ([AuthorID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_ForumPost_EditedBy FOREIGN KEY ([EditedByID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- PostReaction Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[PostReaction] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [PostID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [ReactionType] NVARCHAR(50) NOT NULL CHECK ([ReactionType] IN ('Like', 'Helpful', 'Thanks', 'Bookmark', 'Flag')),
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PostReaction_Post FOREIGN KEY ([PostID])
        REFERENCES [AssociationDemo].[ForumPost]([ID]),
    CONSTRAINT FK_PostReaction_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT UQ_PostReaction_MemberPost UNIQUE ([PostID], [MemberID], [ReactionType])
);
GO

-- ============================================================================
-- PostTag Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[PostTag] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [PostID] UNIQUEIDENTIFIER NOT NULL,
    [TagName] NVARCHAR(100) NOT NULL,
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PostTag_Post FOREIGN KEY ([PostID])
        REFERENCES [AssociationDemo].[ForumPost]([ID]),
    CONSTRAINT UQ_PostTag_PostTag UNIQUE ([PostID], [TagName])
);
GO

-- ============================================================================
-- MemberFollow Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[MemberFollow] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [FollowerID] UNIQUEIDENTIFIER NOT NULL,
    [FollowType] NVARCHAR(50) NOT NULL CHECK ([FollowType] IN ('Member', 'Thread', 'Category', 'Tag')),
    [FollowedEntityID] UNIQUEIDENTIFIER NOT NULL,
    [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [NotifyOnActivity] BIT DEFAULT 1,
    CONSTRAINT FK_MemberFollow_Follower FOREIGN KEY ([FollowerID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT UQ_MemberFollow_FollowerEntity UNIQUE ([FollowerID], [FollowType], [FollowedEntityID])
);
GO

-- ============================================================================
-- PostAttachment Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[PostAttachment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [PostID] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FileURL] NVARCHAR(1000) NOT NULL,
    [FileType] NVARCHAR(100),
    [FileSizeBytes] BIGINT,
    [UploadedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [UploadedByID] UNIQUEIDENTIFIER NOT NULL,
    [DownloadCount] INT DEFAULT 0,
    CONSTRAINT FK_PostAttachment_Post FOREIGN KEY ([PostID])
        REFERENCES [AssociationDemo].[ForumPost]([ID]),
    CONSTRAINT FK_PostAttachment_UploadedBy FOREIGN KEY ([UploadedByID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ForumModeration Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ForumModeration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [PostID] UNIQUEIDENTIFIER NOT NULL,
    [ReportedByID] UNIQUEIDENTIFIER NOT NULL,
    [ReportedDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [ReportReason] NVARCHAR(500),
    [ModerationStatus] NVARCHAR(50) DEFAULT 'Pending' CHECK ([ModerationStatus] IN ('Pending', 'Reviewing', 'Approved', 'Removed', 'Dismissed')),
    [ModeratedByID] UNIQUEIDENTIFIER,
    [ModeratedDate] DATETIME,
    [ModeratorNotes] NVARCHAR(MAX),
    [Action] NVARCHAR(100),
    CONSTRAINT FK_ForumModeration_Post FOREIGN KEY ([PostID])
        REFERENCES [AssociationDemo].[ForumPost]([ID]),
    CONSTRAINT FK_ForumModeration_ReportedBy FOREIGN KEY ([ReportedByID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_ForumModeration_ModeratedBy FOREIGN KEY ([ModeratedByID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO
