-- Grant create/update/delete permissions on Datasets and Dataset Items
-- for Developer role, and create/update for Integration role.
-- Required for mj-sync to push dataset metadata.

-- MJ: Datasets - Developer: full CRUD
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE ID = '7F7DC951-6278-4EAE-9241-1A82950F6EB9';

-- MJ: Datasets - Integration: create + update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE ID = '95F8DF12-49D5-4A04-ACAC-C6B5E0DB99AF';

-- MJ: Dataset Items - Developer: full CRUD
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE ID = 'F490AC74-BBA3-4815-A2FB-348463D189EB';

-- MJ: Dataset Items - Integration: create + update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE ID = 'CF13B5E4-E6D5-4E41-A4BB-EFBB569B64D0';
