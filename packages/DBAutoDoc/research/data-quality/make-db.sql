-- Copy the AdventureWorks benchmark database (declared keys intact) to a scratch database the
-- injection script can damage. Run against the bench server:
--   sqlcmd -S host,port -U sa -P ... -C -i make-db.sql -v SOURCE=AW_Truth TARGET=AW_Quality
-- Drops TARGET first if it exists.
SET NOCOUNT ON;
IF DB_ID('$(TARGET)') IS NOT NULL
BEGIN
    ALTER DATABASE [$(TARGET)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$(TARGET)];
END
BACKUP DATABASE [$(SOURCE)] TO DISK = N'/var/opt/mssql/data/$(SOURCE)-quality.bak' WITH INIT, COPY_ONLY;
DECLARE @data sysname, @log sysname, @sql nvarchar(max);
SELECT @data = name FROM [$(SOURCE)].sys.database_files WHERE type = 0;
SELECT @log = name FROM [$(SOURCE)].sys.database_files WHERE type = 1;
SET @sql = N'RESTORE DATABASE [$(TARGET)] FROM DISK = N''/var/opt/mssql/data/$(SOURCE)-quality.bak'' WITH '
    + N'MOVE ''' + @data + N''' TO ''/var/opt/mssql/data/$(TARGET).mdf'', '
    + N'MOVE ''' + @log + N''' TO ''/var/opt/mssql/data/$(TARGET)_log.ldf'', REPLACE';
EXEC sys.sp_executesql @sql;
