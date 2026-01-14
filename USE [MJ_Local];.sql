USE [MJ_Local];
GO

-- Create database users for the logins
CREATE USER [MJ_CodeGen] FOR LOGIN [MJ_CodeGen];
CREATE USER [MJ_Connect] FOR LOGIN [MJ_Connect];

-- MJ_CodeGen needs db_owner for schema management
EXEC sp_addrolemember 'db_owner', 'MJ_CodeGen';

-- MJ_Connect needs read/write for application access
EXEC sp_addrolemember 'db_datareader', 'MJ_Connect';
EXEC sp_addrolemember 'db_datawriter', 'MJ_Connect';