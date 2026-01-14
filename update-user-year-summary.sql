-- =====================================================
-- Update User Year Summary with Computed Stats from Listening History
-- =====================================================

USE MJ_Local;
GO

-- Get Ian's user
DECLARE @UserID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[User] WHERE Email LIKE '%ian%' OR Name LIKE '%ian%');

PRINT 'Updating User Year Summary for user: ' + CAST(@UserID AS NVARCHAR(50));

-- Calculate stats from listening history
DECLARE @TotalListens INT;
DECLARE @TotalMinutesListened INT;
DECLARE @UniqueArtists INT;
DECLARE @UniqueSongs INT;
DECLARE @TopGenre NVARCHAR(100);
DECLARE @TopArtist NVARCHAR(255);
DECLARE @TopSong NVARCHAR(255);

-- Get total listens
SELECT @TotalListens = COUNT(*)
FROM [spotify].[ListeningHistory]
WHERE UserID = @UserID AND YEAR(ListenedAt) = 2024;

-- Get total minutes listened
SELECT @TotalMinutesListened = ISNULL(SUM(PlayDuration), 0) / 60
FROM [spotify].[ListeningHistory]
WHERE UserID = @UserID AND YEAR(ListenedAt) = 2024;

-- Get unique songs
SELECT @UniqueSongs = COUNT(DISTINCT SongID)
FROM [spotify].[ListeningHistory]
WHERE UserID = @UserID AND YEAR(ListenedAt) = 2024;

-- Get unique artists
SELECT @UniqueArtists = COUNT(DISTINCT s.Artist)
FROM [spotify].[ListeningHistory] lh
JOIN [spotify].[Song] s ON lh.SongID = s.ID
WHERE lh.UserID = @UserID AND YEAR(lh.ListenedAt) = 2024;

-- Get top genre
SELECT TOP 1 @TopGenre = s.Genre
FROM [spotify].[ListeningHistory] lh
JOIN [spotify].[Song] s ON lh.SongID = s.ID
WHERE lh.UserID = @UserID AND YEAR(lh.ListenedAt) = 2024 AND s.Genre IS NOT NULL
GROUP BY s.Genre
ORDER BY COUNT(*) DESC;

-- Get top artist
SELECT TOP 1 @TopArtist = s.Artist
FROM [spotify].[ListeningHistory] lh
JOIN [spotify].[Song] s ON lh.SongID = s.ID
WHERE lh.UserID = @UserID AND YEAR(lh.ListenedAt) = 2024
GROUP BY s.Artist
ORDER BY COUNT(*) DESC;

-- Get top song
SELECT TOP 1 @TopSong = s.Name
FROM [spotify].[ListeningHistory] lh
JOIN [spotify].[Song] s ON lh.SongID = s.ID
WHERE lh.UserID = @UserID AND YEAR(lh.ListenedAt) = 2024
GROUP BY s.Name
ORDER BY COUNT(*) DESC;

PRINT 'Calculated stats:';
PRINT '  Total Listens: ' + CAST(@TotalListens AS NVARCHAR(20));
PRINT '  Total Minutes: ' + CAST(@TotalMinutesListened AS NVARCHAR(20));
PRINT '  Unique Songs: ' + CAST(@UniqueSongs AS NVARCHAR(20));
PRINT '  Unique Artists: ' + CAST(@UniqueArtists AS NVARCHAR(20));
PRINT '  Top Genre: ' + ISNULL(@TopGenre, 'N/A');
PRINT '  Top Artist: ' + ISNULL(@TopArtist, 'N/A');
PRINT '  Top Song: ' + ISNULL(@TopSong, 'N/A');

-- Check if user already has a 2024 summary
IF EXISTS (SELECT 1 FROM [spotify].[UserYearSummary] WHERE UserID = @UserID AND Year = 2024)
BEGIN
    -- Update existing record
    UPDATE [spotify].[UserYearSummary]
    SET TotalListens = @TotalListens,
        TotalMinutesListened = @TotalMinutesListened,
        UniqueSongs = @UniqueSongs,
        UniqueArtists = @UniqueArtists,
        TopGenre = @TopGenre,
        TopArtist = @TopArtist,
        TopSong = @TopSong
    WHERE UserID = @UserID AND Year = 2024;

    PRINT 'Updated existing User Year Summary for 2024';
END
ELSE
BEGIN
    -- Insert new record
    INSERT INTO [spotify].[UserYearSummary] (ID, UserID, Year, TotalListens, TotalMinutesListened, UniqueSongs, UniqueArtists, TopGenre, TopArtist, TopSong)
    VALUES (NEWID(), @UserID, 2024, @TotalListens, @TotalMinutesListened, @UniqueSongs, @UniqueArtists, @TopGenre, @TopArtist, @TopSong);

    PRINT 'Created new User Year Summary for 2024';
END

PRINT '';
PRINT '=== COMPLETE ===';
