
-- Spotify Wrapped Demo Application Schema
-- Demonstrates music listening tracking and ranking similar to Spotify Wrapped

-- =====================================================
-- 0. CREATE SCHEMA
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'spotify')
BEGIN
    EXEC('CREATE SCHEMA spotify');
END
GO

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Song table (singular)
CREATE TABLE [spotify].[Song] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Artist] NVARCHAR(255) NOT NULL,
    [Album] NVARCHAR(255) NULL,
    [Duration] INT NOT NULL CHECK (Duration > 0),
    [Genre] NVARCHAR(100) NULL,
    [ReleaseYear] INT NULL CHECK (ReleaseYear >= 1900 AND ReleaseYear <= 2100),
    [SpotifyID] NVARCHAR(100) NULL,
    [AlbumArtURL] NVARCHAR(500) NULL,
    CONSTRAINT [PK_Song] PRIMARY KEY ([ID])
);
GO

-- ListeningHistory table (singular)
CREATE TABLE [spotify].[ListeningHistory] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [SongID] UNIQUEIDENTIFIER NOT NULL,
    [ListenedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [PlayDuration] INT NULL CHECK (PlayDuration >= 0),
    [CompletionPercentage] DECIMAL(5,2) NULL CHECK (CompletionPercentage >= 0 AND CompletionPercentage <= 100),
    [Source] NVARCHAR(50) NULL CHECK (Source IN ('Web', 'Mobile', 'Desktop', 'Other')),
    CONSTRAINT [PK_ListeningHistory] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_ListeningHistory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID]),
    CONSTRAINT [FK_ListeningHistory_Song] FOREIGN KEY ([SongID]) REFERENCES [spotify].[Song] ([ID]) ON DELETE CASCADE
);
GO

-- UserYearSummary table (singular) - stores annual wrapped summaries
CREATE TABLE [spotify].[UserYearSummary] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Year] INT NOT NULL CHECK (Year >= 2020 AND Year <= 2100),
    [TotalListens] INT NOT NULL DEFAULT 0 CHECK (TotalListens >= 0),
    [TotalMinutesListened] INT NOT NULL DEFAULT 0 CHECK (TotalMinutesListened >= 0),
    [UniqueArtists] INT NOT NULL DEFAULT 0 CHECK (UniqueArtists >= 0),
    [UniqueSongs] INT NOT NULL DEFAULT 0 CHECK (UniqueSongs >= 0),
    [TopGenre] NVARCHAR(100) NULL,
    [TopArtist] NVARCHAR(255) NULL,
    [TopSong] NVARCHAR(255) NULL,
    [SummaryData] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_UserYearSummary] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_UserYearSummary_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID]),
    CONSTRAINT [UK_UserYearSummary_User_Year] UNIQUE ([UserID], [Year])
);
GO

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE NONCLUSTERED INDEX [IX_Song_Artist] ON [spotify].[Song] ([Artist]);
GO

CREATE NONCLUSTERED INDEX [IX_Song_Genre] ON [spotify].[Song] ([Genre]);
GO

CREATE NONCLUSTERED INDEX [IX_Song_ReleaseYear] ON [spotify].[Song] ([ReleaseYear]);
GO

CREATE NONCLUSTERED INDEX [IX_ListeningHistory_UserID_ListenedAt] ON [spotify].[ListeningHistory] ([UserID], [ListenedAt] DESC);
GO

CREATE NONCLUSTERED INDEX [IX_ListeningHistory_SongID] ON [spotify].[ListeningHistory] ([SongID]);
GO

CREATE NONCLUSTERED INDEX [IX_ListeningHistory_ListenedAt] ON [spotify].[ListeningHistory] ([ListenedAt] DESC);
GO

CREATE NONCLUSTERED INDEX [IX_UserYearSummary_Year] ON [spotify].[UserYearSummary] ([Year] DESC);
GO

-- =====================================================
-- 3. ADD EXTENDED PROPERTIES (DESCRIPTIONS)
-- =====================================================

-- Song table descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about songs in the music library.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the song.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Title of the song.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the artist or band.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'Artist';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Album name where the song appears.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'Album';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Duration of the song in seconds.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'Duration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Music genre classification.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'Genre';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Year the song was released.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'ReleaseYear';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Spotify unique identifier for the track.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'SpotifyID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the album artwork image.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'Song',
    @level2type = N'COLUMN', @level2name = N'AlbumArtURL';
GO

-- ListeningHistory table descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks each time a user listens to a song.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the listening event.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who listened to the song.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'UserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Song that was listened to.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'SongID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the song was listened to.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'ListenedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How long the user listened in seconds (may be less than song duration).',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'PlayDuration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percentage of the song that was played (0-100).',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'CompletionPercentage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Platform where the song was played (Web, Mobile, Desktop, Other).',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'ListeningHistory',
    @level2type = N'COLUMN', @level2name = N'Source';
GO

-- UserYearSummary table descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores annual "Wrapped" summary statistics for each user.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the summary record.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User this summary belongs to.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'UserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Year this summary covers.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'Year';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of songs listened to during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'TotalListens';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total minutes spent listening to music during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'TotalMinutesListened';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of different artists listened to during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'UniqueArtists';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of different songs listened to during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'UniqueSongs';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most frequently listened to genre during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'TopGenre';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most frequently listened to artist during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'TopArtist';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most frequently listened to song during the year.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'TopSong';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON blob containing additional summary data and statistics.',
    @level0type = N'SCHEMA', @level0name = N'spotify',
    @level1type = N'TABLE', @level1name = N'UserYearSummary',
    @level2type = N'COLUMN', @level2name = N'SummaryData';
GO

-- =====================================================
-- 4. INSERT SAMPLE DATA
-- =====================================================

-- Sample Songs (diverse genres and eras)
DECLARE @Song1 UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
DECLARE @Song2 UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222222';
DECLARE @Song3 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333333';
DECLARE @Song4 UNIQUEIDENTIFIER = '44444444-4444-4444-4444-444444444444';
DECLARE @Song5 UNIQUEIDENTIFIER = '55555555-5555-5555-5555-555555555555';
DECLARE @Song6 UNIQUEIDENTIFIER = '66666666-6666-6666-6666-666666666666';
DECLARE @Song7 UNIQUEIDENTIFIER = '77777777-7777-7777-7777-777777777777';
DECLARE @Song8 UNIQUEIDENTIFIER = '88888888-8888-8888-8888-888888888888';
DECLARE @Song9 UNIQUEIDENTIFIER = '99999999-9999-9999-9999-999999999999';
DECLARE @Song10 UNIQUEIDENTIFIER = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
DECLARE @Song11 UNIQUEIDENTIFIER = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
DECLARE @Song12 UNIQUEIDENTIFIER = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';
DECLARE @Song13 UNIQUEIDENTIFIER = 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD';
DECLARE @Song14 UNIQUEIDENTIFIER = 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE';
DECLARE @Song15 UNIQUEIDENTIFIER = 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF';

INSERT INTO [spotify].[Song] (ID, Name, Artist, Album, Duration, Genre, ReleaseYear, SpotifyID, AlbumArtURL) VALUES
(@Song1, 'Blinding Lights', 'The Weeknd', 'After Hours', 200, 'Pop', 2020, '0VjIjW4GlUZAMYd2vXMi3b', 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36'),
(@Song2, 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 354, 'Rock', 1975, '3z8h0TU7ReDPLIbEnYhWZb', 'https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25a'),
(@Song3, 'Shape of You', 'Ed Sheeran', 'Divide', 233, 'Pop', 2017, '7qiZfU4dY1lWllzX7mPBI', 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96'),
(@Song4, 'Hotel California', 'Eagles', 'Hotel California', 391, 'Rock', 1976, '40riOy7x9W7GXjyGp4pjAv', 'https://i.scdn.co/image/ab67616d0000b2734637341b9f507521afa9a778'),
(@Song5, 'Levitating', 'Dua Lipa', 'Future Nostalgia', 203, 'Pop', 2020, '39LLxExYz6ewLAcYrzQQyP', 'https://i.scdn.co/image/ab67616d0000b2739a840c90e3be71c1b8bc4031'),
(@Song6, 'Smells Like Teen Spirit', 'Nirvana', 'Nevermind', 301, 'Grunge', 1991, '4CeeEOM32jQcH3eN9Q2dGj', 'https://i.scdn.co/image/ab67616d0000b273e175a19e530c898d167d39bf'),
(@Song7, 'Good 4 U', 'Olivia Rodrigo', 'Sour', 178, 'Pop Rock', 2021, '4ZtFanR9U6ndgddUvNcjcG', 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a'),
(@Song8, 'Stairway to Heaven', 'Led Zeppelin', 'Led Zeppelin IV', 482, 'Rock', 1971, '5CQ30WqJwcep0pYcV4AMNc', 'https://i.scdn.co/image/ab67616d0000b2734e91e0fe7488cb9d0e5d5f9a'),
(@Song9, 'As It Was', 'Harry Styles', 'Harrys House', 167, 'Pop', 2022, '4Dvkj6JhhA12EX05fT7y2e', 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0'),
(@Song10, 'Come Together', 'The Beatles', 'Abbey Road', 259, 'Rock', 1969, '2EqlS6tkEnglzr7tkKAAYD', 'https://i.scdn.co/image/ab67616d0000b2734ce8b4e42588bf18182a1ad2'),
(@Song11, 'Heat Waves', 'Glass Animals', 'Dreamland', 238, 'Indie', 2020, '02MWAaffLxlfxAUY7c5dvx', 'https://i.scdn.co/image/ab67616d0000b273b4d36739c42a4bb63f54b9a5'),
(@Song12, 'Billie Jean', 'Michael Jackson', 'Thriller', 294, 'Pop', 1982, '7J1uxwnxfQLu4APicE5Rnj', 'https://i.scdn.co/image/ab67616d0000b2730ccbb59ad06c8cab2dd1da7d'),
(@Song13, 'Starboy', 'The Weeknd', 'Starboy', 230, 'R&B', 2016, '7MXVkk9YMctZqd1Srtv4MB', 'https://i.scdn.co/image/ab67616d0000b2734718e2b124f79258be7bc452'),
(@Song14, 'Sweet Child O Mine', 'Guns N Roses', 'Appetite for Destruction', 356, 'Rock', 1987, '7o2CTH4ctstm8TNelqjb51', 'https://i.scdn.co/image/ab67616d0000b273f0a5a1c2fd92569d49fa4969'),
(@Song15, 'drivers license', 'Olivia Rodrigo', 'Sour', 242, 'Pop', 2021, '7lPN2DXiMsVn7XUKtOW1CS', 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a');
GO

-- Get first user from User table for sample data
DECLARE @SampleUserID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[User] ORDER BY [__mj_CreatedAt]);

-- Sample Listening History (2024 data - varied listening patterns)
-- Heavy rotation songs
INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '11111111-1111-1111-1111-111111111111', DATEADD(DAY, -number, '2024-12-31'), 200, 100, 'Mobile'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 50;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '77777777-7777-7777-7777-777777777777', DATEADD(DAY, -number, '2024-12-31'), 178, 100, 'Web'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 45;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '99999999-9999-9999-9999-999999999999', DATEADD(DAY, -number, '2024-12-31'), 167, 100, 'Desktop'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 40;

-- Moderate rotation
INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '55555555-5555-5555-5555-555555555555', DATEADD(DAY, -number, '2024-12-31'), 203, 100, 'Mobile'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 30;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', DATEADD(DAY, -number, '2024-12-31'), 238, 95, 'Web'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 28;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', DATEADD(DAY, -number, '2024-12-31'), 242, 100, 'Mobile'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 25;

-- Light rotation (classics)
INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '22222222-2222-2222-2222-222222222222', DATEADD(DAY, -number, '2024-12-31'), 354, 100, 'Desktop'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 15;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '44444444-4444-4444-4444-444444444444', DATEADD(DAY, -number, '2024-12-31'), 391, 100, 'Web'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 12;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '88888888-8888-8888-8888-888888888888', DATEADD(DAY, -number, '2024-12-31'), 482, 100, 'Desktop'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 10;

-- Occasional listens
INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '33333333-3333-3333-3333-333333333333', DATEADD(DAY, -number * 10, '2024-12-31'), 233, 100, 'Mobile'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 8;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, '66666666-6666-6666-6666-666666666666', DATEADD(DAY, -number * 12, '2024-12-31'), 301, 100, 'Web'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 7;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', DATEADD(DAY, -number * 15, '2024-12-31'), 259, 90, 'Desktop'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 6;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', DATEADD(DAY, -number * 20, '2024-12-31'), 294, 100, 'Mobile'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 5;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', DATEADD(DAY, -number * 25, '2024-12-31'), 230, 85, 'Web'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 4;

INSERT INTO [spotify].[ListeningHistory] (UserID, SongID, ListenedAt, PlayDuration, CompletionPercentage, Source)
SELECT @SampleUserID, 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE', DATEADD(DAY, -number * 30, '2024-12-31'), 356, 100, 'Desktop'
FROM master..spt_values WHERE type = 'P' AND number BETWEEN 1 AND 3;
GO

-- Sample User Year Summary (pre-computed stats for 2024)
DECLARE @SampleUserID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[User] ORDER BY [__mj_CreatedAt]);

INSERT INTO [spotify].[UserYearSummary] (UserID, Year, TotalListens, TotalMinutesListened, UniqueArtists, UniqueSongs, TopGenre, TopArtist, TopSong, SummaryData)
SELECT
    @SampleUserID,
    2024,
    (SELECT COUNT(*) FROM [spotify].[ListeningHistory] WHERE UserID = @SampleUserID),
    (SELECT SUM(PlayDuration) / 60 FROM [spotify].[ListeningHistory] WHERE UserID = @SampleUserID),
    11, -- UniqueArtists
    15, -- UniqueSongs
    'Pop',
    'The Weeknd',
    'Blinding Lights',
    N'{"topArtists":["The Weeknd","Olivia Rodrigo","Harry Styles","Dua Lipa","Glass Animals"],"topGenres":["Pop","Rock","Indie","R&B"],"listeningPeakHour":18,"favoriteSource":"Mobile","totalHoursListened":86.5,"avgSongLength":268}';
GO
