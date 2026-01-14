-- Add Playlist and PlaylistSong tables to Spotify schema
-- Supports AI-generated playlists based on user listening preferences

USE [MJ_Local];
GO

PRINT '================================================';
PRINT 'Adding Playlist and PlaylistSong Tables';
PRINT '================================================';
PRINT '';

-- =====================================================
-- 1. CREATE PLAYLIST TABLE
-- =====================================================

CREATE TABLE [spotify].[Playlist] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Genre] NVARCHAR(100) NULL,
    [CreatedByAI] BIT NOT NULL DEFAULT 1,
    [AIGenerationNotes] NVARCHAR(MAX) NULL,
    [IsPublic] BIT NOT NULL DEFAULT 0,
    [TotalDuration] INT NULL,
    CONSTRAINT [PK_Playlist] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_Playlist_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
);
GO

-- =====================================================
-- 2. CREATE PLAYLISTSONG JUNCTION TABLE
-- =====================================================

CREATE TABLE [spotify].[PlaylistSong] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PlaylistID] UNIQUEIDENTIFIER NOT NULL,
    [SongID] UNIQUEIDENTIFIER NOT NULL,
    [SequenceNumber] INT NOT NULL,
    [AddedFromWeb] BIT NOT NULL DEFAULT 0,
    [PopularityReason] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PlaylistSong] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_PlaylistSong_Playlist] FOREIGN KEY ([PlaylistID]) REFERENCES [spotify].[Playlist] ([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_PlaylistSong_Song] FOREIGN KEY ([SongID]) REFERENCES [spotify].[Song] ([ID]),
    CONSTRAINT [UK_PlaylistSong_Playlist_Song] UNIQUE ([PlaylistID], [SongID])
);
GO

-- =====================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE NONCLUSTERED INDEX [IX_Playlist_UserID] ON [spotify].[Playlist] ([UserID]);
GO

CREATE NONCLUSTERED INDEX [IX_Playlist_Genre] ON [spotify].[Playlist] ([Genre]);
GO

CREATE NONCLUSTERED INDEX [IX_Playlist_CreatedByAI] ON [spotify].[Playlist] ([CreatedByAI]);
GO

CREATE NONCLUSTERED INDEX [IX_PlaylistSong_PlaylistID_Sequence] ON [spotify].[PlaylistSong] ([PlaylistID], [SequenceNumber]);
GO

CREATE NONCLUSTERED INDEX [IX_PlaylistSong_SongID] ON [spotify].[PlaylistSong] ([SongID]);
GO

-- =====================================================
-- 4. ADD EXTENDED PROPERTIES (DESCRIPTIONS)
-- =====================================================

-- Playlist table descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores user-created or AI-generated music playlists.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who owns this playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'UserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the playlist theme or purpose.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary genre of songs in this playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'Genre';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this playlist was created by an AI agent.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'CreatedByAI';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Notes from the AI agent about how the playlist was curated.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'AIGenerationNotes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this playlist is visible to other users.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'IsPublic';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total duration of all songs in the playlist (in seconds).',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Playlist',
    @level2type = N'COLUMN', @level2name = N'TotalDuration';
GO

-- PlaylistSong table descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table linking playlists to songs with ordering.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the playlist-song relationship.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Playlist this song belongs to.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'PlaylistID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Song included in the playlist.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'SongID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Order of the song in the playlist (starting from 1).',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'SequenceNumber';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this song was discovered via web search by an AI agent.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'AddedFromWeb';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason why this song was included (e.g., "Currently #3 on Billboard Hot 100").',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'PlaylistSong',
    @level2type = N'COLUMN', @level2name = N'PopularityReason';
GO

-- =====================================================
-- Summary
-- =====================================================
PRINT '';
PRINT '================================================';
PRINT '✅ PLAYLIST TABLES CREATED SUCCESSFULLY';
PRINT '================================================';
PRINT '';
PRINT 'Tables Created:';
PRINT '  • spotify.Playlist';
PRINT '  • spotify.PlaylistSong';
PRINT '';
PRINT 'Next Steps:';
PRINT '  1. Run CodeGen to generate entity classes and views';
PRINT '  2. Create AI Agent for playlist generation';
PRINT '  3. Add UI for viewing and managing playlists';
PRINT '';

GO
