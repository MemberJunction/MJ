-- =====================================================================================
-- Grant Permissions for MCP Authentication Migration
-- Run this script as a database administrator
-- =====================================================================================

USE MJ_Local;
GO

-- Get the current database user (the one you're using to connect)
-- Replace 'your_username' with your actual database username if known
PRINT 'Granting permissions for MCP Authentication migration...';
GO

-- Option 1: If you know your username, uncomment and replace:
-- DECLARE @Username NVARCHAR(128) = 'your_username_here';

-- Option 2: Use the current user (recommended)
DECLARE @Username NVARCHAR(128) = USER_NAME();

PRINT 'Current user: ' + @Username;
GO

-- Grant CREATE TABLE permission
GRANT CREATE TABLE TO [$(Username)];
GO

-- Grant ALTER permission on __mj schema
GRANT ALTER ON SCHEMA::__mj TO [$(Username)];
GO

-- Grant CREATE INDEX permission (for the indexes in the migration)
GRANT CREATE INDEX TO [$(Username)];
GO

-- Grant EXECUTE on sp_addextendedproperty (for table descriptions)
GRANT EXECUTE ON sys.sp_addextendedproperty TO [$(Username)];
GO

-- Grant INSERT permission on __mj schema (for seed data)
GRANT INSERT ON SCHEMA::__mj TO [$(Username)];
GO

PRINT 'Permissions granted successfully!';
PRINT 'You can now run: node run_mcp_auth_migration.mjs';
GO
