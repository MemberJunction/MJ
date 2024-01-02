-- COMMENTED OUT FOR SAFETY, EXECUTE THIS ONLY ON MJ_BASE TO CLEAN UP THE DATA for baseline MJ Admin schema
/*

DELETE FROM admin.QueueTask
DELETE FROM admin.ErrorLog
DELETE FROM admin.CompanyIntegrationRunDetail
DELETE FROM admin.CompanyIntegrationRunAPILog
DELETE FROM admin.CompanyIntegrationRun
DELETE FROM admin.CompanyIntegration
DELETE FROM admin.AuditLog
DELETE FROM admin.Report
DELETE FROM admin.ConversationDetail
DELETE FROM admin.Conversation
DELETE FROM admin.UserViewRunDetail
DELETE FROM admin.UserViewRun
DELETE FROM admin.UserView WHERE ID NOT IN (select ID FROM admin.UserView WHERE ID IN (SELECT DisplayUserViewID FROM admin.EntityRelationship))
DELETE FROM admin.CompanyIntegrationRunAPILog
DELETE FROM admin.RecordChange
DELETE FROM admin.WorkspaceItem
DELETE FROM admin.EmployeeCompanyIntegration
DELETE FROM admin.Employee
DELETE FROM admin.Dashboard
DELETE FROM admin.Integration 

*/
 