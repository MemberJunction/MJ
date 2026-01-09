/*******************************************************************************
 * Migration: Add Agent Memory Lifecycle Management Fields
 *
 * Purpose: Enable lifecycle management for auto-generated notes and examples
 *          to prevent unbounded growth of memory data.
 *
 * Changes:
 *   1. AIAgentNote - Add LastAccessedAt, AccessCount, ExpiresAt columns
 *   2. AIAgentExample - Add LastAccessedAt, AccessCount, ExpiresAt columns
 *   3. AIAgentNote/Example - Add 'Archived' status value
 *   4. AIAgent - Add retention configuration columns
 *
 * Design:
 *   - LastAccessedAt: Track when note/example was last injected into context
 *   - AccessCount: Track usage frequency for analytics and cleanup decisions
 *   - ExpiresAt: Optional TTL for time-bounded notes
 *   - Archived status: Soft-delete for notes that are no longer relevant
 *   - Per-agent retention config: NoteRetentionDays, ExampleRetentionDays, AutoArchiveEnabled
 ******************************************************************************/

-- ============================================================================
-- 1. AIAgentNote - Add lifecycle columns
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    LastAccessedAt DATETIMEOFFSET NULL,
    AccessCount INT NOT NULL DEFAULT 0,
    ExpiresAt DATETIMEOFFSET NULL;
GO

-- ============================================================================
-- 2. AIAgentExample - Add lifecycle columns
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentExample ADD
    LastAccessedAt DATETIMEOFFSET NULL,
    AccessCount INT NOT NULL DEFAULT 0,
    ExpiresAt DATETIMEOFFSET NULL;
GO

-- ============================================================================
-- 3. AIAgent - Add retention configuration columns
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    NoteRetentionDays INT NULL DEFAULT 90,
    ExampleRetentionDays INT NULL DEFAULT 180,
    AutoArchiveEnabled BIT NOT NULL DEFAULT 1;
GO

-- ============================================================================
-- 4. Update Status field values to include 'Archived'
-- ============================================================================

-- Update AIAgentNote Status constraint to allow 'Archived'
-- First drop existing constraint if any, then add updated one
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_AIAgentNote_Status' AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentNote'))
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.AIAgentNote DROP CONSTRAINT CK_AIAgentNote_Status;
END
GO

-- Note: We don't add check constraint here since MJ uses EntityFieldValues for value lists
-- The 'Archived' value will be added to EntityFieldValue in the metadata section below

-- ============================================================================
-- Extended Properties - Column Descriptions
-- ============================================================================

-- AIAgentNote lifecycle columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of when this note was last accessed/injected into agent context. Used for lifecycle management and cleanup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'LastAccessedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this note has been accessed/injected into agent context. Used for analytics and determining note value.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'AccessCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional expiration timestamp. Notes past this date are candidates for archival. NULL means no expiration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'ExpiresAt';

-- AIAgentExample lifecycle columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of when this example was last accessed/used for agent context. Used for lifecycle management and cleanup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'LastAccessedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this example has been accessed/used. Used for analytics and determining example value.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'AccessCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional expiration timestamp. Examples past this date are candidates for archival. NULL means no expiration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'ExpiresAt';

-- AIAgent retention configuration columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of days to retain notes before archiving due to inactivity. Default 90. NULL means use system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'NoteRetentionDays';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of days to retain examples before archiving due to inactivity. Default 180. NULL means use system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'ExampleRetentionDays';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether automatic archival of stale notes/examples is enabled for this agent. Default true.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AutoArchiveEnabled';

-- ============================================================================
-- Metadata Updates - EntityField and EntityFieldValue
-- ============================================================================

-- Get Entity IDs for the tables we're updating
DECLARE @AIAgentNoteEntityID UNIQUEIDENTIFIER;
DECLARE @AIAgentExampleEntityID UNIQUEIDENTIFIER;
DECLARE @AIAgentEntityID UNIQUEIDENTIFIER;

SELECT @AIAgentNoteEntityID = ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Notes';
SELECT @AIAgentExampleEntityID = ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Examples';
SELECT @AIAgentEntityID = ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agents';

-- Add 'Archived' to AIAgentNote Status field values
DECLARE @NoteStatusFieldID UNIQUEIDENTIFIER;
SELECT @NoteStatusFieldID = ID FROM ${flyway:defaultSchema}.EntityField
WHERE EntityID = @AIAgentNoteEntityID AND Name = 'Status';

IF @NoteStatusFieldID IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue
    WHERE EntityFieldID = @NoteStatusFieldID AND Value = 'Archived'
)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (EntityFieldID, Sequence, Value, Code)
    VALUES (@NoteStatusFieldID, 4, 'Archived', 'Archived');
END

-- Add 'Archived' to AIAgentExample Status field values (if Status field exists)
DECLARE @ExampleStatusFieldID UNIQUEIDENTIFIER;
SELECT @ExampleStatusFieldID = ID FROM ${flyway:defaultSchema}.EntityField
WHERE EntityID = @AIAgentExampleEntityID AND Name = 'Status';

IF @ExampleStatusFieldID IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue
    WHERE EntityFieldID = @ExampleStatusFieldID AND Value = 'Archived'
)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (EntityFieldID, Sequence, Value, Code)
    VALUES (@ExampleStatusFieldID, 4, 'Archived', 'Archived');
END

-- ============================================================================
-- Create index for lifecycle queries
-- ============================================================================

-- Index for finding stale notes (used by cleanup job)
CREATE NONCLUSTERED INDEX IX_AIAgentNote_Lifecycle
    ON ${flyway:defaultSchema}.AIAgentNote(Status, LastAccessedAt, IsAutoGenerated)
    WHERE Status = 'Active' AND IsAutoGenerated = 1;

-- Index for finding stale examples (used by cleanup job)
CREATE NONCLUSTERED INDEX IX_AIAgentExample_Lifecycle
    ON ${flyway:defaultSchema}.AIAgentExample(Status, LastAccessedAt, IsAutoGenerated)
    WHERE Status = 'Active' AND IsAutoGenerated = 1;

-- Index for expired items
CREATE NONCLUSTERED INDEX IX_AIAgentNote_ExpiresAt
    ON ${flyway:defaultSchema}.AIAgentNote(ExpiresAt)
    WHERE ExpiresAt IS NOT NULL AND Status = 'Active';

CREATE NONCLUSTERED INDEX IX_AIAgentExample_ExpiresAt
    ON ${flyway:defaultSchema}.AIAgentExample(ExpiresAt)
    WHERE ExpiresAt IS NOT NULL AND Status = 'Active';
