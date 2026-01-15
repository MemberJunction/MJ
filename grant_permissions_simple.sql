-- =====================================================================================
-- Grant Permissions for MCP Authentication Migration
-- Database: MJ_Local
-- User: MJ_Connect
-- Run this script as a database administrator (e.g., 'sa' or admin user)
-- =====================================================================================

USE MJ_Local;
GO

PRINT 'Granting permissions to MJ_Connect for MCP Authentication migration...';
GO

-- Grant CREATE TABLE permission
GRANT CREATE TABLE TO [MJ_Connect];
GO

-- Grant ALTER permission on __mj schema
GRANT ALTER ON SCHEMA::__mj TO [MJ_Connect];
GO

-- Grant REFERENCES permission on __mj schema (for foreign keys)
GRANT REFERENCES ON SCHEMA::__mj TO [MJ_Connect];
GO

-- Grant EXECUTE on sp_addextendedproperty (for table/column descriptions)
GRANT EXECUTE ON sys.sp_addextendedproperty TO [MJ_Connect];
GO

-- Grant INSERT permission on __mj schema (for seed data)
GRANT INSERT ON SCHEMA::__mj TO [MJ_Connect];
GO

-- Grant SELECT permission on __mj.Entity (to check if tables are registered)
GRANT SELECT ON SCHEMA::__mj TO [MJ_Connect];
GO

PRINT '';
PRINT '✓ Permissions granted successfully!';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Run: node run_mcp_auth_migration.mjs';
PRINT '  2. Run CodeGen to generate entity classes';
PRINT '  3. Run: node verify_mcp_auth_tables.mjs';
PRINT '';
GO
