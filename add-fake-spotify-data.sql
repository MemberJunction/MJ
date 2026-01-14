-- Add fake users and Spotify listening data
-- This creates test data for the single-user Spotify Wrapped implementation

USE [MJ_Local];
GO

PRINT '================================================';
PRINT 'Adding Fake Spotify Data';
PRINT '================================================';
PRINT '';

DECLARE @Year INT = 2024;

-- ===================================
-- PART 1: Create Test Users
-- ===================================
PRINT 'Creating test users...';

DECLARE @User1ID UNIQUEIDENTIFIER = NEWID();
DECLARE @User2ID UNIQUEIDENTIFIER = NEWID();
DECLARE @User3ID UNIQUEIDENTIFIER = NEWID();
DECLARE @User4ID UNIQUEIDENTIFIER = NEWID();

-- Alice Music (Rock fan)
IF NOT EXISTS (SELECT 1 FROM [__mj].[User] WHERE Email = 'alice.music@test.com')
BEGIN
    INSERT INTO [__mj].[User] (ID, Email, Name, FirstName, LastName, Type, IsActive)
    VALUES (@User1ID, 'alice.music@test.com', 'Alice Music', 'Alice', 'Music', 'User', 1);
    PRINT '  ✅ Created: Alice Music';
END
ELSE
BEGIN
    SELECT @User1ID = ID FROM [__mj].[User] WHERE Email = 'alice.music@test.com';
    PRINT '  ℹ️  Alice Music already exists';
END

-- Bob Beats (Pop fan)
IF NOT EXISTS (SELECT 1 FROM [__mj].[User] WHERE Email = 'bob.beats@test.com')
BEGIN
    INSERT INTO [__mj].[User] (ID, Email, Name, FirstName, LastName, Type, IsActive)
    VALUES (@User2ID, 'bob.beats@test.com', 'Bob Beats', 'Bob', 'Beats', 'User', 1);
    PRINT '  ✅ Created: Bob Beats';
END
ELSE
BEGIN
    SELECT @User2ID = ID FROM [__mj].[User] WHERE Email = 'bob.beats@test.com';
    PRINT '  ℹ️  Bob Beats already exists';
END

-- Carol Melody (Electronic fan)
IF NOT EXISTS (SELECT 1 FROM [__mj].[User] WHERE Email = 'carol.melody@test.com')
BEGIN
    INSERT INTO [__mj].[User] (ID, Email, Name, FirstName, LastName, Type, IsActive)
    VALUES (@User3ID, 'carol.melody@test.com', 'Carol Melody', 'Carol', 'Melody', 'User', 1);
    PRINT '  ✅ Created: Carol Melody';
END
ELSE
BEGIN
    SELECT @User3ID = ID FROM [__mj].[User] WHERE Email = 'carol.melody@test.com';
    PRINT '  ℹ️  Carol Melody already exists';
END

-- David Rhythm (Jazz fan)
IF NOT EXISTS (SELECT 1 FROM [__mj].[User] WHERE Email = 'david.rhythm@test.com')
BEGIN
    INSERT INTO [__mj].[User] (ID, Email, Name, FirstName, LastName, Type, IsActive)
    VALUES (@User4ID, 'david.rhythm@test.com', 'David Rhythm', 'David', 'Rhythm', 'User', 1);
    PRINT '  ✅ Created: David Rhythm';
END
ELSE
BEGIN
    SELECT @User4ID = ID FROM [__mj].[User] WHERE Email = 'david.rhythm@test.com';
    PRINT '  ℹ️  David Rhythm already exists';
END

PRINT '';

-- ===================================
-- PART 2: Clear Old Test Data
-- ===================================
PRINT 'Clearing old test data...';

DELETE FROM [spotify].[ListeningHistory] WHERE UserID IN (@User1ID, @User2ID, @User3ID, @User4ID);
DELETE FROM [spotify].[UserYearSummary] WHERE UserID IN (@User1ID, @User2ID, @User3ID, @User4ID);

PRINT '  ✅ Old data cleared';
PRINT '';

-- ===================================
-- PART 3: Create Sample Songs
-- ===================================
PRINT 'Creating sample songs...';

DECLARE @Song1 UNIQUEIDENTIFIER, @Song2 UNIQUEIDENTIFIER, @Song3 UNIQUEIDENTIFIER;
DECLARE @Song4 UNIQUEIDENTIFIER, @Song5 UNIQUEIDENTIFIER, @Song6 UNIQUEIDENTIFIER;
DECLARE @Song7 UNIQUEIDENTIFIER, @Song8 UNIQUEIDENTIFIER, @Song9 UNIQUEIDENTIFIER;
DECLARE @Song10 UNIQUEIDENTIFIER, @Song11 UNIQUEIDENTIFIER, @Song12 UNIQUEIDENTIFIER;
DECLARE @Song13 UNIQUEIDENTIFIER, @Song14 UNIQUEIDENTIFIER, @Song15 UNIQUEIDENTIFIER;
DECLARE @Song16 UNIQUEIDENTIFIER, @Song17 UNIQUEIDENTIFIER, @Song18 UNIQUEIDENTIFIER;
DECLARE @Song19 UNIQUEIDENTIFIER, @Song20 UNIQUEIDENTIFIER, @Song21 UNIQUEIDENTIFIER;
DECLARE @Song22 UNIQUEIDENTIFIER, @Song23 UNIQUEIDENTIFIER, @Song24 UNIQUEIDENTIFIER;
DECLARE @Song25 UNIQUEIDENTIFIER;

-- Rock songs
IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Thunder Road')
BEGIN
    SET @Song1 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song1, 'Thunder Road', 'Bruce Springsteen', 'Rock', 284);
END
ELSE SELECT @Song1 = ID FROM [spotify].[Song] WHERE Name = 'Thunder Road';

IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Stairway to Heaven')
BEGIN
    SET @Song2 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song2, 'Stairway to Heaven', 'Led Zeppelin', 'Rock', 482);
END
ELSE SELECT @Song2 = ID FROM [spotify].[Song] WHERE Name = 'Stairway to Heaven';

-- Pop songs
IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Blinding Lights')
BEGIN
    SET @Song3 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song3, 'Blinding Lights', 'The Weeknd', 'Pop', 200);
END
ELSE SELECT @Song3 = ID FROM [spotify].[Song] WHERE Name = 'Blinding Lights';

IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Anti-Hero')
BEGIN
    SET @Song4 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song4, 'Anti-Hero', 'Taylor Swift', 'Pop', 200);
END
ELSE SELECT @Song4 = ID FROM [spotify].[Song] WHERE Name = 'Anti-Hero';

-- Hip Hop songs
IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'HUMBLE.')
BEGIN
    SET @Song5 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song5, 'HUMBLE.', 'Kendrick Lamar', 'Hip Hop', 177);
END
ELSE SELECT @Song5 = ID FROM [spotify].[Song] WHERE Name = 'HUMBLE.';

IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'God''s Plan')
BEGIN
    SET @Song6 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song6, 'God''s Plan', 'Drake', 'Hip Hop', 198);
END
ELSE SELECT @Song6 = ID FROM [spotify].[Song] WHERE Name = 'God''s Plan';

-- Electronic songs
IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'One More Time')
BEGIN
    SET @Song7 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song7, 'One More Time', 'Daft Punk', 'Electronic', 320);
END
ELSE SELECT @Song7 = ID FROM [spotify].[Song] WHERE Name = 'One More Time';

IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Strobe')
BEGIN
    SET @Song8 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song8, 'Strobe', 'deadmau5', 'Electronic', 645);
END
ELSE SELECT @Song8 = ID FROM [spotify].[Song] WHERE Name = 'Strobe';

-- Jazz songs
IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'So What')
BEGIN
    SET @Song9 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song9, 'So What', 'Miles Davis', 'Jazz', 542);
END
ELSE SELECT @Song9 = ID FROM [spotify].[Song] WHERE Name = 'So What';

IF NOT EXISTS (SELECT 1 FROM [spotify].[Song] WHERE Name = 'Take Five')
BEGIN
    SET @Song10 = NEWID();
    INSERT INTO [spotify].[Song] (ID, Name, Artist, Genre, Duration)
    VALUES (@Song10, 'Take Five', 'Dave Brubeck', 'Jazz', 324);
END
ELSE SELECT @Song10 = ID FROM [spotify].[Song] WHERE Name = 'Take Five';

PRINT '  ✅ 10 songs created';
PRINT '';

-- ===================================
-- PART 4: Generate Listening History
-- ===================================
PRINT 'Generating listening history (this may take a minute)...';

-- Alice Music (Rock fan) - 1,050 total listens
DECLARE @i INT = 0;
WHILE @i < 500 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User1ID, @Song1, DATEADD(MINUTE, -@i*10, GETDATE()), 284);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 350 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User1ID, @Song2, DATEADD(MINUTE, -@i*12, GETDATE()), 482);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 200 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User1ID, @Song3, DATEADD(MINUTE, -@i*15, GETDATE()), 200);
    SET @i = @i + 1;
END

PRINT '  ✅ Alice Music: 1,050 listens';

-- Bob Beats (Pop fan) - 1,500 total listens
SET @i = 0;
WHILE @i < 650 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User2ID, @Song3, DATEADD(MINUTE, -@i*8, GETDATE()), 200);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 550 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User2ID, @Song4, DATEADD(MINUTE, -@i*9, GETDATE()), 200);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 300 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User2ID, @Song6, DATEADD(MINUTE, -@i*11, GETDATE()), 198);
    SET @i = @i + 1;
END

PRINT '  ✅ Bob Beats: 1,500 listens';

-- Carol Melody (Electronic fan) - 1,150 total listens
SET @i = 0;
WHILE @i < 480 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User3ID, @Song7, DATEADD(MINUTE, -@i*10, GETDATE()), 320);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 420 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User3ID, @Song8, DATEADD(MINUTE, -@i*13, GETDATE()), 645);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 250 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User3ID, @Song5, DATEADD(MINUTE, -@i*14, GETDATE()), 177);
    SET @i = @i + 1;
END

PRINT '  ✅ Carol Melody: 1,150 listens';

-- David Rhythm (Jazz fan) - 900 total listens
SET @i = 0;
WHILE @i < 380 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User4ID, @Song9, DATEADD(MINUTE, -@i*11, GETDATE()), 542);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 340 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User4ID, @Song10, DATEADD(MINUTE, -@i*12, GETDATE()), 324);
    SET @i = @i + 1;
END

SET @i = 0;
WHILE @i < 180 BEGIN
    INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
    VALUES (NEWID(), @User4ID, @Song1, DATEADD(MINUTE, -@i*16, GETDATE()), 284);
    SET @i = @i + 1;
END

PRINT '  ✅ David Rhythm: 900 listens';
PRINT '';

-- ===================================
-- PART 5: Generate Year Summaries
-- ===================================
PRINT 'Generating year summaries for 2024...';

-- Alice Music (Rock fan)
INSERT INTO [spotify].[UserYearSummary] (ID, UserID, Year, TotalListens, TotalMinutesListened, UniqueArtists, UniqueSongs, TopGenre, TopArtist, TopSong)
VALUES (
    NEWID(),
    @User1ID,
    @Year,
    1050,
    (500 * 284 + 350 * 482 + 200 * 200) / 60,
    3,
    3,
    'Rock',
    'Bruce Springsteen',
    'Thunder Road'
);

-- Bob Beats (Pop fan)
INSERT INTO [spotify].[UserYearSummary] (ID, UserID, Year, TotalListens, TotalMinutesListened, UniqueArtists, UniqueSongs, TopGenre, TopArtist, TopSong)
VALUES (
    NEWID(),
    @User2ID,
    @Year,
    1500,
    (650 * 200 + 550 * 200 + 300 * 198) / 60,
    3,
    3,
    'Pop',
    'The Weeknd',
    'Blinding Lights'
);

-- Carol Melody (Electronic fan)
INSERT INTO [spotify].[UserYearSummary] (ID, UserID, Year, TotalListens, TotalMinutesListened, UniqueArtists, UniqueSongs, TopGenre, TopArtist, TopSong)
VALUES (
    NEWID(),
    @User3ID,
    @Year,
    1150,
    (480 * 320 + 420 * 645 + 250 * 177) / 60,
    3,
    3,
    'Electronic',
    'deadmau5',
    'Strobe'
);

-- David Rhythm (Jazz fan)
INSERT INTO [spotify].[UserYearSummary] (ID, UserID, Year, TotalListens, TotalMinutesListened, UniqueArtists, UniqueSongs, TopGenre, TopArtist, TopSong)
VALUES (
    NEWID(),
    @User4ID,
    @Year,
    900,
    (380 * 542 + 340 * 324 + 180 * 284) / 60,
    3,
    3,
    'Jazz',
    'Miles Davis',
    'So What'
);

PRINT '  ✅ 4 year summaries created';
PRINT '';

-- ===================================
-- Summary
-- ===================================
PRINT '================================================';
PRINT '✅ FAKE DATA CREATION COMPLETE!';
PRINT '================================================';
PRINT '';
PRINT 'Summary:';
PRINT '  👥 4 test users created';
PRINT '  🎵 10 songs across multiple genres';
PRINT '  📊 4,600 listening history records';
PRINT '  📈 4 year summaries for 2024';
PRINT '';
PRINT 'Test Users:';
PRINT '  • Alice Music (alice.music@test.com) - Rock fan, 1,050 listens';
PRINT '  • Bob Beats (bob.beats@test.com) - Pop fan, 1,500 listens';
PRINT '  • Carol Melody (carol.melody@test.com) - Electronic fan, 1,150 listens';
PRINT '  • David Rhythm (david.rhythm@test.com) - Jazz fan, 900 listens';
PRINT '';
PRINT 'Note: Your single-user UI will show data based on which user you log in as.';
PRINT '';

GO
