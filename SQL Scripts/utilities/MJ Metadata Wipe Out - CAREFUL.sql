/* CLEAN UP MJ INSTALL SCRIPT - COMMENTED OUT FOR SAFETY */
/*
DELETE FROM admin.EntityRelationship WHERE EntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin') OR RelatedEntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin')
DELETE FROM admin.ApplicationEntity WHERE EntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin')
DELETE FROM admin.Application WHERE Name IN (SELECT SchemaName FROM admin.Entity WHERE SchemaName <> 'admin')
DELETE FROM admin.EntityPermission WHERE EntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin')
DELETE FROM admin.EntityField WHERE EntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin')
DELETE FROM admin.UserView WHERE EntityID IN (SELECT ID FROM admin.Entity WHERE SchemaName <>'admin')
DELETE FROM admin.WorkspaceItem
DELETE FROM admin.Workspace
DELETE FROM admin.Entity WHERE SchemaName <>'admin'
*/ 
 