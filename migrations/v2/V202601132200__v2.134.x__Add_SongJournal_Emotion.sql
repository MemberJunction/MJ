-- =====================================================
-- Migration: Add DetectedEmotion to Song Journal
-- Description: Add AI-detected emotion field to SongJournal table
--              for automatic emotion classification from journal entries
-- Version: v2.134.x
-- Date: 2026-01-13
-- =====================================================

USE MJ_Local;
GO

-- =====================================================
-- 1. ADD DETECTED EMOTION COLUMN
-- =====================================================

ALTER TABLE [spotify].[SongJournal]
ADD [DetectedEmotion] NVARCHAR(100) NULL;

GO

-- Add extended property for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-detected emotion from the journal entry (e.g., Joy, Nostalgia, Melancholy, Energy, Peace, Love)',
    @level0type = N'SCHEMA', @level0name = 'spotify',
    @level1type = N'TABLE', @level1name = 'SongJournal',
    @level2type = N'COLUMN', @level2name = 'DetectedEmotion';

-- Add index for emotion-based queries
CREATE INDEX [IX_SongJournal_DetectedEmotion] ON [spotify].[SongJournal]([DetectedEmotion]);

GO

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

PRINT 'Migration V202601132200__v2.134.x__Add_SongJournal_Emotion.sql completed successfully';
PRINT 'Added column: DetectedEmotion to spotify.SongJournal';
PRINT '';
PRINT 'Next Steps:';
PRINT '  1. Run CodeGen to update entity classes';
PRINT '  2. Create AI Prompt for emotion detection';
PRINT '  3. Create entity subclass with Save() override';
