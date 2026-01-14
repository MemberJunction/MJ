-- =====================================================
-- Add 2025 Listening History Data for Music Reflection
-- =====================================================
-- This adds listening history data throughout 2025
-- so the Music Reflection feature has data to show

DECLARE @User1ID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[User] WHERE Email LIKE '%@%' ORDER BY __mj_CreatedAt);
DECLARE @Songs TABLE (ID UNIQUEIDENTIFIER, Genre NVARCHAR(50), Duration INT);

-- Get some existing songs
INSERT INTO @Songs
SELECT TOP 20 ID, Genre, Duration
FROM [spotify].[Song]
ORDER BY NEWID();

DECLARE @SongID UNIQUEIDENTIFIER;
DECLARE @Genre NVARCHAR(50);
DECLARE @Duration INT;
DECLARE @Month INT;
DECLARE @Day INT;
DECLARE @ListenDate DATETIME2;
DECLARE @Plays INT;

PRINT 'Adding 2025 listening history data...';
PRINT 'User ID: ' + CAST(@User1ID AS NVARCHAR(50));

-- For each month in 2025, add plays for various songs
-- This creates a pattern where certain songs are played more in certain months
SET @Month = 1;
WHILE @Month <= 12
BEGIN
    PRINT 'Adding data for month ' + CAST(@Month AS NVARCHAR(2));

    -- Pick 5-8 songs for this month
    DECLARE @SongCount INT = 5 + (ABS(CHECKSUM(NEWID())) % 4); -- Random 5-8
    DECLARE @SongIndex INT = 0;

    DECLARE song_cursor CURSOR FOR
    SELECT TOP (@SongCount) ID, Genre, Duration FROM @Songs ORDER BY NEWID();

    OPEN song_cursor;
    FETCH NEXT FROM song_cursor INTO @SongID, @Genre, @Duration;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Each song gets played 10-50 times during the month
        SET @Plays = 10 + (ABS(CHECKSUM(NEWID())) % 41);

        DECLARE @PlayNum INT = 1;
        WHILE @PlayNum <= @Plays
        BEGIN
            -- Random day in the month
            SET @Day = 1 + (ABS(CHECKSUM(NEWID())) % 28); -- Keep it simple, 1-28

            -- Random time during the day
            SET @ListenDate = DATEADD(HOUR, ABS(CHECKSUM(NEWID())) % 24,
                              DATEADD(MINUTE, ABS(CHECKSUM(NEWID())) % 60,
                              CAST(DATEFROMPARTS(2025, @Month, @Day) AS DATETIME2)));

            INSERT INTO [spotify].[ListeningHistory] (ID, UserID, SongID, ListenedAt, PlayDuration)
            VALUES (NEWID(), @User1ID, @SongID, @ListenDate, @Duration);

            SET @PlayNum = @PlayNum + 1;
        END

        FETCH NEXT FROM song_cursor INTO @SongID, @Genre, @Duration;
    END

    CLOSE song_cursor;
    DEALLOCATE song_cursor;

    SET @Month = @Month + 1;
END

-- Show summary
SELECT
    YEAR(ListenedAt) AS Year,
    MONTH(ListenedAt) AS Month,
    COUNT(*) AS PlayCount,
    COUNT(DISTINCT SongID) AS UniqueSongs
FROM [spotify].[ListeningHistory]
WHERE UserID = @User1ID
    AND YEAR(ListenedAt) = 2025
GROUP BY YEAR(ListenedAt), MONTH(ListenedAt)
ORDER BY Year, Month;

PRINT '';
PRINT 'Done! Added listening history data for all months of 2025.';
PRINT 'Refresh the Music Reflection tab to see your data.';
