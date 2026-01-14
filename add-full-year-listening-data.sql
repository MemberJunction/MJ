-- =====================================================
-- Add Full Year Listening History Data for Current User
-- =====================================================
-- This adds listening history data for ALL 12 months of 2024
-- with varied top songs per month for the Music Reflection feature

USE MJ_Local;
GO

-- Get Ian's user
DECLARE @UserID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[User] WHERE Email LIKE '%ian%' OR Name LIKE '%ian%');

PRINT 'Adding listening data for user: ' + CAST(@UserID AS NVARCHAR(50));

-- Use the existing song IDs from the demo data
DECLARE @Song1 UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';  -- Blinding Lights - The Weeknd
DECLARE @Song2 UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222222';  -- Bohemian Rhapsody - Queen
DECLARE @Song3 UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333333';  -- Shape of You - Ed Sheeran
DECLARE @Song4 UNIQUEIDENTIFIER = '44444444-4444-4444-4444-444444444444';  -- Billie Jean - Michael Jackson
DECLARE @Song5 UNIQUEIDENTIFIER = '55555555-5555-5555-5555-555555555555';  -- Bad Guy - Billie Eilish
DECLARE @Song6 UNIQUEIDENTIFIER = '66666666-6666-6666-6666-666666666666';  -- Smells Like Teen Spirit - Nirvana
DECLARE @Song7 UNIQUEIDENTIFIER = '77777777-7777-7777-7777-777777777777';  -- Rolling in the Deep - Adele
DECLARE @Song8 UNIQUEIDENTIFIER = '88888888-8888-8888-8888-888888888888';  -- Stairway to Heaven - Led Zeppelin
DECLARE @Song9 UNIQUEIDENTIFIER = '99999999-9999-9999-9999-999999999999';  -- Uptown Funk - Bruno Mars
DECLARE @Song10 UNIQUEIDENTIFIER = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'; -- Hotel California - Eagles
DECLARE @Song11 UNIQUEIDENTIFIER = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB'; -- Someone Like You - Adele
DECLARE @Song12 UNIQUEIDENTIFIER = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC'; -- Sweet Child O Mine - Guns N Roses
DECLARE @Song13 UNIQUEIDENTIFIER = 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD'; -- Thriller - Michael Jackson
DECLARE @Song14 UNIQUEIDENTIFIER = 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE'; -- Shake It Off - Taylor Swift
DECLARE @Song15 UNIQUEIDENTIFIER = 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'; -- Lose Yourself - Eminem

-- Helper function to add plays for a song in a specific month
-- We'll add multiple plays per song to create rankings

-- Clear any existing 2024 data for this user to start fresh
DELETE FROM [spotify].[ListeningHistory]
WHERE UserID = @UserID AND YEAR(ListenedAt) = 2024;

PRINT 'Cleared existing 2024 data';

-- JANUARY 2024 - Winter vibes, indoor music
-- Top 3: Song11 (Someone Like You), Song1 (Blinding Lights), Song7 (Rolling in the Deep)
DECLARE @i INT;

SET @i = 1; WHILE @i <= 45 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song11, DATEADD(HOUR, @i * 5, '2024-01-01'), 238); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 38 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 6, '2024-01-02'), 200); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 32 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song7, DATEADD(HOUR, @i * 7, '2024-01-03'), 228); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 15 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song2, DATEADD(HOUR, @i * 8, '2024-01-05'), 354); SET @i = @i + 1; END

PRINT 'January done';

-- FEBRUARY 2024 - Love songs month
-- Top 3: Song11 (Someone Like You), Song14 (Shake It Off), Song3 (Shape of You)
SET @i = 1; WHILE @i <= 52 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song11, DATEADD(HOUR, @i * 4, '2024-02-01'), 238); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 44 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song14, DATEADD(HOUR, @i * 5, '2024-02-05'), 219); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 35 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song3, DATEADD(HOUR, @i * 6, '2024-02-10'), 233); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 12 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 8, '2024-02-15'), 200); SET @i = @i + 1; END

PRINT 'February done';

-- MARCH 2024 - Spring awakening
-- Top 3: Song3 (Shape of You), Song9 (Uptown Funk), Song5 (Bad Guy)
SET @i = 1; WHILE @i <= 48 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song3, DATEADD(HOUR, @i * 5, '2024-03-01'), 233); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 41 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song9, DATEADD(HOUR, @i * 5, '2024-03-05'), 269); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 33 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song5, DATEADD(HOUR, @i * 6, '2024-03-10'), 194); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 18 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song14, DATEADD(HOUR, @i * 8, '2024-03-15'), 219); SET @i = @i + 1; END

PRINT 'March done';

-- APRIL 2024 - Rainy day music
-- Top 3: Song7 (Rolling in the Deep), Song10 (Hotel California), Song2 (Bohemian Rhapsody)
SET @i = 1; WHILE @i <= 50 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song7, DATEADD(HOUR, @i * 4, '2024-04-01'), 228); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 42 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song10, DATEADD(HOUR, @i * 5, '2024-04-05'), 391); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 36 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song2, DATEADD(HOUR, @i * 6, '2024-04-10'), 354); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 20 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song8, DATEADD(HOUR, @i * 7, '2024-04-15'), 482); SET @i = @i + 1; END

PRINT 'April done';

-- MAY 2024 - Upbeat spring energy
-- Top 3: Song9 (Uptown Funk), Song14 (Shake It Off), Song1 (Blinding Lights)
SET @i = 1; WHILE @i <= 55 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song9, DATEADD(HOUR, @i * 4, '2024-05-01'), 269); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 47 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song14, DATEADD(HOUR, @i * 5, '2024-05-05'), 219); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 38 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 5, '2024-05-10'), 200); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 22 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song5, DATEADD(HOUR, @i * 7, '2024-05-15'), 194); SET @i = @i + 1; END

PRINT 'May done';

-- JUNE 2024 - Summer starting
-- Top 3: Song1 (Blinding Lights), Song5 (Bad Guy), Song9 (Uptown Funk)
SET @i = 1; WHILE @i <= 58 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 4, '2024-06-01'), 200); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 49 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song5, DATEADD(HOUR, @i * 5, '2024-06-05'), 194); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 40 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song9, DATEADD(HOUR, @i * 5, '2024-06-10'), 269); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 25 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song3, DATEADD(HOUR, @i * 7, '2024-06-15'), 233); SET @i = @i + 1; END

PRINT 'June done';

-- JULY 2024 - Summer peak party anthems
-- Top 3: Song9 (Uptown Funk), Song4 (Billie Jean), Song13 (Thriller)
SET @i = 1; WHILE @i <= 62 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song9, DATEADD(HOUR, @i * 4, '2024-07-01'), 269); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 53 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song4, DATEADD(HOUR, @i * 4, '2024-07-05'), 294); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 44 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song13, DATEADD(HOUR, @i * 5, '2024-07-10'), 357); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 28 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 6, '2024-07-15'), 200); SET @i = @i + 1; END

PRINT 'July done';

-- AUGUST 2024 - Late summer rock vibes
-- Top 3: Song6 (Smells Like Teen Spirit), Song12 (Sweet Child O Mine), Song8 (Stairway to Heaven)
SET @i = 1; WHILE @i <= 56 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song6, DATEADD(HOUR, @i * 4, '2024-08-01'), 301); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 48 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song12, DATEADD(HOUR, @i * 5, '2024-08-05'), 356); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 39 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song8, DATEADD(HOUR, @i * 5, '2024-08-10'), 482); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 24 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song10, DATEADD(HOUR, @i * 7, '2024-08-15'), 391); SET @i = @i + 1; END

PRINT 'August done';

-- SEPTEMBER 2024 - Fall transition
-- Top 3: Song10 (Hotel California), Song2 (Bohemian Rhapsody), Song7 (Rolling in the Deep)
SET @i = 1; WHILE @i <= 51 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song10, DATEADD(HOUR, @i * 4, '2024-09-01'), 391); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 43 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song2, DATEADD(HOUR, @i * 5, '2024-09-05'), 354); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 35 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song7, DATEADD(HOUR, @i * 6, '2024-09-10'), 228); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 20 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song11, DATEADD(HOUR, @i * 7, '2024-09-15'), 238); SET @i = @i + 1; END

PRINT 'September done';

-- OCTOBER 2024 - Spooky season + melancholy
-- Top 3: Song13 (Thriller), Song5 (Bad Guy), Song6 (Smells Like Teen Spirit)
SET @i = 1; WHILE @i <= 65 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song13, DATEADD(HOUR, @i * 4, '2024-10-01'), 357); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 54 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song5, DATEADD(HOUR, @i * 4, '2024-10-05'), 194); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 45 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song6, DATEADD(HOUR, @i * 5, '2024-10-10'), 301); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 30 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song15, DATEADD(HOUR, @i * 6, '2024-10-15'), 326); SET @i = @i + 1; END

PRINT 'October done';

-- NOVEMBER 2024 - Cozy introspective month
-- Top 3: Song11 (Someone Like You), Song8 (Stairway to Heaven), Song10 (Hotel California)
SET @i = 1; WHILE @i <= 54 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song11, DATEADD(HOUR, @i * 4, '2024-11-01'), 238); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 46 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song8, DATEADD(HOUR, @i * 5, '2024-11-05'), 482); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 37 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song10, DATEADD(HOUR, @i * 5, '2024-11-10'), 391); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 22 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song7, DATEADD(HOUR, @i * 7, '2024-11-15'), 228); SET @i = @i + 1; END

PRINT 'November done';

-- DECEMBER 2024 - Holiday season celebration
-- Top 3: Song1 (Blinding Lights), Song14 (Shake It Off), Song4 (Billie Jean)
SET @i = 1; WHILE @i <= 60 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song1, DATEADD(HOUR, @i * 4, '2024-12-01'), 200); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 50 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song14, DATEADD(HOUR, @i * 4, '2024-12-05'), 219); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 42 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song4, DATEADD(HOUR, @i * 5, '2024-12-10'), 294); SET @i = @i + 1; END
SET @i = 1; WHILE @i <= 28 BEGIN INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration) VALUES (NEWID(), @UserID, @Song9, DATEADD(HOUR, @i * 6, '2024-12-15'), 269); SET @i = @i + 1; END

PRINT 'December done';

-- Summary
SELECT
    MONTH(ListenedAt) AS Month,
    COUNT(*) AS TotalPlays,
    COUNT(DISTINCT SongID) AS UniqueSongs
FROM [spotify].[ListeningHistory]
WHERE UserID = @UserID AND YEAR(ListenedAt) = 2024
GROUP BY MONTH(ListenedAt)
ORDER BY Month;

PRINT '';
PRINT '=== COMPLETE ===';
PRINT 'Added listening data for all 12 months of 2024.';
PRINT 'Top 3 songs per month:';
PRINT 'Jan: Someone Like You, Blinding Lights, Rolling in the Deep';
PRINT 'Feb: Someone Like You, Shake It Off, Shape of You';
PRINT 'Mar: Shape of You, Uptown Funk, Bad Guy';
PRINT 'Apr: Rolling in the Deep, Hotel California, Bohemian Rhapsody';
PRINT 'May: Uptown Funk, Shake It Off, Blinding Lights';
PRINT 'Jun: Blinding Lights, Bad Guy, Uptown Funk';
PRINT 'Jul: Uptown Funk, Billie Jean, Thriller';
PRINT 'Aug: Smells Like Teen Spirit, Sweet Child O Mine, Stairway to Heaven';
PRINT 'Sep: Hotel California, Bohemian Rhapsody, Rolling in the Deep';
PRINT 'Oct: Thriller, Bad Guy, Smells Like Teen Spirit';
PRINT 'Nov: Someone Like You, Stairway to Heaven, Hotel California';
PRINT 'Dec: Blinding Lights, Shake It Off, Billie Jean';
