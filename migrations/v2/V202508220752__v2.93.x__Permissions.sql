-- Enable Permissions for Dashboards Entity for Dev/Integration Roles - already have this for UI by default in base system

INSERT INTO ${flyway:defaultSchema}.EntityPermission 
( 
   ID,
   RoleID, 
   EntityID,
   CanRead,CanCreate,CanUpdate,CanDelete
)
VALUES
(
  '1B4C433E-F36B-1410-8DC2-00021F8B792E',
  'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', -- Integration
  '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Dashboards,
  1,1,1,1
)

INSERT INTO ${flyway:defaultSchema}.EntityPermission 
( 
   ID,
   RoleID, 
   EntityID,
   CanRead,CanCreate,CanUpdate,CanDelete
)
VALUES
(
  '1D4C433E-F36B-1410-8DC2-00021F8B792E',
  'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', -- Developer
  '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Dashboards
  1,1,1,1
)
