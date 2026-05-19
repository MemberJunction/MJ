
-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Fix EntityRelationship records for MJ: Roles entity                                                                                                                                                                                                                                                                   
-- The RelatedEntityJoinField was incorrectly set to 'RoleName' (a display column)
-- instead of 'RoleID' (the FK column). This caused relationship queries to compare
-- a name column against a UUID primary key value, always returning zero results.
-- This was from some pre 2.0 metadata that was never cleaned up but found during the Postgres work
-- MJ: Authorization Roles                                                                                                                                                                                                                                                                                                
-- MJ: Entity Permissions                                        
-- MJ: Query Permissions                                                                                                                                                                                                                                                                                                  
-- MJ: User Roles 

UPDATE __mj."EntityRelationship"
SET "RelatedEntityJoinField" = 'RoleID'
WHERE "EntityID" = (
    SELECT "ID" FROM __mj."Entity" WHERE "Name" = 'MJ: Roles'
)
AND "RelatedEntityJoinField" = 'RoleName';
