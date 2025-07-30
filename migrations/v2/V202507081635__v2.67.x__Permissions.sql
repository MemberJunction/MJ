-- Make Workspace Items create/delete enabled for ALL roles
UPDATE ${flyway:defaultSchema}.EntityPermission SET CanCreate=1,CanDelete=1 WHERE ID IN (
'58DF3BC8-4277-4C67-8CC2-2E6A1C645699',
'3B1348B5-9E4F-4DC6-8F9D-AAA4C90C62C5',
'4236984F-032C-48DD-9D4F-E1531B205481'
)
