/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.7.x
   TO:   1.8.x
*/
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
GO
BEGIN TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping extended properties'
GO
BEGIN TRY
	EXEC sp_dropextendedproperty N'MS_Description', 'SCHEMA', N'__mj', 'TABLE', N'Library', 'COLUMN', N'ExportedItems'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
PRINT N'Dropping foreign keys from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [FK_RecordChange_Entity]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [FK_RecordChange_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [FK_RecordChange_User]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [CK_RecordChange_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] DROP CONSTRAINT [DF__ActionCat__Creat__6F8EA2C0]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] DROP CONSTRAINT [DF__ActionCat__Updat__7082C6F9]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionFilter]'
GO
ALTER TABLE [__mj].[ActionFilter] DROP CONSTRAINT [DF__ActionFil__Creat__1A7900C5]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionFilter]'
GO
ALTER TABLE [__mj].[ActionFilter] DROP CONSTRAINT [DF__ActionFil__Updat__1B6D24FE]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] DROP CONSTRAINT [DF__Action__CreatedA__7823E8C1]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] DROP CONSTRAINT [DF__Action__UpdatedA__79180CFA]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] DROP CONSTRAINT [DF_ApplicationEntity_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] DROP CONSTRAINT [DF_ApplicationEntity_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] DROP CONSTRAINT [DF_ApplicationSetting_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] DROP CONSTRAINT [DF_ApplicationSetting_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] DROP CONSTRAINT [DF_Application_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] DROP CONSTRAINT [DF_Application_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] DROP CONSTRAINT [DF_AuditType_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] DROP CONSTRAINT [DF_AuditType_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] DROP CONSTRAINT [DF_Authorization_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] DROP CONSTRAINT [DF_Authorization_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] DROP CONSTRAINT [DF_Company_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] DROP CONSTRAINT [DF_Company_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeRole]'
GO
ALTER TABLE [__mj].[EmployeeRole] DROP CONSTRAINT [DF_EmployeeRole_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeRole]'
GO
ALTER TABLE [__mj].[EmployeeRole] DROP CONSTRAINT [DF_EmployeeRole_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] DROP CONSTRAINT [DF_EmployeeSkill_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] DROP CONSTRAINT [DF_EmployeeSkill_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] DROP CONSTRAINT [DF_Employee_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] DROP CONSTRAINT [DF_Employee_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] DROP CONSTRAINT [DF__EntityAct__Creat__27D2FBE3]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] DROP CONSTRAINT [DF__EntityAct__Updat__28C7201C]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionInvocationType]'
GO
ALTER TABLE [__mj].[EntityActionInvocationType] DROP CONSTRAINT [DF__EntityAct__Creat__2D8BD539]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionInvocationType]'
GO
ALTER TABLE [__mj].[EntityActionInvocationType] DROP CONSTRAINT [DF__EntityAct__Updat__2E7FF972]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] DROP CONSTRAINT [DF__EntityAct__Creat__3344AE8F]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] DROP CONSTRAINT [DF__EntityAct__Updat__3438D2C8]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] DROP CONSTRAINT [DF__EntityAct__Creat__2031DA1B]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] DROP CONSTRAINT [DF__EntityAct__Updat__2125FE54]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityBehaviorType]'
GO
ALTER TABLE [__mj].[EntityBehaviorType] DROP CONSTRAINT [DF_EntityBehaviorType_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityBehaviorType]'
GO
ALTER TABLE [__mj].[EntityBehaviorType] DROP CONSTRAINT [DF_EntityBehaviorType_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityBehavior]'
GO
ALTER TABLE [__mj].[EntityBehavior] DROP CONSTRAINT [DF_EntityBehavior_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityBehavior]'
GO
ALTER TABLE [__mj].[EntityBehavior] DROP CONSTRAINT [DF_EntityBehavior_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityCommunicationField]'
GO
ALTER TABLE [__mj].[EntityCommunicationField] DROP CONSTRAINT [DF__EntityCom__Creat__57F1B2BA]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityCommunicationField]'
GO
ALTER TABLE [__mj].[EntityCommunicationField] DROP CONSTRAINT [DF__EntityCom__Updat__58E5D6F3]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityCommunicationMessageType]'
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] DROP CONSTRAINT [DF__EntityCom__Creat__3799F1C1]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityCommunicationMessageType]'
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] DROP CONSTRAINT [DF__EntityCom__Updat__388E15FA]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] DROP CONSTRAINT [DF_EntityDocumentRun_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] DROP CONSTRAINT [DF_EntityDocumentRun_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentSetting]'
GO
ALTER TABLE [__mj].[EntityDocumentSetting] DROP CONSTRAINT [DF_EntityDocumentSetting_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentSetting]'
GO
ALTER TABLE [__mj].[EntityDocumentSetting] DROP CONSTRAINT [DF_EntityDocumentSetting_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentType]'
GO
ALTER TABLE [__mj].[EntityDocumentType] DROP CONSTRAINT [DF_EntityDocumentType_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocumentType]'
GO
ALTER TABLE [__mj].[EntityDocumentType] DROP CONSTRAINT [DF_EntityDocumentType_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] DROP CONSTRAINT [DF_EntityFieldValue_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] DROP CONSTRAINT [DF_EntityFieldValue_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] DROP CONSTRAINT [DF_EntityField_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] DROP CONSTRAINT [DF_EntityField_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityPermission]'
GO
ALTER TABLE [__mj].[EntityPermission] DROP CONSTRAINT [DF_EntityPermission_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityPermission]'
GO
ALTER TABLE [__mj].[EntityPermission] DROP CONSTRAINT [DF_EntityPermission_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [DF_EntityRecordDocument_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [DF_EntityRecordDocument_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] DROP CONSTRAINT [DF_EntityRelationship_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] DROP CONSTRAINT [DF_EntityRelationship_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] DROP CONSTRAINT [DF_EntitySetting_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] DROP CONSTRAINT [DF_EntitySetting_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] DROP CONSTRAINT [DF_Entity_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] DROP CONSTRAINT [DF_Entity_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] DROP CONSTRAINT [DF__Library__Created__75F252E3]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] DROP CONSTRAINT [DF__Library__Updated__76E6771C]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] DROP CONSTRAINT [DF_QueryCategory_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] DROP CONSTRAINT [DF_QueryCategory_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryField]'
GO
ALTER TABLE [__mj].[QueryField] DROP CONSTRAINT [DF_QueryField_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryField]'
GO
ALTER TABLE [__mj].[QueryField] DROP CONSTRAINT [DF_QueryField_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryPermission]'
GO
ALTER TABLE [__mj].[QueryPermission] DROP CONSTRAINT [DF_QueryPermission_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[QueryPermission]'
GO
ALTER TABLE [__mj].[QueryPermission] DROP CONSTRAINT [DF_QueryPermission_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] DROP CONSTRAINT [DF_Quey_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] DROP CONSTRAINT [DF_Quey_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [DF_RecordChange_ChangedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [DF_RecordChange_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [DF_RecordChange_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] DROP CONSTRAINT [DF_ResourceType_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] DROP CONSTRAINT [DF_ResourceType_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] DROP CONSTRAINT [DF_Role_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] DROP CONSTRAINT [DF_Role_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RowLevelSecurityFilter]'
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] DROP CONSTRAINT [DF_RowLevelSecurityFilter_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RowLevelSecurityFilter]'
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] DROP CONSTRAINT [DF_RowLevelSecurityFilter_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserRole]'
GO
ALTER TABLE [__mj].[UserRole] DROP CONSTRAINT [DF_UserRole_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserRole]'
GO
ALTER TABLE [__mj].[UserRole] DROP CONSTRAINT [DF_UserRole_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserView]'
GO
ALTER TABLE [__mj].[UserView] DROP CONSTRAINT [DF_UserView_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserView]'
GO
ALTER TABLE [__mj].[UserView] DROP CONSTRAINT [DF_UserView_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[User]'
GO
ALTER TABLE [__mj].[User] DROP CONSTRAINT [DF_User_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[User]'
GO
ALTER TABLE [__mj].[User] DROP CONSTRAINT [DF_User_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateAIAction] from [__mj].[AIAction]'
GO
DROP TRIGGER [__mj].[trgUpdateAIAction]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateAIModelAction] from [__mj].[AIModelAction]'
GO
DROP TRIGGER [__mj].[trgUpdateAIModelAction]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateAIModel] from [__mj].[AIModel]'
GO
DROP TRIGGER [__mj].[trgUpdateAIModel]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionAuthorization] from [__mj].[ActionAuthorization]'
GO
DROP TRIGGER [__mj].[trgUpdateActionAuthorization]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionContextType] from [__mj].[ActionContextType]'
GO
DROP TRIGGER [__mj].[trgUpdateActionContextType]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionContext] from [__mj].[ActionContext]'
GO
DROP TRIGGER [__mj].[trgUpdateActionContext]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionExecutionLog] from [__mj].[ActionExecutionLog]'
GO
DROP TRIGGER [__mj].[trgUpdateActionExecutionLog]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionLibrary] from [__mj].[ActionLibrary]'
GO
DROP TRIGGER [__mj].[trgUpdateActionLibrary]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionParam] from [__mj].[ActionParam]'
GO
DROP TRIGGER [__mj].[trgUpdateActionParam]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateActionResultCode] from [__mj].[ActionResultCode]'
GO
DROP TRIGGER [__mj].[trgUpdateActionResultCode]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateAuditLog] from [__mj].[AuditLog]'
GO
DROP TRIGGER [__mj].[trgUpdateAuditLog]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCommunicationBaseMessageType] from [__mj].[CommunicationBaseMessageType]'
GO
DROP TRIGGER [__mj].[trgUpdateCommunicationBaseMessageType]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCommunicationLog] from [__mj].[CommunicationLog]'
GO
DROP TRIGGER [__mj].[trgUpdateCommunicationLog]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCommunicationProviderMessageType] from [__mj].[CommunicationProviderMessageType]'
GO
DROP TRIGGER [__mj].[trgUpdateCommunicationProviderMessageType]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCommunicationProvider] from [__mj].[CommunicationProvider]'
GO
DROP TRIGGER [__mj].[trgUpdateCommunicationProvider]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCommunicationRun] from [__mj].[CommunicationRun]'
GO
DROP TRIGGER [__mj].[trgUpdateCommunicationRun]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCompanyIntegrationRecordMap] from [__mj].[CompanyIntegrationRecordMap]'
GO
DROP TRIGGER [__mj].[trgUpdateCompanyIntegrationRecordMap]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateCompanyIntegration] from [__mj].[CompanyIntegration]'
GO
DROP TRIGGER [__mj].[trgUpdateCompanyIntegration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateConversationDetail] from [__mj].[ConversationDetail]'
GO
DROP TRIGGER [__mj].[trgUpdateConversationDetail]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateConversation] from [__mj].[Conversation]'
GO
DROP TRIGGER [__mj].[trgUpdateConversation]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDashboardCategory] from [__mj].[DashboardCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateDashboardCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDataContextItem] from [__mj].[DataContextItem]'
GO
DROP TRIGGER [__mj].[trgUpdateDataContextItem]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDataContext] from [__mj].[DataContext]'
GO
DROP TRIGGER [__mj].[trgUpdateDataContext]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDuplicateRunDetailMatch] from [__mj].[DuplicateRunDetailMatch]'
GO
DROP TRIGGER [__mj].[trgUpdateDuplicateRunDetailMatch]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDuplicateRunDetail] from [__mj].[DuplicateRunDetail]'
GO
DROP TRIGGER [__mj].[trgUpdateDuplicateRunDetail]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateDuplicateRun] from [__mj].[DuplicateRun]'
GO
DROP TRIGGER [__mj].[trgUpdateDuplicateRun]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateEmployeeCompanyIntegration] from [__mj].[EmployeeCompanyIntegration]'
GO
DROP TRIGGER [__mj].[trgUpdateEmployeeCompanyIntegration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateFileCategory] from [__mj].[FileCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateFileCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateFileEntityRecordLink] from [__mj].[FileEntityRecordLink]'
GO
DROP TRIGGER [__mj].[trgUpdateFileEntityRecordLink]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateFileStorageProvider] from [__mj].[FileStorageProvider]'
GO
DROP TRIGGER [__mj].[trgUpdateFileStorageProvider]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateFile] from [__mj].[File]'
GO
DROP TRIGGER [__mj].[trgUpdateFile]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateIntegration] from [__mj].[Integration]'
GO
DROP TRIGGER [__mj].[trgUpdateIntegration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateListCategory] from [__mj].[ListCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateListCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateList] from [__mj].[List]'
GO
DROP TRIGGER [__mj].[trgUpdateList]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateQueue] from [__mj].[Queue]'
GO
DROP TRIGGER [__mj].[trgUpdateQueue]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecommendationItem] from [__mj].[RecommendationItem]'
GO
DROP TRIGGER [__mj].[trgUpdateRecommendationItem]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecommendationProvider] from [__mj].[RecommendationProvider]'
GO
DROP TRIGGER [__mj].[trgUpdateRecommendationProvider]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecommendationRun] from [__mj].[RecommendationRun]'
GO
DROP TRIGGER [__mj].[trgUpdateRecommendationRun]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecommendation] from [__mj].[Recommendation]'
GO
DROP TRIGGER [__mj].[trgUpdateRecommendation]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecordMergeDeletionLog] from [__mj].[RecordMergeDeletionLog]'
GO
DROP TRIGGER [__mj].[trgUpdateRecordMergeDeletionLog]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateRecordMergeLog] from [__mj].[RecordMergeLog]'
GO
DROP TRIGGER [__mj].[trgUpdateRecordMergeLog]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateReportCategory] from [__mj].[ReportCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateReportCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateReport] from [__mj].[Report]'
GO
DROP TRIGGER [__mj].[trgUpdateReport]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateSchemaInfo] from [__mj].[SchemaInfo]'
GO
DROP TRIGGER [__mj].[trgUpdateSchemaInfo]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateTemplateCategory] from [__mj].[TemplateCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateTemplateCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateTemplateContentType] from [__mj].[TemplateContentType]'
GO
DROP TRIGGER [__mj].[trgUpdateTemplateContentType]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateTemplateContent] from [__mj].[TemplateContent]'
GO
DROP TRIGGER [__mj].[trgUpdateTemplateContent]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateTemplateParam] from [__mj].[TemplateParam]'
GO
DROP TRIGGER [__mj].[trgUpdateTemplateParam]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateTemplate] from [__mj].[Template]'
GO
DROP TRIGGER [__mj].[trgUpdateTemplate]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateUserFavorite] from [__mj].[UserFavorite]'
GO
DROP TRIGGER [__mj].[trgUpdateUserFavorite]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateUserNotification] from [__mj].[UserNotification]'
GO
DROP TRIGGER [__mj].[trgUpdateUserNotification]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateUserViewCategory] from [__mj].[UserViewCategory]'
GO
DROP TRIGGER [__mj].[trgUpdateUserViewCategory]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateVectorDatabase] from [__mj].[VectorDatabase]'
GO
DROP TRIGGER [__mj].[trgUpdateVectorDatabase]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateVectorIndex] from [__mj].[VectorIndex]'
GO
DROP TRIGGER [__mj].[trgUpdateVectorIndex]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateVersionInstallation] from [__mj].[VersionInstallation]'
GO
DROP TRIGGER [__mj].[trgUpdateVersionInstallation]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateWorkflowEngine] from [__mj].[WorkflowEngine]'
GO
DROP TRIGGER [__mj].[trgUpdateWorkflowEngine]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateWorkflow] from [__mj].[Workflow]'
GO
DROP TRIGGER [__mj].[trgUpdateWorkflow]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateWorkspaceItem] from [__mj].[WorkspaceItem]'
GO
DROP TRIGGER [__mj].[trgUpdateWorkspaceItem]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping trigger [__mj].[trgUpdateWorkspace] from [__mj].[Workspace]'
GO
DROP TRIGGER [__mj].[trgUpdateWorkspace]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionFilter]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionFilter] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionFilter___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionFilter] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityBehaviorType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityBehaviorType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityBehaviorType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityBehaviorType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityBehaviorType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionCategory___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionCategory___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[QueryCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryCategory___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryCategory___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Company]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Company] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Company___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Company___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Company] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Entity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityRelationship]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRelationship] ADD
[DisplayLocation] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayLocation] DEFAULT (N'After Field Tabs'),
[DisplayIconType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayIconType] DEFAULT (N'Related Entity Icon'),
[DisplayIcon] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayComponentID] [int] NULL,
[DisplayComponentConfiguration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRelationship___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRelationship___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRelationship] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ApplicationEntity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationEntity___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationEntity___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ApplicationEntity] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntitySetting]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntitySetting] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntitySetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntitySetting___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntitySetting] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityDocumentType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Role]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Role] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Role___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Role___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Role] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityAction]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityAction] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAction___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAction___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityAction] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ApplicationSetting]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ApplicationSetting] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationSetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationSetting___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ApplicationSetting] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EmployeeSkill]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeSkill___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeSkill___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeSkill] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityBehavior]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityBehavior] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityBehavior___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityBehavior___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityBehavior] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Employee]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Employee] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Employee___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Employee___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Employee] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityActionFilter]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionFilter___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionFilter] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityDocumentSetting]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentSetting] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentSetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentSetting___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentSetting] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityActionInvocation]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocation___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocation___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionInvocation] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Library]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Library] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Library___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Library___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Library] DROP
COLUMN [ExportedItems],
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityPermission]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityPermission] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityPermission___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityPermission___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityPermission] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityRecordDocument]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRecordDocument___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRecordDocument___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityFieldValue]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityFieldValue___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityFieldValue___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityFieldValue] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityFieldValue] on [__mj].[EntityFieldValue]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityFieldValue]
ON [__mj].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityFieldValue]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityFieldValue] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityField]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD
[RelatedEntityDisplayType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityField_RelatedEntityDisplayType] DEFAULT (N'Search'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityField___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Query]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Query] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Query___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Query___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Query] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityAIAction]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityAIAction] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAIAction___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAIAction___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityAIAction] on [__mj].[EntityAIAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityAIAction]
ON [__mj].[EntityAIAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAIAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityAIAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[QueryField]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryField] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryField___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryField] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[UserView]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserView] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserView___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserView___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserView] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[User]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[User] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_User___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_User___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[User] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityDocument]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocument] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocument___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocument___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocument] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityActionInvocationType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionInvocationType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocationType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocationType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityActionInvocationType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Application]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Application] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Application___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Application___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Application] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRelationshipDisplayComponent]'
GO
CREATE TABLE [__mj].[EntityRelationshipDisplayComponent]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelationshipType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityRel____mj___7282B1D3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityRel____mj___7376D60C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityRe__3214EC273B55B0C9] on [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [PK__EntityRe__3214EC273B55B0C9] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [UQ__EntityRe__737584F667950678] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRelationshipDisplayComponent] on [__mj].[EntityRelationshipDisplayComponent]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityRelationshipDisplayComponent]
ON [__mj].[EntityRelationshipDisplayComponent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationshipDisplayComponent]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRelationshipDisplayComponent] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Action]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Action___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Action___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityCommunicationField]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityCommunicationField] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationField___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityCommunicationField] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EmployeeRole]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeRole] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeRole___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeRole___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeRole] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[QueryPermission]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryPermission] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryPermission___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryPermission___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueryPermission] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityCommunicationMessageType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationMessageType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationMessageType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityDocumentRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentRun___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentRun___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocumentRun] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[LibraryItem]'
GO
CREATE TABLE [__mj].[LibraryItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[LibraryID] [int] NOT NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__LibraryIt__Creat__4358EA8C] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__LibraryIt__Updat__444D0EC5] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__LibraryI__3214EC274AA39B3B] on [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [PK__LibraryI__3214EC274AA39B3B] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordChangeReplayRun]'
GO
CREATE TABLE [__mj].[RecordChangeReplayRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[StartedAt] [datetime] NOT NULL,
[EndedAt] [datetime] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__RecordCha__Creat__3375F1D0] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__RecordCha__Updat__346A1609] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__RecordCh__3214EC272631A03D] on [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [PK__RecordCh__3214EC272631A03D] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ResourceType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ResourceType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ResourceType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ResourceType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ResourceType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Authorization]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Authorization] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Authorization___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Authorization___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Authorization] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[AuditLogType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuditLogType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_AuditLogType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_AuditLogType___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuditLogType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RowLevelSecurityFilter]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RowLevelSecurityFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RowLevelSecurityFilter___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecordChange]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD
[ReplayRunID] [int] NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [Source] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [ChangedAt] [datetimeoffset] NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [CreatedAt] [datetimeoffset] NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [UpdatedAt] [datetimeoffset] NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [DF_RecordChange_Source] DEFAULT (N'Internal') FOR [Source]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [DF___mj_RecordChange_ChangedAt] DEFAULT (getutcdate()) FOR [ChangedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [DF___mj_RecordChange_CreatedAt] DEFAULT (getutcdate()) FOR [CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [DF___mj_RecordChange_UpdatedAt] DEFAULT (getutcdate()) FOR [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecordChange]'
GO
UPDATE [__mj].[RecordChange] SET [Source]=DEFAULT WHERE [Source] IS NULL
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [Source] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[UserRole]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserRole] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserRole___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserRole___mj_UpdatedAt] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserRole] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecordChangeReplayRuns]'
GO


CREATE VIEW [__mj].[vwRecordChangeReplayRuns]
AS
SELECT 
    r.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[RecordChangeReplayRun] AS r
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChangeReplayRun]'
GO
----------------Refresh Views to fix errors tied to field additions/removals for Record Change functionality
DECLARE @sql NVARCHAR(MAX) = N'';

-- Generate the ALTER VIEW statements for each view in the database
SELECT @sql += 'EXEC sp_refreshview ''' + QUOTENAME(s.name) + '.' + QUOTENAME(v.name) + ''';' + CHAR(13)
FROM sys.views v
JOIN sys.schemas s ON v.schema_id = s.schema_id
AND s.name = '__mj';


-- Execute the generated SQL to refresh all views
EXEC sp_executesql @sql
GO

----------------

CREATE PROCEDURE [__mj].[spCreateRecordChangeReplayRun]
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(50),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[RecordChangeReplayRun]
        (
            [StartedAt],
            [EndedAt],
            [Status],
            [UserID]
        )
    VALUES
        (
            @StartedAt,
            @EndedAt,
            @Status,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordChangeReplayRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spSetDefaultColumnWidthWhereNeeded]'
GO

ALTER PROC [__mj].[spSetDefaultColumnWidthWhereNeeded]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
/**************************************************************************************/
/* Generate default column widths for columns that don't have a width set*/
/**************************************************************************************/

UPDATE
	ef 
SET 
	DefaultColumnWidth =  
	IIF(ef.Type = 'int', 50, 
		IIF(ef.Type = 'datetimeoffset', 100,
			IIF(ef.Type = 'money', 100, 
				IIF(ef.Type ='nchar', 75,
					150)))
		), 
	__mj_UpdatedAt = GETUTCDATE()
FROM 
	__mj.EntityField ef
INNER JOIN
	__mj.Entity e
ON
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    ef.DefaultColumnWidth IS NULL AND
	excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwLibraryItems]'
GO


CREATE VIEW [__mj].[vwLibraryItems]
AS
SELECT 
    l.*,
    Library_LibraryID.[Name] AS [Library]
FROM
    [__mj].[LibraryItem] AS l
INNER JOIN
    [__mj].[Library] AS Library_LibraryID
  ON
    [l].[LibraryID] = Library_LibraryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateLibraryItem]'
GO


CREATE PROCEDURE [__mj].[spCreateLibraryItem]
    @Name nvarchar(255),
    @LibraryID int,
    @Type nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[LibraryItem]
        (
            [Name],
            [LibraryID],
            [Type]
        )
    VALUES
        (
            @Name,
            @LibraryID,
            @Type
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLibraryItems] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateActionCategory]'
GO


ALTER PROCEDURE [__mj].[spCreateActionCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [Status],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @Status,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityRelationshipDisplayComponents]'
GO


CREATE VIEW [__mj].[vwEntityRelationshipDisplayComponents]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityRelationshipDisplayComponent] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityRelationshipDisplayComponent]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRelationshipDisplayComponent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @RelationshipType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityRelationshipDisplayComponent]
        (
            [Name],
            [Description],
            [RelationshipType]
        )
    VALUES
        (
            @Name,
            @Description,
            @RelationshipType
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationshipDisplayComponents] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordChangeReplayRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordChangeReplayRun]
    @ID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(50),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChangeReplayRun]
    SET 
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordChangeReplayRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityFieldValue]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityFieldValue]
    @ID int,
    @EntityID int,
    @EntityFieldName nvarchar(255),
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityFieldValue]
    SET 
        [EntityID] = @EntityID,
        [EntityFieldName] = @EntityFieldName,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityFieldValues] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateLibraryItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateLibraryItem]
    @ID int,
    @Name nvarchar(255),
    @LibraryID int,
    @Type nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[LibraryItem]
    SET 
        [Name] = @Name,
        [LibraryID] = @LibraryID,
        [Type] = @Type
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLibraryItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityRelationshipDisplayComponent]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRelationshipDisplayComponent]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @RelationshipType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationshipDisplayComponent]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [RelationshipType] = @RelationshipType
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationshipDisplayComponents] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[vwEntitiesWithExternalChangeTracking]'
GO

ALTER VIEW [__mj].[vwEntitiesWithExternalChangeTracking] 
AS
SELECT   
  e.* 
FROM 
  __mj.vwEntities e
WHERE
  e.TrackRecordChanges=1
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_UpdatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_CreatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntityRelationship]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityRelationship]
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayUserViewGUID uniqueidentifier,
    @DisplayComponentID int,
    @DisplayComponentConfiguration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityRelationship]
        (
            [EntityID],
            [Sequence],
            [RelatedEntityID],
            [BundleInAPI],
            [IncludeInParentAllQuery],
            [Type],
            [EntityKeyField],
            [RelatedEntityJoinField],
            [JoinView],
            [JoinEntityJoinField],
            [JoinEntityInverseJoinField],
            [DisplayInForm],
            [DisplayLocation],
            [DisplayName],
            [DisplayIconType],
            [DisplayIcon],
            [DisplayComponentID],
            [DisplayComponentConfiguration]
        )
    VALUES
        (
            @EntityID,
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayLocation,
            @DisplayName,
            @DisplayIconType,
            @DisplayIcon,
            @DisplayComponentID,
            @DisplayComponentConfiguration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationships] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spDeleteCommunicationProviderMessageType]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[CommunicationProviderMessageType]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntityField]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID int,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityField]
        (
            [DisplayName],
            [Description],
            [AutoUpdateDescription],
            [IsPrimaryKey],
            [IsUnique],
            [Category],
            [ValueListType],
            [ExtendedType],
            [CodeType],
            [DefaultInView],
            [ViewCellTemplate],
            [DefaultColumnWidth],
            [AllowUpdateAPI],
            [AllowUpdateInView],
            [IncludeInUserSearchAPI],
            [FullTextSearchEnabled],
            [UserSearchParamFormatAPI],
            [IncludeInGeneratedForm],
            [GeneratedFormSection],
            [IsNameField],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IncludeRelatedEntityNameFieldInBaseView],
            [RelatedEntityNameFieldMap],
            [RelatedEntityDisplayType]
        )
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @CodeType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityRelationship]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityRelationship]
    @ID int,
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayUserViewGUID uniqueidentifier,
    @DisplayComponentID int,
    @DisplayComponentConfiguration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationships] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityField]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityField]
    @ID int,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID int,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChange_Internal]'
GO

CREATE PROCEDURE [__mj].[spCreateRecordChange_Internal]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(750),
	  @UserID int,
    @Type nvarchar(20),
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			      UserID,
            Type,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			      @UserID,
            @Type,
            GETUTCDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateLibrary]'
GO


ALTER PROCEDURE [__mj].[spCreateLibrary]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Library]
        (
            [Name],
            [Description],
            [Status],
            [TypeDefinitions],
            [SampleCode]
        )
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @TypeDefinitions,
            @SampleCode
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLibraries] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateAction]'
GO


ALTER PROCEDURE [__mj].[spCreateAction]
    @CategoryID int,
    @Name nvarchar(425),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Action]
        (
            [CategoryID],
            [Name],
            [UserPrompt],
            [UserComments],
            [Code],
            [CodeComments],
            [CodeApprovalStatus],
            [CodeApprovalComments],
            [CodeApprovedByUserID],
            [CodeApprovedAt],
            [ForceCodeGeneration],
            [RetentionPeriod],
            [Status],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    VALUES
        (
            @CategoryID,
            @Name,
            @UserPrompt,
            @UserComments,
            @Code,
            @CodeComments,
            @CodeApprovalStatus,
            @CodeApprovalComments,
            @CodeApprovedByUserID,
            @CodeApprovedAt,
            @ForceCodeGeneration,
            @RetentionPeriod,
            @Status,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateActionFilter]'
GO


ALTER PROCEDURE [__mj].[spCreateActionFilter]
    @UserDescription nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionFilter]
        (
            [UserDescription],
            [UserComments],
            [Code],
            [CodeExplanation],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    VALUES
        (
            @UserDescription,
            @UserComments,
            @Code,
            @CodeExplanation,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionFilters] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateRecordChange]'
GO


ALTER PROCEDURE [__mj].[spCreateRecordChange]
    @EntityID int,
    @RecordID nvarchar(750),
    @UserID int,
    @Type nvarchar(20),
    @Source nvarchar(20),
    @IntegrationID int,
    @ChangedAt datetimeoffset,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50),
    @ReplayRunID int,
    @ErrorLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[RecordChange]
        (
            [EntityID],
            [RecordID],
            [UserID],
            [Type],
            [Source],
            [IntegrationID],
            [ChangedAt],
            [ChangesJSON],
            [ChangesDescription],
            [FullRecordJSON],
            [Status],
            [ReplayRunID],
            [ErrorLog],
            [Comments]
        )
    VALUES
        (
            @EntityID,
            @RecordID,
            @UserID,
            @Type,
            @Source,
            @IntegrationID,
            @ChangedAt,
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @ReplayRunID,
            @ErrorLog,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordChanges] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateLibrary]'
GO


ALTER PROCEDURE [__mj].[spUpdateLibrary]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [TypeDefinitions] = @TypeDefinitions,
        [SampleCode] = @SampleCode
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLibraries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordChange]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordChange]
    @ID int,
    @EntityID int,
    @RecordID nvarchar(750),
    @UserID int,
    @Type nvarchar(20),
    @Source nvarchar(20),
    @IntegrationID int,
    @ChangedAt datetimeoffset,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50),
    @ReplayRunID int,
    @ErrorLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChange]
    SET 
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UserID] = @UserID,
        [Type] = @Type,
        [Source] = @Source,
        [IntegrationID] = @IntegrationID,
        [ChangedAt] = @ChangedAt,
        [ChangesJSON] = @ChangesJSON,
        [ChangesDescription] = @ChangesDescription,
        [FullRecordJSON] = @FullRecordJSON,
        [Status] = @Status,
        [ReplayRunID] = @ReplayRunID,
        [ErrorLog] = @ErrorLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordChanges] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spDeleteUnneededEntityFields]'
GO

ALTER PROC [__mj].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX)

AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT 
	ef.* 
INTO 
	#ef_spDeleteUnneededEntityFields 
FROM 
	vwEntityFields ef
INNER JOIN
	vwEntities e
ON 
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded


SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE __mj.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
	SELECT 
	  ef.EntityID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- now delete the entity fields themsevles
DELETE FROM __mj.EntityField WHERE ID IN
(
	SELECT 
	  ef.ID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateCompany]'
GO


ALTER PROCEDURE [__mj].[spCreateCompany]
    @Name nvarchar(50),
    @Description nvarchar(200),
    @Website nvarchar(100),
    @LogoURL nvarchar(500),
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Company]
        (
            [Name],
            [Description],
            [Website],
            [LogoURL],
            [Domain],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    VALUES
        (
            @Name,
            @Description,
            @Website,
            @LogoURL,
            @Domain,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCompanies] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateExistingEntityFieldsFromSchema]'
GO

ALTER PROC [__mj].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Update Statement
    UPDATE [__mj].EntityField
    SET
		Description = IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.Description), ef.Description),
        Type = fromSQL.Type,
        Length = fromSQL.Length,
        Precision = fromSQL.Precision,
        Scale = fromSQL.Scale,
        AllowsNull = fromSQL.AllowsNull,
        DefaultValue = fromSQL.DefaultValue,
        AutoIncrement = fromSQL.AutoIncrement,
        IsVirtual = fromSQL.IsVirtual,
        Sequence = fromSQL.Sequence,
        RelatedEntityID = re.ID,
        RelatedEntityFieldName = fk.referenced_column,
        IsPrimaryKey =	CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 0 
						END,
        IsUnique =		CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 
								CASE 
									WHEN uk.ColumnName IS NOT NULL THEN 1 
									ELSE 0 
								END 
						END,
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [__mj].Entity e 
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table] AND
		e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN 
        [__mj].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table AND
		re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN 
		[__mj].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN 
		[__mj].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
    -- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        e.SchemaName = excludedSchemas.value
	WHERE
		fromSQL.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
		AND
        excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateApplication]'
GO


ALTER PROCEDURE [__mj].[spCreateApplication]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Application]
        (
            [Name],
            [Description],
            [Icon],
            [DefaultForNewUser],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    VALUES
        (
            @Name,
            @Description,
            @Icon,
            @DefaultForNewUser,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns]'
GO

CREATE PROCEDURE [__mj].[CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns]
    @SchemaName NVARCHAR(255),
    @TableName NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sql NVARCHAR(MAX);
    DECLARE @constraintName NVARCHAR(255);

    BEGIN TRY
        -- Construct the SQL command for updating the columns
        SET @sql = 'UPDATE [' + @SchemaName + '].[' + @TableName + '] SET __mj_CreatedAt = CreatedAt, __mj_UpdatedAt = UpdatedAt;';
        EXEC sp_executesql @sql;

        -- Drop default constraint on CreatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'CreatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Drop default constraint on UpdatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'UpdatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Construct the SQL command for dropping the old columns
        SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP COLUMN CreatedAt, UpdatedAt;';
        EXEC sp_executesql @sql;

        PRINT 'Finished Updating ' + @SchemaName + '.' + @TableName + ' below is the new data for that table'

        SET @sql = 'SELECT * FROM [' + @SchemaName + '].[' + @TableName + '];';
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        -- Error handling
        DECLARE @ErrorMessage NVARCHAR(4000);
        DECLARE @ErrorSeverity INT;
        DECLARE @ErrorState INT;

        SELECT 
            @ErrorMessage = ERROR_MESSAGE(),
            @ErrorSeverity = ERROR_SEVERITY(),
            @ErrorState = ERROR_STATE();

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [CHK_EntityRelationshipDisplayComponent_RelationshipType] CHECK (([RelationshipType]='Both' OR [RelationshipType]='Many to Many' OR [RelationshipType]='One to Many'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayLocation] CHECK (([DisplayLocation]='Before Field Tabs' OR [DisplayLocation]='After Field Tabs'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayIconType] CHECK (([DisplayIconType]='None' OR [DisplayIconType]='Custom' OR [DisplayIconType]='Related Entity Icon'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [CK__LibraryIte__Type__4264C653] CHECK (([Type]='Function' OR [Type]='Variable' OR [Type]='Module' OR [Type]='Type' OR [Type]='Interface' OR [Type]='Class'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [CK__RecordCha__Statu__3281CD97] CHECK (([Status]='Error' OR [Status]='Complete' OR [Status]='In Progress' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CHK_RecordChange_Source] CHECK (([Source]='External' OR [Source]='Internal'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CHK_RecordChange_Type] CHECK (([Type]='Delete' OR [Type]='Update' OR [Type]='Create'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CK_RecordChange_Status] CHECK (([Status]='Error' OR [Status]='Complete' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_EntityRelationshipDisplayComponent] FOREIGN KEY ([DisplayComponentID]) REFERENCES [__mj].[EntityRelationshipDisplayComponent] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [FK__LibraryIt__Libra__454132FE] FOREIGN KEY ([LibraryID]) REFERENCES [__mj].[Library] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [FK__RecordCha__UserI__355E3A42] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_EntityID] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_IntegrationID] FOREIGN KEY ([IntegrationID]) REFERENCES [__mj].[Integration] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_ReplayRunID] FOREIGN KEY ([ReplayRunID]) REFERENCES [__mj].[RecordChangeReplayRun] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_UserID] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionCategory] on [__mj].[ActionCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionCategory]
ON [__mj].[ActionCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionFilter] on [__mj].[ActionFilter]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionFilter]
ON [__mj].[ActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionFilter]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateAction] on [__mj].[Action]'
GO

ALTER TRIGGER [__mj].[trgUpdateAction]
ON [__mj].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Action] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateApplicationEntity] on [__mj].[ApplicationEntity]'
GO

ALTER TRIGGER [__mj].[trgUpdateApplicationEntity]
ON [__mj].[ApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ApplicationEntity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateApplicationSetting] on [__mj].[ApplicationSetting]'
GO

ALTER TRIGGER [__mj].[trgUpdateApplicationSetting]
ON [__mj].[ApplicationSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ApplicationSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateApplication] on [__mj].[Application]'
GO

ALTER TRIGGER [__mj].[trgUpdateApplication]
ON [__mj].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Application] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCompany] on [__mj].[Company]'
GO

ALTER TRIGGER [__mj].[trgUpdateCompany]
ON [__mj].[Company]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Company]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Company] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEmployeeRole] on [__mj].[EmployeeRole]'
GO

ALTER TRIGGER [__mj].[trgUpdateEmployeeRole]
ON [__mj].[EmployeeRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeRole] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEmployeeSkill] on [__mj].[EmployeeSkill]'
GO

ALTER TRIGGER [__mj].[trgUpdateEmployeeSkill]
ON [__mj].[EmployeeSkill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeSkill] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEmployee] on [__mj].[Employee]'
GO

ALTER TRIGGER [__mj].[trgUpdateEmployee]
ON [__mj].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Employee] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityActionFilter] on [__mj].[EntityActionFilter]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityActionFilter]
ON [__mj].[EntityActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionFilter]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityActionInvocationType] on [__mj].[EntityActionInvocationType]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityActionInvocationType]
ON [__mj].[EntityActionInvocationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocationType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionInvocationType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityActionInvocation] on [__mj].[EntityActionInvocation]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityActionInvocation]
ON [__mj].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionInvocation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityAction] on [__mj].[EntityAction]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityAction]
ON [__mj].[EntityAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityBehaviorType] on [__mj].[EntityBehaviorType]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityBehaviorType]
ON [__mj].[EntityBehaviorType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehaviorType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityBehaviorType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityBehavior] on [__mj].[EntityBehavior]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityBehavior]
ON [__mj].[EntityBehavior]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehavior]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityBehavior] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityCommunicationField] on [__mj].[EntityCommunicationField]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityCommunicationField]
ON [__mj].[EntityCommunicationField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityCommunicationField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityCommunicationMessageType] on [__mj].[EntityCommunicationMessageType]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityCommunicationMessageType]
ON [__mj].[EntityCommunicationMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityCommunicationMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityDocumentRun] on [__mj].[EntityDocumentRun]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityDocumentRun]
ON [__mj].[EntityDocumentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityDocumentSetting] on [__mj].[EntityDocumentSetting]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityDocumentSetting]
ON [__mj].[EntityDocumentSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentSetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityDocumentType] on [__mj].[EntityDocumentType]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityDocumentType]
ON [__mj].[EntityDocumentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityDocument] on [__mj].[EntityDocument]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityDocument]
ON [__mj].[EntityDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityField] on [__mj].[EntityField]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityField]
ON [__mj].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityPermission] on [__mj].[EntityPermission]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityPermission]
ON [__mj].[EntityPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityRecordDocument] on [__mj].[EntityRecordDocument]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityRecordDocument]
ON [__mj].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRecordDocument]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRecordDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntityRelationship] on [__mj].[EntityRelationship]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntityRelationship]
ON [__mj].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRelationship] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntitySetting] on [__mj].[EntitySetting]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntitySetting]
ON [__mj].[EntitySetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntitySetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntitySetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEntity] on [__mj].[Entity]'
GO

ALTER TRIGGER [__mj].[trgUpdateEntity]
ON [__mj].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Entity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateLibrary] on [__mj].[Library]'
GO

ALTER TRIGGER [__mj].[trgUpdateLibrary]
ON [__mj].[Library]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Library] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateQueryCategory] on [__mj].[QueryCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateQueryCategory]
ON [__mj].[QueryCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateQueryField] on [__mj].[QueryField]'
GO

ALTER TRIGGER [__mj].[trgUpdateQueryField]
ON [__mj].[QueryField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateQueryPermission] on [__mj].[QueryPermission]'
GO

ALTER TRIGGER [__mj].[trgUpdateQueryPermission]
ON [__mj].[QueryPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateQuery] on [__mj].[Query]'
GO

ALTER TRIGGER [__mj].[trgUpdateQuery]
ON [__mj].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Query] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRole] on [__mj].[Role]'
GO

ALTER TRIGGER [__mj].[trgUpdateRole]
ON [__mj].[Role]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Role]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Role] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateUserView] on [__mj].[UserView]'
GO

ALTER TRIGGER [__mj].[trgUpdateUserView]
ON [__mj].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserView]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserView] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateUser] on [__mj].[User]'
GO

ALTER TRIGGER [__mj].[trgUpdateUser]
ON [__mj].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[User]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[User] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering extended properties'
GO
BEGIN TRY
	EXEC sp_updateextendedproperty N'MS_Description', N'When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'TrackRecordChanges'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
PRINT N'Creating extended properties'
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'RelatedEntityDisplayType'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'This table stores a list of components that are available for displaying relationships in the MJ Explorer UI', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationshipDisplayComponent', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationshipDisplayComponent', 'COLUMN', N'RelationshipType'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayComponentConfiguration'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If specified, this component will be used for displaying the relationship within the parent entity''s form', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayComponentID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If specified, the icon ', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayIcon'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayIconType'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When unchecked the relationship will NOT be displayed on the generated form', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayInForm'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, when specified this value overrides the related entity name for the label on the tab', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayName'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Table to store individual library items', 'SCHEMA', N'__mj', 'TABLE', N'LibraryItem', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Primary key of the LibraryItem table.', 'SCHEMA', N'__mj', 'TABLE', N'LibraryItem', 'COLUMN', N'ID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the library item for example Class, Interface, etc.', 'SCHEMA', N'__mj', 'TABLE', N'LibraryItem', 'COLUMN', N'Type'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Table to track the runs of replaying external record changes', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Timestamp when the replay run ended', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'EndedAt'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Timestamp when the replay run started', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'StartedAt'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Status of the replay run (Pending, In Progress, Complete, Error)', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'Status'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'For external changes only, this run ID is the link to the replay run that the change record was part of', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ReplayRunID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityRelationshipDisplayComponent]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationshipDisplayComponent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationshipDisplayComponent] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateLibraryItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateLibraryItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateLibraryItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordChangeReplayRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChangeReplayRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChangeReplayRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordChange_Internal]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteCommunicationProviderMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteCommunicationProviderMessageType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityRelationshipDisplayComponent]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationshipDisplayComponent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationshipDisplayComponent] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateLibraryItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibraryItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibraryItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordChangeReplayRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChangeReplayRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChangeReplayRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordChange]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChange] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntitiesWithExternalChangeTracking]'
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityRelationshipDisplayComponents]'
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwLibraryItems]'
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecordChangeReplayRuns]'
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
COMMIT TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
-- This statement writes to the SQL Server Log so SQL Monitor can show this deployment.
IF HAS_PERMS_BY_NAME(N'sys.xp_logevent', N'OBJECT', N'EXECUTE') = 1
BEGIN
    DECLARE @databaseName AS nvarchar(2048), @eventMessage AS nvarchar(2048)
    SET @databaseName = REPLACE(REPLACE(DB_NAME(), N'\', N'\\'), N'"', N'\"')
    SET @eventMessage = N'Redgate SQL Compare: { "deployment": { "description": "Redgate SQL Compare deployed to ' + @databaseName + N'", "database": "' + @databaseName + N'" }}'
    EXECUTE sys.xp_logevent 55000, @eventMessage
END
GO
DECLARE @Success AS BIT
SET @Success = 1
SET NOEXEC OFF
IF (@Success = 1) PRINT 'The database update succeeded'
ELSE BEGIN
	IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
	PRINT 'The database update failed'
END
GO
