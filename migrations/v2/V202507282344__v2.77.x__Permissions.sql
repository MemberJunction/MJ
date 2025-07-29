-- Add permissions for the developer role on the reports entity
INSERT INTO ${flyway:defaultSchema}.EntityPermission (
    ID, 
    EntityID, 
    RoleID, 
    CanCreate, CanRead, CanUpdate, CanDelete) 
VALUES 
( 
  'A7D3433E-F36B-1410-8DBA-00021F8B792E', -- new ID for the permission record 
  '09248F34-2837-EF11-86D4-6045BDEE16E6', -- reports
  'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', -- developer
  1,1,1,1
)
