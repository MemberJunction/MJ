-- COMMENTED OUT FOR SAFETY, EXECUTE THIS ONLY ON MJ_BASE TO CLEAN UP THE DATA for baseline MJ __mj schema
/*

DELETE FROM __mj.QueueTask
DELETE FROM __mj.ErrorLog
DELETE FROM __mj.CompanyIntegrationRunDetail
DELETE FROM __mj.CompanyIntegrationRunAPILog
DELETE FROM __mj.CompanyIntegrationRun
DELETE FROM __mj.CompanyIntegration
DELETE FROM __mj.AuditLog
DELETE FROM __mj.Report
DELETE FROM __mj.ConversationDetail
DELETE FROM __mj.Conversation
DELETE FROM __mj.UserViewRunDetail
DELETE FROM __mj.UserViewRun
DELETE FROM __mj.UserView WHERE ID NOT IN (select ID FROM __mj.UserView WHERE ID IN (SELECT DisplayUserViewID FROM __mj.EntityRelationship))
DELETE FROM __mj.CompanyIntegrationRunAPILog
DELETE FROM __mj.RecordChange
DELETE FROM __mj.WorkspaceItem
DELETE FROM __mj.EmployeeCompanyIntegration
DELETE FROM __mj.Employee
DELETE FROM __mj.Dashboard
DELETE FROM __mj.Integration 

*/
 