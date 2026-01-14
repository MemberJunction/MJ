-- Add month-based fields for AI-generated year playlists
-- Supports monthly song recommendations based on emotional patterns

USE [MJ_Local];
GO

PRINT '================================================';
PRINT 'Adding Month Fields to Playlist Tables';
PRINT '================================================';
PRINT '';

-- =====================================================
-- 1. ADD SOURCE/TARGET YEAR TO PLAYLIST
-- =====================================================

-- SourceYear: The year the emotional patterns were analyzed from
ALTER TABLE [spotify].[Playlist]
ADD [SourceYear] INT NULL;
GO

-- TargetYear: The year the playlist is intended for
ALTER TABLE [spotify].[Playlist]
ADD [TargetYear] INT NULL;
GO

-- PlaylistType: Categorize playlists (e.g., 'YearlyEmotional', 'Custom', 'General')
ALTER TABLE [spotify].[Playlist]
ADD [PlaylistType] NVARCHAR(50) NULL;
GO

-- =====================================================
-- 2. ADD MONTH TO PLAYLISTSONG
-- =====================================================

-- RecommendationMonth: Which month (1-12) this song is recommended for
ALTER TABLE [spotify].[PlaylistSong]
ADD [RecommendationMonth] INT NULL;
GO

-- MatchedEmotion: The emotion this song was matched to
ALTER TABLE [spotify].[PlaylistSong]
ADD [MatchedEmotion] NVARCHAR(50) NULL;
GO

-- AIReason: Why the AI recommended this specific song
ALTER TABLE [spotify].[PlaylistSong]
ADD [AIReason] NVARCHAR(500) NULL;
GO

-- =====================================================
-- 3. ADD CHECK CONSTRAINT FOR MONTH
-- =====================================================

ALTER TABLE [spotify].[PlaylistSong]
ADD CONSTRAINT [CK_PlaylistSong_RecommendationMonth]
CHECK ([RecommendationMonth] IS NULL OR ([RecommendationMonth] >= 1 AND [RecommendationMonth] <= 12));
GO

-- =====================================================
-- 4. ADD INDEX FOR MONTH QUERIES
-- =====================================================

CREATE NONCLUSTERED INDEX [IX_PlaylistSong_RecommendationMonth]
ON [spotify].[PlaylistSong] ([RecommendationMonth])
WHERE [RecommendationMonth] IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX [IX_Playlist_SourceYear_TargetYear]
ON [spotify].[Playlist] ([SourceYear], [TargetYear])
WHERE [SourceYear] IS NOT NULL;
GO

-- =====================================================
-- 5. ADD EXTENDED PROPERTIES
-- =====================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The year from which emotional patterns were analyzed to generate this playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'SourceYear';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The year this playlist is intended to accompany the user through.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'TargetYear';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of playlist: YearlyEmotional, Custom, General, etc.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'PlaylistType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Month (1-12) this song is recommended for in yearly emotional playlists.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'RecommendationMonth';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The emotion from the user journey that this song was matched to.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'MatchedEmotion';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-generated explanation of why this song was recommended.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'AIReason';
GO

-- =====================================================
-- Summary
-- =====================================================
PRINT '';
PRINT '================================================';
PRINT 'PLAYLIST MONTH FIELDS ADDED SUCCESSFULLY';
PRINT '================================================';
PRINT '';
PRINT 'Playlist Table Changes:';
PRINT '  + SourceYear (INT) - Year emotional patterns analyzed from';
PRINT '  + TargetYear (INT) - Year playlist is for';
PRINT '  + PlaylistType (NVARCHAR) - Categorization';
PRINT '';
PRINT 'PlaylistSong Table Changes:';
PRINT '  + RecommendationMonth (INT) - Month 1-12';
PRINT '  + MatchedEmotion (NVARCHAR) - Emotion matched';
PRINT '  + AIReason (NVARCHAR) - Why AI picked this song';
PRINT '';

GO
