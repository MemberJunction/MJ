/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.0.6
   TO:   1.0.15
*/
		
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS, NOCOUNT ON
GO
SET DATEFORMAT YMD
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
GO
BEGIN TRANSACTION

PRINT(N'Drop constraints from [__mj].[ResourceType]')
ALTER TABLE [__mj].[ResourceType] NOCHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]

PRINT(N'Drop constraint FK__Workspace__Resou__73305268 from [__mj].[WorkspaceItem]')
ALTER TABLE [__mj].[WorkspaceItem] NOCHECK CONSTRAINT [FK__Workspace__Resou__73305268]

PRINT(N'Drop constraints from [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Drop constraints from [__mj].[EntityPermission]')
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_CreateRLSFilter]
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_DeleteRLSFilter]
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_Entity]
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_ReadRLSFilter]
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_RoleName]
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_UpdateRLSFilter]

PRINT(N'Drop constraints from [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_RelatedEntity]

PRINT(N'Drop constraint FK_EntityFieldValue_EntityField from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Drop constraint FK_EntityDocument_EntityDocumentType from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_EntityDocumentType]

PRINT(N'Drop constraints from [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] NOCHECK CONSTRAINT [FK_Entity_Entity]

PRINT(N'Drop constraint FK_ApplicationEntity_Entity from [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_Entity]

PRINT(N'Drop constraint FK_AuditLog_Entity from [__mj].[AuditLog]')
ALTER TABLE [__mj].[AuditLog] NOCHECK CONSTRAINT [FK_AuditLog_Entity]

PRINT(N'Drop constraint FK_CompanyIntegrationRecordMap_Entity from [__mj].[CompanyIntegrationRecordMap]')
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] NOCHECK CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity]

PRINT(N'Drop constraint FK_CompanyIntegrationRunDetail_Entity from [__mj].[CompanyIntegrationRunDetail]')
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] NOCHECK CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity]

PRINT(N'Drop constraint FK_Conversation_Entity from [__mj].[Conversation]')
ALTER TABLE [__mj].[Conversation] NOCHECK CONSTRAINT [FK_Conversation_Entity]

PRINT(N'Drop constraint FK_DataContextItem_Entity from [__mj].[DataContextItem]')
ALTER TABLE [__mj].[DataContextItem] NOCHECK CONSTRAINT [FK_DataContextItem_Entity]

PRINT(N'Drop constraint FK_DatasetItem_Entity from [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_Entity]

PRINT(N'Drop constraint FK_EntityAIAction_Entity from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity]

PRINT(N'Drop constraint FK_EntityAIAction_Entity1 from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity1]

PRINT(N'Drop constraint FK_EntityDocument_Entity from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_Entity]

PRINT(N'Drop constraint FK_EntityFieldValue_Entity from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_Entity]

PRINT(N'Drop constraint FK_EntityRecordDocument_Entity from [__mj].[EntityRecordDocument]')
ALTER TABLE [__mj].[EntityRecordDocument] NOCHECK CONSTRAINT [FK_EntityRecordDocument_Entity]

PRINT(N'Drop constraint FK_FileEntityRecordLink_Entity from [__mj].[FileEntityRecordLink]')
ALTER TABLE [__mj].[FileEntityRecordLink] NOCHECK CONSTRAINT [FK_FileEntityRecordLink_Entity]

PRINT(N'Drop constraint FK_IntegrationURLFormat_Entity from [__mj].[IntegrationURLFormat]')
ALTER TABLE [__mj].[IntegrationURLFormat] NOCHECK CONSTRAINT [FK_IntegrationURLFormat_Entity]

PRINT(N'Drop constraint FK_List_Entity from [__mj].[List]')
ALTER TABLE [__mj].[List] NOCHECK CONSTRAINT [FK_List_Entity]

PRINT(N'Drop constraint FK_QueryField_SourceEntity from [__mj].[QueryField]')
ALTER TABLE [__mj].[QueryField] NOCHECK CONSTRAINT [FK_QueryField_SourceEntity]

PRINT(N'Drop constraint FK_RecordChange_Entity from [__mj].[RecordChange]')
ALTER TABLE [__mj].[RecordChange] NOCHECK CONSTRAINT [FK_RecordChange_Entity]

PRINT(N'Drop constraint FK_RecordMergeLog_Entity from [__mj].[RecordMergeLog]')
ALTER TABLE [__mj].[RecordMergeLog] NOCHECK CONSTRAINT [FK_RecordMergeLog_Entity]

PRINT(N'Drop constraint FK_SystemEvent_Entity from [__mj].[SystemEvent]')
ALTER TABLE [__mj].[SystemEvent] NOCHECK CONSTRAINT [FK_SystemEvent_Entity]

PRINT(N'Drop constraint FK_TaggedItem_Entity from [__mj].[TaggedItem]')
ALTER TABLE [__mj].[TaggedItem] NOCHECK CONSTRAINT [FK_TaggedItem_Entity]

PRINT(N'Drop constraint FK_User_LinkedEntity from [__mj].[User]')
ALTER TABLE [__mj].[User] NOCHECK CONSTRAINT [FK_User_LinkedEntity]

PRINT(N'Drop constraint FK_UserApplicationEntity_Entity from [__mj].[UserApplicationEntity]')
ALTER TABLE [__mj].[UserApplicationEntity] NOCHECK CONSTRAINT [FK_UserApplicationEntity_Entity]

PRINT(N'Drop constraint FK_UserFavorite_Entity from [__mj].[UserFavorite]')
ALTER TABLE [__mj].[UserFavorite] NOCHECK CONSTRAINT [FK_UserFavorite_Entity]

PRINT(N'Drop constraint FK_UserRecordLog_Entity from [__mj].[UserRecordLog]')
ALTER TABLE [__mj].[UserRecordLog] NOCHECK CONSTRAINT [FK_UserRecordLog_Entity]

PRINT(N'Drop constraint FK_UserView_Entity from [__mj].[UserView]')
ALTER TABLE [__mj].[UserView] NOCHECK CONSTRAINT [FK_UserView_Entity]

PRINT(N'Drop constraint FK_UserViewCategory_Entity from [__mj].[UserViewCategory]')
ALTER TABLE [__mj].[UserViewCategory] NOCHECK CONSTRAINT [FK_UserViewCategory_Entity]

PRINT(N'Delete row from [__mj].[VersionInstallation]')
DELETE FROM [__mj].[VersionInstallation] WHERE [ID] = 5

PRINT(N'Update rows in [__mj].[ResourceType]')
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-solid fa-table', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 1
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-solid fa-table-columns', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 2
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-solid fa-chart-simple', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 3
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-solid fa-rectangle-list', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 4
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-solid fa-magnifying-glass', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 5
UPDATE [__mj].[ResourceType] SET [Icon]=N'fa-regular fa-file-code', [UpdatedAt]='2024-04-14 16:47:02.943' WHERE [ID] = 6
PRINT(N'Operation applied to 6 rows out of 6')

PRINT(N'Update rows in [__mj].[EntityPermission]')
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.830' WHERE [ID] = 9
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.890' WHERE [ID] = 11
UPDATE [__mj].[EntityPermission] SET [CanUpdate]=1, [CanDelete]=1, [UpdatedAt]='2024-04-10 23:52:35.490' WHERE [ID] = 242
UPDATE [__mj].[EntityPermission] SET [CanCreate]=1, [CanUpdate]=1, [UpdatedAt]='2024-04-10 23:43:26.610' WHERE [ID] = 245
UPDATE [__mj].[EntityPermission] SET [CanCreate]=1, [CanUpdate]=1, [CanDelete]=1, [UpdatedAt]='2024-04-10 23:52:35.430' WHERE [ID] = 251
UPDATE [__mj].[EntityPermission] SET [CanCreate]=0, [UpdatedAt]='2024-04-10 20:01:53.170' WHERE [ID] = 265
UPDATE [__mj].[EntityPermission] SET [CanCreate]=0, [UpdatedAt]='2024-04-10 20:01:53.260' WHERE [ID] = 266
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.690' WHERE [ID] = 275
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.490' WHERE [ID] = 276
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.557' WHERE [ID] = 277
UPDATE [__mj].[EntityPermission] SET [UpdatedAt]='2024-04-10 23:41:52.623' WHERE [ID] = 279
PRINT(N'Operation applied to 11 rows out of 11')

PRINT(N'Delete and re-insert rows in [__mj].[EntityField] due to identity row modification')
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 89 AND [Name] = N'List'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 127 AND [Name] = N'Parent'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 135 AND [Name] = N'AIModelType'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 144 AND [Name] = N'Queue'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 157 AND [Name] = N'OutputWorkflow'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 185 AND [Name] = N'User'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 196 AND [Name] = N'User'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 197 AND [Name] = N'User'
DELETE FROM [__mj].[EntityField] WHERE [EntityID] = 198 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'Domain'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'LogoURL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 5 AND [Name] = N'Website'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'Active'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'BCMID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'CompanyID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'Email'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'FirstLast'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'FirstName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'LastName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'Phone'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'Supervisor'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'SupervisorEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'SupervisorFirstName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'SupervisorID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'SupervisorLastName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'Title'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 6 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'EntityBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'EntityBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 9 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'CompanyIntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'EmployeeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'ExternalSystemRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 17 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'EmployeeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'Role'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'RoleID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 18 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'EmployeeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'Skill'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'SkillID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 19 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'DirectoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'SQLName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 25 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 26 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'FullURLFormat'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'Integration'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'IntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'IntegrationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'NavigationBaseURL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 32 AND [Name] = N'URLFormat'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'BatchMaxRequestCount'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'BatchRequestWaitTime'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'ClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'ImportPath'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'NavigationBaseURL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 34 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'AccessToken'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'APIKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'ClientID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'ClientSecret'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'Company'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'CompanyID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'CompanyName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'CustomAttribute1'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'DriverClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'DriverImportPath'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'ExternalSystemID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'Integration'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'IntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'IntegrationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'IsExternalSystemReadOnly'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'LastRunEndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'LastRunID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'LastRunStartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'RefreshToken'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'TokenExpirationDate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 35 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'AllowsNull'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'AllowUpdateAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'AllowUpdateInView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'AutoIncrement'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'AutoUpdateDescription'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'BaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'BaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'DefaultColumnWidth'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'DefaultInView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'DefaultValue'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'DisplayName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'EntityClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'EntityCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'ExtendedType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'FullTextSearchEnabled'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'GeneratedFormSection'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IncludeInGeneratedForm'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IncludeInUserSearchAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IncludeRelatedEntityNameFieldInBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IsNameField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IsPrimaryKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IsUnique'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'IsVirtual'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Length'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Precision'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityFieldName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntityNameFieldMap'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'RelatedEntitySchemaName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Scale'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'SchemaName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'UserSearchParamFormatAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'ValueListType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 36 AND [Name] = N'ViewCellTemplate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AllowAllRowsAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AllowCreateAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AllowDeleteAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AllowUpdateAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AllowUserSearchAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AuditRecordAccess'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AuditViewRuns'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'AutoUpdateDescription'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'BaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'BaseTableCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'BaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'BaseViewGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'CascadeDeletes'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'CodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'CustomResolverAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'EntityObjectSubclassImport'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'EntityObjectSubclassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextCatalog'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextCatalogGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextIndex'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextIndexGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextSearchEnabled'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextSearchFunction'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'FullTextSearchFunctionGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'IncludeInAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'NameSuffix'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ParentBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ParentBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ParentEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'SchemaName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spCreate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spCreateGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spDelete'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spDeleteGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spUpdate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'spUpdateGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'TrackRecordChanges'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'UserFormGenerated'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'UserViewMaxRows'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 37 AND [Name] = N'VirtualEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'Email'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeFirstLast'
UPDATE [__mj].[EntityField] SET [RelatedEntityID]=6, [RelatedEntityFieldName]=N'ID', [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeSupervisor'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeSupervisorEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'EmployeeTitle'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'FirstLast'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'FirstName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'LastName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'LinkedEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'LinkedEntityRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'LinkedRecordType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'Title'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 39 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'BundleInAPI'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'DisplayInForm'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'DisplayName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'DisplayUserViewGUID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'DisplayUserViewID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'DisplayUserViewName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'EntityBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'EntityBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'EntityKeyField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'IncludeInParentAllQuery'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'JoinEntityInverseJoinField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'JoinEntityJoinField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'JoinView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityBaseTableCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'RelatedEntityJoinField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 40 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'EarliestAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'LatestAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'TotalCount'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserFirstLast'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserSupervisor'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 41 AND [Name] = N'UserSupervisorEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'CategoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'CustomFilterState'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'CustomWhereClause'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'EntityBaseView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'FilterState'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'GridState'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'GUID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'IsDefault'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'IsShared'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'SmartFilterEnabled'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'SmartFilterExplanation'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'SmartFilterPrompt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'SmartFilterWhereClause'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'SortState'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UserEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UserFirstLast'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UserName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'UserType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 42 AND [Name] = N'WhereClause'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'CompanyIntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'EndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'RunByUser'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'RunByUserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'StartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 53 AND [Name] = N'TotalRecords'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'Action'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'CompanyIntegrationRunID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'ExecutedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'IsSuccess'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'RunEndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 54 AND [Name] = N'RunStartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'Code'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'CompanyIntegrationRunDetailID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'CompanyIntegrationRunID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'CreatedBy'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'Details'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'Message'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 70 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 71 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 71 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 71 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 71 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 71 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'Application'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'ApplicationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'DefaultForNewUser'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'EntityBaseTable'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'EntityBaseTableCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'EntityClassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'EntityCodeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 76 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CanCreate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CanDelete'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CanRead'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CanUpdate'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CreateRLSFilter'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'CreateRLSFilterID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'DeleteRLSFilter'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'DeleteRLSFilterID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'ReadRLSFilter'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'ReadRLSFilterID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'RoleName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'RoleSQLName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'UpdateRLSFilter'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 77 AND [Name] = N'UpdateRLSFilterID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'Application'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 79 AND [Name] = N'UserApplicationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'Application'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'ApplicationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 80 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'CompanyIntegrationRunID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'ExecutedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'IsSuccess'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'Parameters'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'RequestMethod'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 87 AND [Name] = N'URL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'CompanyIntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'ExternalSystemRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 88 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 89 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 89 AND [Name] = N'ListID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 89 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 89 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'RunAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'RunByUser'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'RunByUserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'UserView'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 90 AND [Name] = N'UserViewID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 91 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 91 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 91 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 91 AND [Name] = N'UserViewID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 91 AND [Name] = N'UserViewRunID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'EndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'ExternalSystemRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'Results'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'StartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'Workflow'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'WorkflowEngineName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 92 AND [Name] = N'WorkflowName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'AutoRunEnabled'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'AutoRunInterval'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'AutoRunIntervalMinutes'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'AutoRunIntervalUnits'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'CompanyName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'ExternalSystemRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'SubclassName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 93 AND [Name] = N'WorkflowEngineName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'DriverClass'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'DriverPath'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 96 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'ChangedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'ChangesDescription'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'ChangesJSON'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'FullRecordJSON'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 97 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'RoleName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 124 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'FilterText'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 125 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'AuditLogTypeName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'AuthorizationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'Details'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 126 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 127 AND [Name] = N'UseAuditLog'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'AuthorizationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'RoleName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 128 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'AuthorizationName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 129 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'Code'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'EntityField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'EntityFieldName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 130 AND [Name] = N'Value'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'AIModelTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'APIName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'DriverClass'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'DriverImportPath'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'PowerRank'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 135 AND [Name] = N'Vendor'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'DefaultModel'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'DefaultModelID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'DefaultPrompt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 136 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'AIAction'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'AIActionID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'AIModel'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'AIModelID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 137 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'AIAction'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'AIActionID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'AIModel'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'AIModelID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'OutputEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'OutputEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'OutputField'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'OutputType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'Prompt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'SkipIfOutputFieldNotEmpty'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'TriggerEvent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 138 AND [Name] = N'UserMessage'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 139 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 139 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 139 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'DriverClass'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'DriverImportPath'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 142 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'LastHeartbeat'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessCwd'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessHostName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessIPAddress'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessMacAddress'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessOSName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessOSVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessPID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessPlatform'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessUserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessUserName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'ProcessVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'QueueType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'QueueTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 143 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'Data'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'EndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'ErrorMessage'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'Options'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'Output'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'QueueID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'StartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 144 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'CategoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'UIConfigDetails'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 153 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 154 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 154 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 154 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 155 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 155 AND [Name] = N'DisplayFormat'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 155 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 155 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 156 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 156 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 156 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'CategoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'Configuration'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'Conversation'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'ConversationDetailID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'ConversationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'DataContext'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'DataContextID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputDeliveryType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputDeliveryTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputEvent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputEventID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputFormatType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputFormatTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputFrequency'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputTargetEmail'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputTriggerType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputTriggerTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'OutputWorkflowID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'SharingScope'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 157 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'Report'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'ReportID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'ResultSet'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 159 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'DisplayName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'Icon'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 160 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'DisplayName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 161 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'Tag'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 162 AND [Name] = N'TagID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 163 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 163 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 163 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 163 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 163 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'Configuration'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'ResourceRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'ResourceType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'ResourceTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'WorkSpace'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 164 AND [Name] = N'WorkSpaceID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 168 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 168 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 168 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 168 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 168 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'Code'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'DatasetName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'DateFieldToCheck'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 169 AND [Name] = N'WhereClause'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'Conversation'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'ConversationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'Error'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'ExternalID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'HiddenToUser'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'Message'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'Role'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 172 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'DataContextID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'ExternalID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'IsArchived'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'LinkedEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'LinkedEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'LinkedRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 173 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'Message'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'ReadAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'ResourceConfiguration'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'ResourceRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'ResourceTypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'Title'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'Unread'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 174 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'EntityIDMax'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'EntityIDMin'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'SchemaName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 180 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'CompanyIntegrationID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'EntityRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'ExternalSystemRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 181 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ApprovalStatus'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ApprovedByUserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'InitiatedByUser'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'InitiatedByUserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ProcessingEndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ProcessingLog'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ProcessingStartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'ProcessingStatus'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'SurvivingRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 182 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'DeletedRecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'ProcessingLog'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'RecordMergeLogID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 183 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'ComputationDescription'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'IsComputed'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'IsSummary'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'Query'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'QueryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'Sequence'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SourceEntity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SourceEntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SourceFieldName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SQLBaseType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SQLFullType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'SummaryDescription'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 184 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 185 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'CategoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'Feedback'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'OriginalSQL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'QualityRank'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'SQL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 186 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 187 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 187 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 187 AND [Name] = N'QueryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 187 AND [Name] = N'RoleName'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 187 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'EmbeddingModel'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'EmbeddingModelID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'VectorDatabase'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 188 AND [Name] = N'VectorDatabaseID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 189 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 189 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 189 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 189 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 189 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'EndedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'EntityDocument'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'EntityDocumentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'StartedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 190 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'ClassKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'DefaultURL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 191 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'DocumentText'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'EntityRecordUpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'VectorID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'VectorIndexID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 192 AND [Name] = N'VectorJSON'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [Sequence]=11, [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'Template'
UPDATE [__mj].[EntityField] SET [Sequence]=12, [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'TypeID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 193 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'DataContext'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'DataContextID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'DataJSON'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'LastRefreshedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'Query'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'QueryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'SQL'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'View'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 194 AND [Name] = N'ViewID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'LastRefreshedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'User'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 195 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 196 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 197 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 198 AND [Name] = N'UserID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'ClientDriverKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'IsActive'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'Priority'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'ServerDriverKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 199 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'Category'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'CategoryID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'ContentType'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'Provider'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'ProviderID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'ProviderKey'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 200 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'Description'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'Name'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'Parent'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'ParentID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 201 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'Entity'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'EntityID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'File'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'FileID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'RecordID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 202 AND [Name] = N'UpdatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'Comments'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'CompleteVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'CreatedAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'ID'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'InstalledAt'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'InstallLog'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'MajorVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'MinorVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'PatchVersion'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'Status'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'Type'
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-04-15 15:30:07.467' WHERE [EntityID] = 203 AND [Name] = N'UpdatedAt'
SET IDENTITY_INSERT [__mj].[EntityField] ON
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (89,N'List',3670,5,N'List',NULL,1,0,0,NULL,N'nvarchar',200,0,0,0,NULL,0,N'None',NULL,1,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.010','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (127,N'Parent',3671,9,N'Parent',NULL,1,0,0,NULL,N'nvarchar',200,0,0,1,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.070','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (135,N'AIModelType',3672,13,N'AIModel Type',NULL,1,0,0,NULL,N'nvarchar',100,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.123','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (144,N'Queue',3673,11,N'Queue',NULL,1,0,0,NULL,N'nvarchar',100,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.190','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (157,N'OutputWorkflow',3674,28,N'Output Workflow',NULL,1,0,0,NULL,N'nvarchar',200,0,0,1,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.257','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (185,N'User',3675,9,N'User',NULL,1,0,0,NULL,N'nvarchar',200,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.310','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (196,N'User',3676,10,N'User',NULL,1,0,0,NULL,N'nvarchar',200,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.530','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (197,N'User',3677,9,N'User',NULL,1,0,0,NULL,N'nvarchar',200,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.680','2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID],[Name],[ID],[Sequence],[DisplayName],[Description],[AutoUpdateDescription],[IsPrimaryKey],[IsUnique],[Category],[Type],[Length],[Precision],[Scale],[AllowsNull],[DefaultValue],[AutoIncrement],[ValueListType],[ExtendedType],[DefaultInView],[ViewCellTemplate],[DefaultColumnWidth],[AllowUpdateAPI],[AllowUpdateInView],[IncludeInUserSearchAPI],[FullTextSearchEnabled],[UserSearchParamFormatAPI],[IncludeInGeneratedForm],[GeneratedFormSection],[IsVirtual],[IsNameField],[RelatedEntityID],[RelatedEntityFieldName],[IncludeRelatedEntityNameFieldInBaseView],[RelatedEntityNameFieldMap],[CreatedAt],[UpdatedAt]) VALUES (198,N'User',3678,9,N'User',NULL,1,0,0,NULL,N'nvarchar',200,0,0,0,NULL,0,N'None',NULL,0,NULL,150,0,1,0,0,NULL,1,N'Details',1,0,NULL,NULL,0,NULL,'2024-04-12 19:45:04.760','2024-04-15 15:30:07.467')
SET IDENTITY_INSERT [__mj].[EntityField] OFF
PRINT(N'Operation applied to 9 rows out of 962')

PRINT(N'Update rows in [__mj].[Entity]')
UPDATE [__mj].[Entity] SET [UserViewMaxRows]=1000, [UpdatedAt]='2024-04-15 00:54:33.983' WHERE [ID] = 76
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 89
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 127
UPDATE [__mj].[Entity] SET [UserViewMaxRows]=1000, [UpdatedAt]='2024-04-15 00:59:07.677' WHERE [ID] = 129
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 135
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 144
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 157
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 185
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 196
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 197
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-04-12 19:44:03.073' WHERE [ID] = 198
PRINT(N'Operation applied to 11 rows out of 11')

PRINT(N'Add row to [__mj].[EntityDocumentType]')
SET IDENTITY_INSERT [__mj].[EntityDocumentType] ON
INSERT INTO [__mj].[EntityDocumentType] ([ID], [Name], [Description], [CreatedAt], [UpdatedAt]) VALUES (9, N'Record Duplicate', N'Document Type for record duplicate detection', '2024-04-12 16:45:57.287', '2024-04-12 16:45:57.287')
SET IDENTITY_INSERT [__mj].[EntityDocumentType] OFF

PRINT(N'Add rows to [__mj].[RowLevelSecurityFilter]')
SET IDENTITY_INSERT [__mj].[RowLevelSecurityFilter] ON
INSERT INTO [__mj].[RowLevelSecurityFilter] ([ID], [Name], [Description], [FilterText], [CreatedAt], [UpdatedAt]) VALUES (1, N'Demo - Last Starts w/ A, B, or C', NULL, N'LastName LIKE ''A%'' OR LastName LIKE ''B%'' OR LastName LIKE ''C%''', '2023-04-30 00:58:41.683', '2023-04-30 00:58:41.683')
INSERT INTO [__mj].[RowLevelSecurityFilter] ([ID], [Name], [Description], [FilterText], [CreatedAt], [UpdatedAt]) VALUES (2, N'Accounts Linked to User''s Company', NULL, N' ID IN ( 
 Select AccountID FROM vwAccountCompanyIntegrations aci INNER JOIN vwEmployees e ON aci.CompanyID = e.CompanyID INNER JOIN vwUsers u ON e.ID=u.EmployeeID WHERE u.Email=''{{UserEmail}}''
 )
', '2023-04-30 00:59:41.757', '2023-04-30 00:59:41.757')
SET IDENTITY_INSERT [__mj].[RowLevelSecurityFilter] OFF
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Add row to [__mj].[VersionInstallation]')
SET IDENTITY_INSERT [__mj].[VersionInstallation] ON
INSERT INTO [__mj].[VersionInstallation] ([ID], [MajorVersion], [MinorVersion], [PatchVersion], [Type], [InstalledAt], [Status], [InstallLog], [Comments], [CreatedAt], [UpdatedAt]) VALUES (7, 1, 0, 15, N'New', '2024-04-20 15:54:14.800', N'Pending', NULL, NULL, '2024-04-20 15:54:14.800', '2024-04-20 15:54:14.800')
SET IDENTITY_INSERT [__mj].[VersionInstallation] OFF

PRINT(N'Add rows to [__mj].[EntityField]')
SET IDENTITY_INSERT [__mj].[EntityField] ON
INSERT INTO [__mj].[EntityField] ([EntityID], [Name], [ID], [Sequence], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (192, N'EntityDocumentID', 3667, 11, N'Entity Document ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-04-12 19:44:11.693', '2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID], [Name], [ID], [Sequence], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (193, N'AIModelID', 3669, 10, N'AIModel ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-04-12 19:44:11.800', '2024-04-15 15:30:07.467')
INSERT INTO [__mj].[EntityField] ([EntityID], [Name], [ID], [Sequence], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (193, N'VectorDatabaseID', 3668, 9, N'Vector Database ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-04-12 19:44:11.750', '2024-04-15 15:30:07.467')
SET IDENTITY_INSERT [__mj].[EntityField] OFF
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Add rows to [__mj].[EntityRelationship]')
SET IDENTITY_INSERT [__mj].[EntityRelationship] ON
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (193, 191, 0, 193, 1, 0, N'One To Many         ', NULL, N'ID', NULL, NULL, NULL, 1, N'Entity Documents', NULL, '2024-04-12 19:44:28.230', '2024-04-12 19:44:28.230')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (194, 6, 0, 39, 1, 0, N'One To Many         ', NULL, N'EmployeeID', NULL, NULL, NULL, 1, N'Users', NULL, '2024-04-15 00:32:46.480', '2024-04-15 00:32:46.480')
SET IDENTITY_INSERT [__mj].[EntityRelationship] OFF
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Add constraints to [__mj].[ResourceType]')
ALTER TABLE [__mj].[ResourceType] WITH CHECK CHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]
ALTER TABLE [__mj].[WorkspaceItem] WITH CHECK CHECK CONSTRAINT [FK__Workspace__Resou__73305268]

PRINT(N'Add constraints to [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Add constraints to [__mj].[EntityPermission]')
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_CreateRLSFilter]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_DeleteRLSFilter]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_Entity]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_ReadRLSFilter]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_RoleName]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_UpdateRLSFilter]

PRINT(N'Add constraints to [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_RelatedEntity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_EntityField]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_EntityDocumentType]

PRINT(N'Add constraints to [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] WITH CHECK CHECK CONSTRAINT [FK_Entity_Entity]
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_Entity]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity]
ALTER TABLE [__mj].[Conversation] WITH CHECK CHECK CONSTRAINT [FK_Conversation_Entity]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_Entity]
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_Entity]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity1]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_Entity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityRecordDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityRecordDocument_Entity]
ALTER TABLE [__mj].[FileEntityRecordLink] WITH CHECK CHECK CONSTRAINT [FK_FileEntityRecordLink_Entity]
ALTER TABLE [__mj].[IntegrationURLFormat] WITH CHECK CHECK CONSTRAINT [FK_IntegrationURLFormat_Entity]
ALTER TABLE [__mj].[List] WITH CHECK CHECK CONSTRAINT [FK_List_Entity]
ALTER TABLE [__mj].[QueryField] WITH CHECK CHECK CONSTRAINT [FK_QueryField_SourceEntity]
ALTER TABLE [__mj].[RecordChange] WITH CHECK CHECK CONSTRAINT [FK_RecordChange_Entity]
ALTER TABLE [__mj].[RecordMergeLog] WITH CHECK CHECK CONSTRAINT [FK_RecordMergeLog_Entity]
ALTER TABLE [__mj].[SystemEvent] WITH CHECK CHECK CONSTRAINT [FK_SystemEvent_Entity]
ALTER TABLE [__mj].[TaggedItem] WITH CHECK CHECK CONSTRAINT [FK_TaggedItem_Entity]
ALTER TABLE [__mj].[User] WITH CHECK CHECK CONSTRAINT [FK_User_LinkedEntity]
ALTER TABLE [__mj].[UserApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_UserApplicationEntity_Entity]
ALTER TABLE [__mj].[UserFavorite] WITH CHECK CHECK CONSTRAINT [FK_UserFavorite_Entity]
ALTER TABLE [__mj].[UserRecordLog] WITH CHECK CHECK CONSTRAINT [FK_UserRecordLog_Entity]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_Entity]
ALTER TABLE [__mj].[UserViewCategory] WITH CHECK CHECK CONSTRAINT [FK_UserViewCategory_Entity]
COMMIT TRANSACTION
GO
