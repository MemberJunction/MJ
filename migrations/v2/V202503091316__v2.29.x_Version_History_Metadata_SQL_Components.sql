DROP FUNCTION IF EXISTS ${flyway:defaultSchema}.ExtractVersionComponents
GO
CREATE FUNCTION ${flyway:defaultSchema}.ExtractVersionComponents(@Description NVARCHAR(500))
RETURNS @Result TABLE
(
    Version NVARCHAR(100),
    Major   NVARCHAR(10),
    Minor   NVARCHAR(10),
    Patch   NVARCHAR(10),
    VersionDescription NVARCHAR(500)
)
AS
BEGIN
    DECLARE @Cleaned NVARCHAR(500);
    DECLARE @i INT = 1;
    DECLARE @len INT;
    DECLARE @extracted NVARCHAR(100) = '';
    DECLARE @char CHAR(1);
    DECLARE @versionDescription NVARCHAR(500) = '';

    -- Trim spaces and remove a leading 'v' if present
    SET @Cleaned = LTRIM(RTRIM(@Description));
    IF (@Cleaned LIKE 'v%')
        SET @Cleaned = SUBSTRING(@Cleaned, 2, LEN(@Cleaned) - 1);
    
    SET @len = LEN(@Cleaned);

    -- Iterate character-by-character to extract the version portion
    WHILE @i <= @len
    BEGIN
        SET @char = SUBSTRING(@Cleaned, @i, 1);
        
        IF (@char >= '0' AND @char <= '9') OR (@char = '.')
        BEGIN
            SET @extracted = @extracted + @char;
            SET @i = @i + 1;
        END
        ELSE IF (@char = 'x')
        BEGIN
            IF LEN(@extracted) > 0 AND RIGHT(@extracted, 1) = '.'
            BEGIN
                SET @extracted = @extracted + @char;
                SET @i = @i + 1;
            END
            ELSE
            BEGIN
                BREAK;
            END
        END
        ELSE
        BEGIN
            -- If the last character is a dot, remove it.
            IF LEN(@extracted) > 0 AND RIGHT(@extracted, 1) = '.'
                SET @extracted = LEFT(@extracted, LEN(@extracted) - 1);
            BREAK;
        END
    END

    -- Extract the remaining part of the string as the VersionDescription,
    -- trimming any leading or trailing whitespace.
    IF @i <= @len
        SET @versionDescription = LTRIM(RTRIM(SUBSTRING(@Cleaned, @i, @len - @i + 1)));
    ELSE
        SET @versionDescription = '';

    -- Count the dots in the extracted version
    DECLARE @dotCount INT = LEN(@extracted) - LEN(REPLACE(@extracted, '.', ''));
    DECLARE @Major NVARCHAR(10) = '';
    DECLARE @Minor NVARCHAR(10) = '';
    DECLARE @Patch NVARCHAR(10) = '';

    -- Split the version into Major, Minor, and Patch using PARSENAME
    IF @dotCount = 1
    BEGIN
        SET @Major = PARSENAME(@extracted, 2);
        SET @Minor = PARSENAME(@extracted, 1);
    END
    ELSE IF @dotCount = 2
    BEGIN
        SET @Major = PARSENAME(@extracted, 3);
        SET @Minor = PARSENAME(@extracted, 2);
        SET @Patch = PARSENAME(@extracted, 1);
    END
    ELSE IF @dotCount = 0
    BEGIN
        SET @Major = @extracted;
    END

    INSERT INTO @Result(Version, Major, Minor, Patch, VersionDescription)
    VALUES (@extracted, @Major, @Minor, @Patch, @versionDescription);

    RETURN;
END;
GO
DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwFlywayVersionHistoryParsed 
GO
CREATE VIEW ${flyway:defaultSchema}.vwFlywayVersionHistoryParsed
AS
SELECT 
    f.installed_rank,
	f.installed_by,
	f.installed_on,
	f.execution_time,
	f.description RawDescription,
    v.Version,
	v.VersionDescription,
    v.Major,
    v.Minor,
    v.Patch
FROM ${flyway:defaultSchema}.flyway_schema_history f
CROSS APPLY ${flyway:defaultSchema}.ExtractVersionComponents(f.Description) v
WHERE f.version IS NOT NULL and f.success=1

GO

INSERT INTO ${flyway:defaultSchema}.Query
  (ID, Name, CategoryID, UserQuestion, SQL, Status)
VALUES
  ('23F8423E-F36B-1410-8D9C-00021F8B792E',
   'Server Installed Version History',
   '17AFCCEC-6A37-EF11-86D4-000D3A4E707E',
   'Show me a list of versions installed on the server in order of most recent version first',
   'SELECT * FROM ${flyway:defaultSchema}.vwFlywayVersionHistoryParsed ORDER BY installed_on DESC',
   'Approved')

