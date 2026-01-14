-- =====================================================
-- Migration: Add Song Journal for Year-End Reflection
-- Description: Create table for user song journal entries
--              capturing emotional reflections on monthly top songs
-- Version: v2.134.x
-- Date: 2026-01-13
-- =====================================================

-- =====================================================
-- 1. CREATE SONG JOURNAL TABLE
-- =====================================================

CREATE TABLE [spotify].[SongJournal] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [SongID] UNIQUEIDENTIFIER NOT NULL,
    [JournalEntry] NVARCHAR(MAX) NOT NULL,
    [ReflectionYear] INT NOT NULL CHECK (ReflectionYear >= 2020 AND ReflectionYear <= 2100),
    [ReflectionMonth] INT NOT NULL CHECK (ReflectionMonth >= 1 AND ReflectionMonth <= 12),
    CONSTRAINT [PK_SongJournal] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_SongJournal_User] FOREIGN KEY ([UserID])
        REFERENCES [__mj].[User] ([ID]),
    CONSTRAINT [FK_SongJournal_Song] FOREIGN KEY ([SongID])
        REFERENCES [spotify].[Song] ([ID]),
    CONSTRAINT [UK_SongJournal_User_Song_YearMonth] UNIQUE ([UserID], [SongID], [ReflectionYear], [ReflectionMonth])
);

-- Add indexes for common queries
CREATE INDEX [IX_SongJournal_UserID] ON [spotify].[SongJournal]([UserID]);
CREATE INDEX [IX_SongJournal_SongID] ON [spotify].[SongJournal]([SongID]);

-- Add extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User journal entries reflecting on emotional connection to songs',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who wrote the journal entry',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Song the journal entry is about',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'SongID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User written reflection describing how the song made them feel',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'JournalEntry';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Year the song was most listened to (e.g., 2024)',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'ReflectionYear';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Month the song was most listened to (1-12)',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'ReflectionMonth';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

PRINT 'Migration V202601132000__v2.134.x__Add_Song_Journal.sql completed successfully';
PRINT 'Created table: spotify.SongJournal';
PRINT '';
PRINT 'Next Steps:';
PRINT '  1. Run CodeGen to generate entity classes and views';
PRINT '  2. Query top songs by month from ListeningHistory';
PRINT '  3. Build monthly reflection wizard UI';
