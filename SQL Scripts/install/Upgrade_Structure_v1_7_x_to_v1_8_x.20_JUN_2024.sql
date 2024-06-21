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
PRINT N'Dropping constraints from [__mj].[AIAction]'
GO
ALTER TABLE [__mj].[AIAction] DROP CONSTRAINT [DF_AIAction_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AIAction]'
GO
ALTER TABLE [__mj].[AIAction] DROP CONSTRAINT [DF_AIAction_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AIModelAction]'
GO
ALTER TABLE [__mj].[AIModelAction] DROP CONSTRAINT [DF_AIModelAction_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AIModelAction]'
GO
ALTER TABLE [__mj].[AIModelAction] DROP CONSTRAINT [DF_AIModelAction_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AIModel]'
GO
ALTER TABLE [__mj].[AIModel] DROP CONSTRAINT [DF_AIModel_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AIModel]'
GO
ALTER TABLE [__mj].[AIModel] DROP CONSTRAINT [DF_AIModel_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] DROP CONSTRAINT [DF__ActionAut__Creat__7DDCC217]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] DROP CONSTRAINT [DF__ActionAut__Updat__7ED0E650]
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
PRINT N'Dropping constraints from [__mj].[ActionContextType]'
GO
ALTER TABLE [__mj].[ActionContextType] DROP CONSTRAINT [DF__ActionCon__Creat__0F074E19]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionContextType]'
GO
ALTER TABLE [__mj].[ActionContextType] DROP CONSTRAINT [DF__ActionCon__Updat__0FFB7252]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] DROP CONSTRAINT [DF__ActionCon__Creat__14C0276F]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] DROP CONSTRAINT [DF__ActionCon__Updat__15B44BA8]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] DROP CONSTRAINT [DF__ActionExe__Creat__39F1AC1E]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] DROP CONSTRAINT [DF__ActionExe__Updat__3AE5D057]
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
PRINT N'Dropping constraints from [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] DROP CONSTRAINT [DF__ActionLib__Creat__7BAB2C39]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] DROP CONSTRAINT [DF__ActionLib__Updat__7C9F5072]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] DROP CONSTRAINT [DF__ActionPar__Creat__73351672]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] DROP CONSTRAINT [DF__ActionPar__Updat__74293AAB]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionResultCode]'
GO
ALTER TABLE [__mj].[ActionResultCode] DROP CONSTRAINT [DF__ActionRes__Creat__3FAA8574]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ActionResultCode]'
GO
ALTER TABLE [__mj].[ActionResultCode] DROP CONSTRAINT [DF__ActionRes__Updat__409EA9AD]
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
PRINT N'Dropping constraints from [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] DROP CONSTRAINT [DF_AuditLog_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] DROP CONSTRAINT [DF_AuditLog_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] DROP CONSTRAINT [DF_AuthorizationRole_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] DROP CONSTRAINT [DF_AuthorizationRole_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] DROP CONSTRAINT [DF__Communica__Creat__6BA143A7]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] DROP CONSTRAINT [DF__Communica__Updat__6C9567E0]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] DROP CONSTRAINT [DF__Communica__Creat__046CF171]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] DROP CONSTRAINT [DF__Communica__Updat__056115AA]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] DROP CONSTRAINT [DF__Communica__Creat__715A1CFD]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] DROP CONSTRAINT [DF__Communica__Updat__724E4136]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] DROP CONSTRAINT [DF__Communica__Creat__640021DF]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] DROP CONSTRAINT [DF__Communica__Updat__64F44618]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] DROP CONSTRAINT [DF__Communica__Creat__7DBFF3E2]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] DROP CONSTRAINT [DF__Communica__Updat__7EB4181B]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] DROP CONSTRAINT [DF_CompanyIntegrationRecordMap_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] DROP CONSTRAINT [DF_CompanyIntegrationRecordMap_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CompanyIntegration]'
GO
ALTER TABLE [__mj].[CompanyIntegration] DROP CONSTRAINT [DF_CompanyIntegration_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CompanyIntegration]'
GO
ALTER TABLE [__mj].[CompanyIntegration] DROP CONSTRAINT [DF_CompanyIntegration_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] DROP CONSTRAINT [DF_ConversationDetail_DateCreated]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] DROP CONSTRAINT [DF_ConversationDetail_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Conversation]'
GO
ALTER TABLE [__mj].[Conversation] DROP CONSTRAINT [DF_Conversation_DateCreated]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Conversation]'
GO
ALTER TABLE [__mj].[Conversation] DROP CONSTRAINT [DF_Conversation_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] DROP CONSTRAINT [DF_DashboardCategory_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] DROP CONSTRAINT [DF_DashboardCategory_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] DROP CONSTRAINT [DF_DataContextItem_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] DROP CONSTRAINT [DF_DataContextItem_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DataContext]'
GO
ALTER TABLE [__mj].[DataContext] DROP CONSTRAINT [DF_DataContext_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DataContext]'
GO
ALTER TABLE [__mj].[DataContext] DROP CONSTRAINT [DF_DataContext_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DatasetItem]'
GO
ALTER TABLE [__mj].[DatasetItem] DROP CONSTRAINT [DF_DatasetItem_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DatasetItem]'
GO
ALTER TABLE [__mj].[DatasetItem] DROP CONSTRAINT [DF_DatasetItem_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Dataset]'
GO
ALTER TABLE [__mj].[Dataset] DROP CONSTRAINT [DF_Dataset_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Dataset]'
GO
ALTER TABLE [__mj].[Dataset] DROP CONSTRAINT [DF_Dataset_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] DROP CONSTRAINT [DF_DuplicateRunDetailMatch_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] DROP CONSTRAINT [DF_DuplicateRunDetailMatch_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] DROP CONSTRAINT [DF_DuplicateRunDetail_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] DROP CONSTRAINT [DF_DuplicateRunDetail_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] DROP CONSTRAINT [DF_DuplicateRun_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] DROP CONSTRAINT [DF_DuplicateRun_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] DROP CONSTRAINT [DF_EmployeeCompanyIntegration_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] DROP CONSTRAINT [DF_EmployeeCompanyIntegration_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[ErrorLog]'
GO
ALTER TABLE [__mj].[ErrorLog] DROP CONSTRAINT [DF_ErrorLog_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileCategory]'
GO
ALTER TABLE [__mj].[FileCategory] DROP CONSTRAINT [DF_FileCategory_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileCategory]'
GO
ALTER TABLE [__mj].[FileCategory] DROP CONSTRAINT [DF_FileCategory_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileEntityRecordLink]'
GO
ALTER TABLE [__mj].[FileEntityRecordLink] DROP CONSTRAINT [DF_FileEntityRecordLink_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileEntityRecordLink]'
GO
ALTER TABLE [__mj].[FileEntityRecordLink] DROP CONSTRAINT [DF_FileEntityRecordLink_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileStorageProvider]'
GO
ALTER TABLE [__mj].[FileStorageProvider] DROP CONSTRAINT [DF_FileProvider_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[FileStorageProvider]'
GO
ALTER TABLE [__mj].[FileStorageProvider] DROP CONSTRAINT [DF_FileProvider_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[File]'
GO
ALTER TABLE [__mj].[File] DROP CONSTRAINT [DF_File_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[File]'
GO
ALTER TABLE [__mj].[File] DROP CONSTRAINT [DF_File_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] DROP CONSTRAINT [DF_Integration_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] DROP CONSTRAINT [DF_Integration_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[List]'
GO
ALTER TABLE [__mj].[List] DROP CONSTRAINT [DF_List_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[List]'
GO
ALTER TABLE [__mj].[List] DROP CONSTRAINT [DF_List_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[Queue]'
GO
ALTER TABLE [__mj].[Queue] DROP CONSTRAINT [DF_Queue_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Queue]'
GO
ALTER TABLE [__mj].[Queue] DROP CONSTRAINT [DF_Queue_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] DROP CONSTRAINT [DF__Recommend__Creat__7D976D5E]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] DROP CONSTRAINT [DF__Recommend__Updat__7E8B9197]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationProvider]'
GO
ALTER TABLE [__mj].[RecommendationProvider] DROP CONSTRAINT [DF__Recommend__Creat__6C6CE15C]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationProvider]'
GO
ALTER TABLE [__mj].[RecommendationProvider] DROP CONSTRAINT [DF__Recommend__Updat__6D610595]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] DROP CONSTRAINT [DF__Recommend__Creat__703D7240]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] DROP CONSTRAINT [DF__Recommend__Updat__71319679]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Recommendation]'
GO
ALTER TABLE [__mj].[Recommendation] DROP CONSTRAINT [DF__Recommend__Creat__76EA6FCF]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Recommendation]'
GO
ALTER TABLE [__mj].[Recommendation] DROP CONSTRAINT [DF__Recommend__Updat__77DE9408]
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
PRINT N'Dropping constraints from [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] DROP CONSTRAINT [DF_RecordMergeDeletionLog_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] DROP CONSTRAINT [DF_RecordMergeDeletionLog_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] DROP CONSTRAINT [DF_RecordMergeLog_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] DROP CONSTRAINT [DF_RecordMergeLog_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ReportCategory]'
GO
ALTER TABLE [__mj].[ReportCategory] DROP CONSTRAINT [DF_ReportCategory_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ReportCategory]'
GO
ALTER TABLE [__mj].[ReportCategory] DROP CONSTRAINT [DF_ReportCategory_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ReportSnapshot]'
GO
ALTER TABLE [__mj].[ReportSnapshot] DROP CONSTRAINT [DF_ReportSnapshot_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] DROP CONSTRAINT [DF_Report_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] DROP CONSTRAINT [DF_Report_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] DROP CONSTRAINT [DF_SchemaInfo_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] DROP CONSTRAINT [DF_SchemaInfo_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Skill]'
GO
ALTER TABLE [__mj].[Skill] DROP CONSTRAINT [DF_Skill_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Skill]'
GO
ALTER TABLE [__mj].[Skill] DROP CONSTRAINT [DF_Skill_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] DROP CONSTRAINT [DF__TemplateC__Creat__64A00BB4]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] DROP CONSTRAINT [DF__TemplateC__Updat__65942FED]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateContentType]'
GO
ALTER TABLE [__mj].[TemplateContentType] DROP CONSTRAINT [DF__TemplateC__Creat__30AC31B9]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateContentType]'
GO
ALTER TABLE [__mj].[TemplateContentType] DROP CONSTRAINT [DF__TemplateC__Updat__31A055F2]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateContent]'
GO
ALTER TABLE [__mj].[TemplateContent] DROP CONSTRAINT [DF__TemplateC__Creat__3570E6D6]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateContent]'
GO
ALTER TABLE [__mj].[TemplateContent] DROP CONSTRAINT [DF__TemplateC__Updat__36650B0F]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] DROP CONSTRAINT [DF__TemplateP__Creat__4C544C2E]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] DROP CONSTRAINT [DF__TemplateP__Updat__4D487067]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Template]'
GO
ALTER TABLE [__mj].[Template] DROP CONSTRAINT [DF__Template__Create__6A58E50A]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Template]'
GO
ALTER TABLE [__mj].[Template] DROP CONSTRAINT [DF__Template__Update__6B4D0943]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserFavorite]'
GO
ALTER TABLE [__mj].[UserFavorite] DROP CONSTRAINT [DF_UserFavorite_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserFavorite]'
GO
ALTER TABLE [__mj].[UserFavorite] DROP CONSTRAINT [DF_UserFavorite_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserNotification]'
GO
ALTER TABLE [__mj].[UserNotification] DROP CONSTRAINT [DF_UserNotification_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserNotification]'
GO
ALTER TABLE [__mj].[UserNotification] DROP CONSTRAINT [DF_UserNotification_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] DROP CONSTRAINT [DF_UserViewCategory_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] DROP CONSTRAINT [DF_UserViewCategory_UpdatedAt]
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
PRINT N'Dropping constraints from [__mj].[VectorDatabase]'
GO
ALTER TABLE [__mj].[VectorDatabase] DROP CONSTRAINT [DF_VectorDatabase_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[VectorDatabase]'
GO
ALTER TABLE [__mj].[VectorDatabase] DROP CONSTRAINT [DF_VectorDatabase_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[VectorIndex]'
GO
ALTER TABLE [__mj].[VectorIndex] DROP CONSTRAINT [DF_VectorIndex_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[VectorIndex]'
GO
ALTER TABLE [__mj].[VectorIndex] DROP CONSTRAINT [DF_VectorIndex_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[VersionInstallation]'
GO
ALTER TABLE [__mj].[VersionInstallation] DROP CONSTRAINT [DF_VersionInstallation_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[VersionInstallation]'
GO
ALTER TABLE [__mj].[VersionInstallation] DROP CONSTRAINT [DF_VersionInstallation_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[WorkflowEngine]'
GO
ALTER TABLE [__mj].[WorkflowEngine] DROP CONSTRAINT [DF_WorkflowEngine_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[WorkflowEngine]'
GO
ALTER TABLE [__mj].[WorkflowEngine] DROP CONSTRAINT [DF_WorkflowEngine_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] DROP CONSTRAINT [DF_Workflow_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] DROP CONSTRAINT [DF_Workflow_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] DROP CONSTRAINT [DF_WorkspaceItem_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] DROP CONSTRAINT [DF_WorkspaceItem_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Workspace]'
GO
ALTER TABLE [__mj].[Workspace] DROP CONSTRAINT [DF_Workspace_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[Workspace]'
GO
ALTER TABLE [__mj].[Workspace] DROP CONSTRAINT [DF_Workspace_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[FileCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileCateg____mj___51628081] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileCateg____mj___5256A4BA] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[TemplateContentType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateContentType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7D4102BF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7E3526F8] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateContentType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CompanyIntegrationRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegrationRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___72045A3D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___72F87E76] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRun] on [__mj].[CompanyIntegrationRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRun]
ON [__mj].[CompanyIntegrationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__LibraryIt____mj___08B2B56B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__LibraryIt____mj___09A6D9A4] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateLibraryItem] on [__mj].[LibraryItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateLibraryItem]
ON [__mj].[LibraryItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[LibraryItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[LibraryItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[DashboardCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DashboardCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___49C15EB9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___4AB582F2] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DashboardCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6DFEBF2F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6EF2E368] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationRun] DROP
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
PRINT N'Altering [__mj].[RecordMergeLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3C67639B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3D5B87D4] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordMergeLog] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationProvider]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6C1676BD] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6D0A9AF6] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationProvider] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionLibrary]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionLibrary] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionLib____mj___6845E5D9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionLib____mj___693A0A12] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionLibrary] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionParam]'
GO
CREATE TABLE [__mj].[EntityActionParam]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityActionID] [int] NOT NULL,
[ActionParamID] [int] NOT NULL,
[ValueType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityAct____mj___52EAD640] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityAct____mj___53DEFA79] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityAc__3214EC27175E75F8] on [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [PK__EntityAc__3214EC27175E75F8] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionParam] on [__mj].[EntityActionParam]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityActionParam]
ON [__mj].[EntityActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[VersionInstallation]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VersionInstallation] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VersionIn____mj___55331165] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VersionIn____mj___5627359E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VersionInstallation] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CompanyIntegrationRecordMap]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___3A7F1B29] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___3B733F62] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionExecutionLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionExe____mj___647554F5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionExe____mj___6569792E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionExecutionLog] DROP
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
PRINT N'Altering [__mj].[SchemaInfo]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[SchemaInfo] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__SchemaInf____mj___3896D2B7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__SchemaInf____mj___398AF6F0] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[SchemaInfo] DROP
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
PRINT N'Altering [__mj].[WorkflowEngine]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkflowEngine] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowE____mj___08E7BF95] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowE____mj___09DBE3CE] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkflowEngine] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ReportSnapshot]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ReportSnapshot] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportSna____mj___2583FE43] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportSna____mj___2678227C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ReportSnapshot] DROP
COLUMN [CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReportSnapshot] on [__mj].[ReportSnapshot]'
GO

CREATE TRIGGER [__mj].[trgUpdateReportSnapshot]
ON [__mj].[ReportSnapshot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportSnapshot]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ReportSnapshot] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[UserNotification]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserNotification] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserNotif____mj___36AE8A45] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserNotif____mj___37A2AE7E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserNotification] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionAuthorization]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionAut____mj___5CD4332D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionAut____mj___5DC85766] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionAuthorization] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[VectorDatabase]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VectorDatabase] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorDat____mj___42203CF1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorDat____mj___4314612A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VectorDatabase] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Template]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Template] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Template____mj_C__759FE0F7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Template____mj_U__76940530] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Template] DROP
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
PRINT N'Altering [__mj].[Workflow]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Workflow] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workflow____mj_C__06FF7723] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workflow____mj_U__07F39B5C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Workflow] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
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
PRINT N'Altering [__mj].[VectorIndex]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VectorIndex] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorInd____mj___4037F47F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorInd____mj___412C18B8] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VectorIndex] DROP
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
PRINT N'Altering [__mj].[DuplicateRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5903A249] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___59F7C682] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRun] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[UserRecordLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserRecordLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserRecor____mj___701C11CB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserRecor____mj___71103604] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserRecordLog] on [__mj].[UserRecordLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserRecordLog]
ON [__mj].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserRecordLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserRecordLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[TemplateContent]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateContent] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___797071DB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7A649614] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateContent] DROP
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
PRINT N'Altering [__mj].[AIModelAction]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIModelAction] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelAc____mj___127129CF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelAc____mj___13654E08] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIModelAction] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[TemplateCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___77882969] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___787C4DA2] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[DataContextItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DataContextItem] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___44088563] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___44FCA99C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DataContextItem] DROP
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
PRINT N'Altering [__mj].[RecommendationItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationItem] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___04E22487] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___05D648C0] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationItem] DROP
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
PRINT N'Altering [__mj].[ActionResultCode]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionResultCode] ADD
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF_ActionResultCode_IsSuccess] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionRes____mj___60A4C411] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionRes____mj___6198E84A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionResultCode] DROP
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
PRINT N'Altering [__mj].[CompanyIntegrationRunAPILog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegrationRunAPILog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___7B8DC477] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___7C81E8B0] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRunAPILog] on [__mj].[CompanyIntegrationRunAPILog]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRunAPILog]
ON [__mj].[CompanyIntegrationRunAPILog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunAPILog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRunAPILog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecommendationRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___02F9DC15] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___03EE004E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationRun] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ActionContextType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionContextType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___5EBC7B9F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___5FB09FD8] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionContextType] DROP
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
PRINT N'Altering [__mj].[UserApplicationEntity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserApplicationEntity] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___77BD3393] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___78B157CC] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserApplicationEntity] on [__mj].[UserApplicationEntity]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserApplicationEntity]
ON [__mj].[UserApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplicationEntity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserApplicationEntity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering [__mj].[ActionParam]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionParam] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionPar____mj___665D9D67] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionPar____mj___6751C1A0] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionParam] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[WorkflowRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkflowRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowR____mj___05172EB1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowR____mj___060B52EA] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkflowRun] on [__mj].[WorkflowRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkflowRun]
ON [__mj].[WorkflowRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkflowRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecordMergeDeletionLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3E4FAC0D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3F43D046] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ReportCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ReportCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportCat____mj___4BA9A72B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportCat____mj___4C9DCB64] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ReportCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationBaseMessageType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___73B79885] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___74ABBCBE] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] DROP
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
PRINT N'Altering [__mj].[ListCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ListCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListCateg____mj___6A2E2E4B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListCateg____mj___6B225284] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ListCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Action]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] ADD
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Action_Type] DEFAULT (N'Generated'),
[CodeLocked] [bit] NOT NULL CONSTRAINT [DF_Action_CodeLocked] DEFAULT ((0)),
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
ALTER TABLE [__mj].[Action] ALTER COLUMN [UserPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[UserViewRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserViewRun] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___01469DCD] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___023AC206] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserViewRun] on [__mj].[UserViewRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserViewRun]
ON [__mj].[UserViewRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[FileEntityRecordLink]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileEntityRecordLink] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileEntit____mj___534AC8F3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileEntit____mj___543EED2C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileEntityRecordLink] DROP
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
PRINT N'Altering [__mj].[UserViewRunDetail]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserViewRunDetail] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___032EE63F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___04230A78] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserViewRunDetail] on [__mj].[UserViewRunDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserViewRunDetail]
ON [__mj].[UserViewRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering [__mj].[AIModelType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIModelType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelTy____mj___14597241] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelTy____mj___154D967A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModelType] on [__mj].[AIModelType]'
GO

CREATE TRIGGER [__mj].[trgUpdateAIModelType]
ON [__mj].[AIModelType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModelType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Queue]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Queue] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Queue____mj_Crea__182A0325] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Queue____mj_Upda__191E275E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Queue] DROP
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
PRINT N'Altering [__mj].[UserFavorite]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserFavorite] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserFavor____mj___64AA5F1F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserFavor____mj___659E8358] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserFavorite] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Integration]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Integration] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6C4B80E7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6D3FA520] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Integration] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Recommendation]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Recommendation] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___7F294B31] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___001D6F6A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Recommendation] DROP
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
PRINT N'Altering [__mj].[UserApplication]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserApplication] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___79A57C05] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___7A99A03E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserApplication] on [__mj].[UserApplication]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserApplication]
ON [__mj].[UserApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplication]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserApplication] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering [__mj].[UserViewCategory]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserViewCategory] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewC____mj___47D91647] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewC____mj___48CD3A80] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[UserViewCategory] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CompanyIntegration]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___6E33C959] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___6F27ED92] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegration] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___71CF5013] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___72C3744C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationLog] DROP
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
PRINT N'Altering [__mj].[ActionContext]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionContext] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___628D0C83] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___638130BC] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionContext] DROP
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
PRINT N'Altering [__mj].[IntegrationURLFormat]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[IntegrationURLFormat] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6A633875] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6B575CAE] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateIntegrationURLFormat] on [__mj].[IntegrationURLFormat]'
GO

CREATE TRIGGER [__mj].[trgUpdateIntegrationURLFormat]
ON [__mj].[IntegrationURLFormat]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[IntegrationURLFormat]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[IntegrationURLFormat] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationProviderMessageType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6FE707A1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___70DB2BDA] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Workspace]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Workspace] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2B3CD799] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2C30FBD2] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Workspace] DROP
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
PRINT N'Altering [__mj].[AIModel]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIModel] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModel____mj_Cr__0EA098EB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModel____mj_Up__0F94BD24] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIModel] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[DuplicateRunDetail]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5AEBEABB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5BE00EF4] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetail] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecommendationProvider]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationProvider] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___011193A3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___0205B7DC] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecommendationProvider] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[AIAction]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIAction] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIAction____mj_C__1088E15D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIAction____mj_U__117D0596] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AIAction] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[TemplateParam]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateParam] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateP____mj___7B58BA4D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateP____mj___7C4CDE86] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TemplateParam] DROP
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
PRINT N'Creating [__mj].[RecordChangeReplayRun]'
GO
CREATE TABLE [__mj].[RecordChangeReplayRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[StartedAt] [datetime] NOT NULL,
[EndedAt] [datetime] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordCha____mj___06CA6CF9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordCha____mj___07BE9132] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateRecordChangeReplayRun] on [__mj].[RecordChangeReplayRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecordChangeReplayRun]
ON [__mj].[RecordChangeReplayRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChangeReplayRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordChangeReplayRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[DuplicateRunDetailMatch]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___571B59D7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___580F7E10] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] DROP
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
PRINT N'Altering [__mj].[File]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[File] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__File____mj_Creat__4F7A380F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__File____mj_Updat__506E5C48] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[File] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Dashboard]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Dashboard] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___1BFA9409] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___1CEEB842] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDashboard] on [__mj].[Dashboard]'
GO

CREATE TRIGGER [__mj].[trgUpdateDashboard]
ON [__mj].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Dashboard]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Dashboard] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EmployeeCompanyIntegration]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EmployeeC____mj___6692A791] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EmployeeC____mj___6786CBCA] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[List]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[List] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__List____mj_Creat__7D760CE9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__List____mj_Updat__7E6A3122] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[List] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[AuditLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuditLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AuditLog____mj_C__0AD00807] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AuditLog____mj_U__0BC42C40] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuditLog] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[WorkspaceItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2D25200B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2E194444] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkspaceItem] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[FileStorageProvider]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileStorageProvider] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileStora____mj___4D91EF9D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileStora____mj___4E8613D6] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[FileStorageProvider] DROP
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
PRINT N'Altering [__mj].[QueueTask]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueueTask] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueTask____mj___1A124B97] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueTask____mj___1B066FD0] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueueTask] on [__mj].[QueueTask]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueueTask]
ON [__mj].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueueTask]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueueTask] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Report]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Report] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Report____mj_Cre__239BB5D1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Report____mj_Upd__248FDA0A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Report] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ListDetail]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ListDetail] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListDetai____mj___7F5E555B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListDetai____mj___00527994] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateListDetail] on [__mj].[ListDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateListDetail]
ON [__mj].[ListDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ListDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CompanyIntegrationRunDetail]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___73ECA2AF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___74E0C6E8] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRunDetail] on [__mj].[CompanyIntegrationRunDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRunDetail]
ON [__mj].[CompanyIntegrationRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering [__mj].[ConversationDetail]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ConversationDetail] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___32DDF961] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___33D21D9A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ConversationDetail] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[ErrorLog]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ErrorLog] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ErrorLog____mj_C__75D4EB21] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ErrorLog____mj_U__76C90F5A] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ErrorLog] DROP
COLUMN [CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateErrorLog] on [__mj].[ErrorLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateErrorLog]
ON [__mj].[ErrorLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ErrorLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ErrorLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering [__mj].[Entity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_UpdatedAt] DEFAULT (getutcdate()),
[RelationshipDefaultDisplayType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Entity__Relation__0F008B9E] DEFAULT ('Search')
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] DROP
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
PRINT N'Altering [__mj].[Conversation]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Conversation] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___34C641D3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___35BA660C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Conversation] DROP
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
PRINT N'Altering [__mj].[DataContext]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DataContext] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___45F0CDD5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___46E4F20E] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DataContext] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[OutputDeliveryType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[OutputDeliveryType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputDel____mj___21B36D5F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputDel____mj___22A79198] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[OutputFormatType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[OutputFormatType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputFor____mj___1FCB24ED] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputFor____mj___20BF4926] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[OutputTriggerType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[OutputTriggerType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputTri____mj___1DE2DC7B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputTri____mj___1ED700B4] DEFAULT (getutcdate())
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
PRINT N'Altering [__mj].[Tag]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Tag] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Tag____mj_Create__276C46B5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Tag____mj_Update__28606AEE] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[TaggedItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[TaggedItem] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TaggedIte____mj___29548F27] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TaggedIte____mj___2A48B360] DEFAULT (getutcdate())
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
PRINT N'Altering [__mj].[AuthorizationRole]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Authoriza____mj___0CB85079] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Authoriza____mj___0DAC74B2] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[AuthorizationRole] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Dataset]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Dataset] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dataset____mj_Cr__2F0D687D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dataset____mj_Up__30018CB6] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Dataset] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[DatasetItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DatasetItem] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DatasetIt____mj___30F5B0EF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DatasetIt____mj___31E9D528] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DatasetItem] DROP
COLUMN [CreatedAt],
COLUMN [UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Skill]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Skill] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Skill____mj_Crea__687AF003] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Skill____mj_Upda__696F143C] DEFAULT (getutcdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Skill] DROP
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
PRINT N'Altering [__mj].[QueueType]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[QueueType] ADD
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueType____mj___1641BAB3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueType____mj___1735DEEC] DEFAULT (getutcdate())
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
PRINT N'Altering [__mj].[spCreateEntity]'
GO


ALTER PROCEDURE [__mj].[spCreateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @RelationshipDefaultDisplayType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [spMatch],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon],
            [RelationshipDefaultDisplayType]
        )
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @spMatch,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon,
            @RelationshipDefaultDisplayType
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionParam]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityActionParam]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
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
PRINT N'Altering [__mj].[spCreateActionResultCode]'
GO


ALTER PROCEDURE [__mj].[spCreateActionResultCode]
    @ActionID int,
    @ResultCode nvarchar(255),
    @IsSuccess bit,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionResultCode]
        (
            [ActionID],
            [ResultCode],
            [IsSuccess],
            [Description]
        )
    VALUES
        (
            @ActionID,
            @ResultCode,
            @IsSuccess,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionResultCodes] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Altering [__mj].[spUpdateEntity]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @RelationshipDefaultDisplayType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [spMatch] = @spMatch,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntities] 
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
PRINT N'Altering [__mj].[spUpdateActionResultCode]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionResultCode]
    @ID int,
    @ActionID int,
    @ResultCode nvarchar(255),
    @IsSuccess bit,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        [ActionID] = @ActionID,
        [ResultCode] = @ResultCode,
        [IsSuccess] = @IsSuccess,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionResultCodes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChangeReplayRun]'
GO


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
PRINT N'Creating [__mj].[vwEntityActionParams]'
GO


CREATE VIEW [__mj].[vwEntityActionParams]
AS
SELECT 
    e.*,
    ActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [__mj].[EntityActionParam] AS e
INNER JOIN
    [__mj].[ActionParam] AS ActionParam_ActionParamID
  ON
    [e].[ActionParamID] = ActionParam_ActionParamID.[ID]
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
PRINT N'Creating [__mj].[spCreateEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionParam]
    @EntityActionID int,
    @ActionParamID int,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityActionParam]
        (
            [EntityActionID],
            [ActionParamID],
            [ValueType],
            [Value],
            [Comments]
        )
    VALUES
        (
            @EntityActionID,
            @ActionParamID,
            @ValueType,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionParams] WHERE [ID] = SCOPE_IDENTITY()
END
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
PRINT N'Altering [__mj].[spCreateAction]'
GO


ALTER PROCEDURE [__mj].[spCreateAction]
    @CategoryID int,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
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
            [Description],
            [Type],
            [UserPrompt],
            [UserComments],
            [Code],
            [CodeComments],
            [CodeApprovalStatus],
            [CodeApprovalComments],
            [CodeApprovedByUserID],
            [CodeApprovedAt],
            [CodeLocked],
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
            @Description,
            @Type,
            @UserPrompt,
            @UserComments,
            @Code,
            @CodeComments,
            @CodeApprovalStatus,
            @CodeApprovalComments,
            @CodeApprovedByUserID,
            @CodeApprovedAt,
            @CodeLocked,
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
PRINT N'Creating [__mj].[spUpdateEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionParam]
    @ID int,
    @EntityActionID int,
    @ActionParamID int,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionParam]
    SET 
        [EntityActionID] = @EntityActionID,
        [ActionParamID] = @ActionParamID,
        [ValueType] = @ValueType,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionParams] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Altering [__mj].[spUpdateAction]'
GO


ALTER PROCEDURE [__mj].[spUpdateAction]
    @ID int,
    @CategoryID int,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActions] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Adding constraints to [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CHK_Action_Type] CHECK (([Type]='Custom' OR [Type]='Generated'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [CK__EntityAct__Value__133A657F] CHECK (([ValueType]='Script' OR [ValueType]='Entity Object' OR [ValueType]='Static'))
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
PRINT N'Adding constraints to [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [CHK_RelationshipDefaultDisplayType] CHECK (([RelationshipDefaultDisplayType]='Dropdown' OR [RelationshipDefaultDisplayType]='Search'))
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
PRINT N'Adding foreign keys to [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [FK__EntityAct__Actio__142E89B8] FOREIGN KEY ([ActionParamID]) REFERENCES [__mj].[ActionParam] ([ID])
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [FK_EntityActionParam_EntityAction] FOREIGN KEY ([EntityActionID]) REFERENCES [__mj].[EntityAction] ([ID])
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
PRINT N'Altering trigger [__mj].[trgUpdateAIAction] on [__mj].[AIAction]'
GO

ALTER TRIGGER [__mj].[trgUpdateAIAction]
ON [__mj].[AIAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateAIModelAction] on [__mj].[AIModelAction]'
GO

ALTER TRIGGER [__mj].[trgUpdateAIModelAction]
ON [__mj].[AIModelAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModelAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateAIModel] on [__mj].[AIModel]'
GO

ALTER TRIGGER [__mj].[trgUpdateAIModel]
ON [__mj].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModel] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionAuthorization] on [__mj].[ActionAuthorization]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionAuthorization]
ON [__mj].[ActionAuthorization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionAuthorization] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
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
PRINT N'Altering trigger [__mj].[trgUpdateActionContextType] on [__mj].[ActionContextType]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionContextType]
ON [__mj].[ActionContextType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionContextType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionContext] on [__mj].[ActionContext]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionContext]
ON [__mj].[ActionContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionExecutionLog] on [__mj].[ActionExecutionLog]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionExecutionLog]
ON [__mj].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionExecutionLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionExecutionLog] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateActionLibrary] on [__mj].[ActionLibrary]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionLibrary]
ON [__mj].[ActionLibrary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionLibrary] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionParam] on [__mj].[ActionParam]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionParam]
ON [__mj].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateActionResultCode] on [__mj].[ActionResultCode]'
GO

ALTER TRIGGER [__mj].[trgUpdateActionResultCode]
ON [__mj].[ActionResultCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionResultCode] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateAuditLog] on [__mj].[AuditLog]'
GO

ALTER TRIGGER [__mj].[trgUpdateAuditLog]
ON [__mj].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AuditLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCommunicationBaseMessageType] on [__mj].[CommunicationBaseMessageType]'
GO

ALTER TRIGGER [__mj].[trgUpdateCommunicationBaseMessageType]
ON [__mj].[CommunicationBaseMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationBaseMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationBaseMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCommunicationLog] on [__mj].[CommunicationLog]'
GO

ALTER TRIGGER [__mj].[trgUpdateCommunicationLog]
ON [__mj].[CommunicationLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCommunicationProviderMessageType] on [__mj].[CommunicationProviderMessageType]'
GO

ALTER TRIGGER [__mj].[trgUpdateCommunicationProviderMessageType]
ON [__mj].[CommunicationProviderMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProviderMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationProviderMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCommunicationProvider] on [__mj].[CommunicationProvider]'
GO

ALTER TRIGGER [__mj].[trgUpdateCommunicationProvider]
ON [__mj].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCommunicationRun] on [__mj].[CommunicationRun]'
GO

ALTER TRIGGER [__mj].[trgUpdateCommunicationRun]
ON [__mj].[CommunicationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCompanyIntegrationRecordMap] on [__mj].[CompanyIntegrationRecordMap]'
GO

ALTER TRIGGER [__mj].[trgUpdateCompanyIntegrationRecordMap]
ON [__mj].[CompanyIntegrationRecordMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRecordMap] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateCompanyIntegration] on [__mj].[CompanyIntegration]'
GO

ALTER TRIGGER [__mj].[trgUpdateCompanyIntegration]
ON [__mj].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegration] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateConversationDetail] on [__mj].[ConversationDetail]'
GO

ALTER TRIGGER [__mj].[trgUpdateConversationDetail]
ON [__mj].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ConversationDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ConversationDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateConversation] on [__mj].[Conversation]'
GO

ALTER TRIGGER [__mj].[trgUpdateConversation]
ON [__mj].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Conversation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Conversation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDashboardCategory] on [__mj].[DashboardCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateDashboardCategory]
ON [__mj].[DashboardCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DashboardCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDataContextItem] on [__mj].[DataContextItem]'
GO

ALTER TRIGGER [__mj].[trgUpdateDataContextItem]
ON [__mj].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContextItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DataContextItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDataContext] on [__mj].[DataContext]'
GO

ALTER TRIGGER [__mj].[trgUpdateDataContext]
ON [__mj].[DataContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DataContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDuplicateRunDetailMatch] on [__mj].[DuplicateRunDetailMatch]'
GO

ALTER TRIGGER [__mj].[trgUpdateDuplicateRunDetailMatch]
ON [__mj].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetailMatch]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDuplicateRunDetail] on [__mj].[DuplicateRunDetail]'
GO

ALTER TRIGGER [__mj].[trgUpdateDuplicateRunDetail]
ON [__mj].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateDuplicateRun] on [__mj].[DuplicateRun]'
GO

ALTER TRIGGER [__mj].[trgUpdateDuplicateRun]
ON [__mj].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateEmployeeCompanyIntegration] on [__mj].[EmployeeCompanyIntegration]'
GO

ALTER TRIGGER [__mj].[trgUpdateEmployeeCompanyIntegration]
ON [__mj].[EmployeeCompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeCompanyIntegration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeCompanyIntegration] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateFileCategory] on [__mj].[FileCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateFileCategory]
ON [__mj].[FileCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateFileEntityRecordLink] on [__mj].[FileEntityRecordLink]'
GO

ALTER TRIGGER [__mj].[trgUpdateFileEntityRecordLink]
ON [__mj].[FileEntityRecordLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileEntityRecordLink] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateFileStorageProvider] on [__mj].[FileStorageProvider]'
GO

ALTER TRIGGER [__mj].[trgUpdateFileStorageProvider]
ON [__mj].[FileStorageProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileStorageProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileStorageProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateFile] on [__mj].[File]'
GO

ALTER TRIGGER [__mj].[trgUpdateFile]
ON [__mj].[File]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[File] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateIntegration] on [__mj].[Integration]'
GO

ALTER TRIGGER [__mj].[trgUpdateIntegration]
ON [__mj].[Integration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Integration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Integration] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateListCategory] on [__mj].[ListCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateListCategory]
ON [__mj].[ListCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ListCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateList] on [__mj].[List]'
GO

ALTER TRIGGER [__mj].[trgUpdateList]
ON [__mj].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[List]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[List] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateQueue] on [__mj].[Queue]'
GO

ALTER TRIGGER [__mj].[trgUpdateQueue]
ON [__mj].[Queue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Queue]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Queue] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecommendationItem] on [__mj].[RecommendationItem]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecommendationItem]
ON [__mj].[RecommendationItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecommendationProvider] on [__mj].[RecommendationProvider]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecommendationProvider]
ON [__mj].[RecommendationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecommendationRun] on [__mj].[RecommendationRun]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecommendationRun]
ON [__mj].[RecommendationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecommendation] on [__mj].[Recommendation]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecommendation]
ON [__mj].[Recommendation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Recommendation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecordMergeDeletionLog] on [__mj].[RecordMergeDeletionLog]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecordMergeDeletionLog]
ON [__mj].[RecordMergeDeletionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeDeletionLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordMergeDeletionLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateRecordMergeLog] on [__mj].[RecordMergeLog]'
GO

ALTER TRIGGER [__mj].[trgUpdateRecordMergeLog]
ON [__mj].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordMergeLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateReportCategory] on [__mj].[ReportCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateReportCategory]
ON [__mj].[ReportCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ReportCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateReport] on [__mj].[Report]'
GO

ALTER TRIGGER [__mj].[trgUpdateReport]
ON [__mj].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Report]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Report] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateSchemaInfo] on [__mj].[SchemaInfo]'
GO

ALTER TRIGGER [__mj].[trgUpdateSchemaInfo]
ON [__mj].[SchemaInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[SchemaInfo]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[SchemaInfo] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateTemplateCategory] on [__mj].[TemplateCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateTemplateCategory]
ON [__mj].[TemplateCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateTemplateContentType] on [__mj].[TemplateContentType]'
GO

ALTER TRIGGER [__mj].[trgUpdateTemplateContentType]
ON [__mj].[TemplateContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateContentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateTemplateContent] on [__mj].[TemplateContent]'
GO

ALTER TRIGGER [__mj].[trgUpdateTemplateContent]
ON [__mj].[TemplateContent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContent]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateContent] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateTemplateParam] on [__mj].[TemplateParam]'
GO

ALTER TRIGGER [__mj].[trgUpdateTemplateParam]
ON [__mj].[TemplateParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateTemplate] on [__mj].[Template]'
GO

ALTER TRIGGER [__mj].[trgUpdateTemplate]
ON [__mj].[Template]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Template]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Template] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateUserFavorite] on [__mj].[UserFavorite]'
GO

ALTER TRIGGER [__mj].[trgUpdateUserFavorite]
ON [__mj].[UserFavorite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserFavorite] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateUserNotification] on [__mj].[UserNotification]'
GO

ALTER TRIGGER [__mj].[trgUpdateUserNotification]
ON [__mj].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserNotification]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserNotification] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateUserViewCategory] on [__mj].[UserViewCategory]'
GO

ALTER TRIGGER [__mj].[trgUpdateUserViewCategory]
ON [__mj].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewCategory] AS _organicTable
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
PRINT N'Altering trigger [__mj].[trgUpdateVectorDatabase] on [__mj].[VectorDatabase]'
GO

ALTER TRIGGER [__mj].[trgUpdateVectorDatabase]
ON [__mj].[VectorDatabase]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorDatabase]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VectorDatabase] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateVectorIndex] on [__mj].[VectorIndex]'
GO

ALTER TRIGGER [__mj].[trgUpdateVectorIndex]
ON [__mj].[VectorIndex]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VectorIndex] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateVersionInstallation] on [__mj].[VersionInstallation]'
GO

ALTER TRIGGER [__mj].[trgUpdateVersionInstallation]
ON [__mj].[VersionInstallation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VersionInstallation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VersionInstallation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateWorkflowEngine] on [__mj].[WorkflowEngine]'
GO

ALTER TRIGGER [__mj].[trgUpdateWorkflowEngine]
ON [__mj].[WorkflowEngine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowEngine]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkflowEngine] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateWorkflow] on [__mj].[Workflow]'
GO

ALTER TRIGGER [__mj].[trgUpdateWorkflow]
ON [__mj].[Workflow]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workflow]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Workflow] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateWorkspaceItem] on [__mj].[WorkspaceItem]'
GO

ALTER TRIGGER [__mj].[trgUpdateWorkspaceItem]
ON [__mj].[WorkspaceItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkspaceItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkspaceItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering trigger [__mj].[trgUpdateWorkspace] on [__mj].[Workspace]'
GO

ALTER TRIGGER [__mj].[trgUpdateWorkspace]
ON [__mj].[Workspace]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workspace]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Workspace] AS _organicTable
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the result code is a success or not. It is possible an action might have more than one failure condition/result code and same for success conditions.', 'SCHEMA', N'__mj', 'TABLE', N'ActionResultCode', 'COLUMN', N'IsSuccess'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, Code will never be generated by the AI system. This overrides all other settings including the ForceCodeGeneration bit', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeLocked'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Generated or Custom. Generated means the UserPrompt is used to prompt an AI model to automatically create the code for the Action. Custom means that a custom class has been implemented that subclasses the BaseAction class. The custom class needs to use the @RegisterClass decorator and be included in the MJAPI (or other runtime environment) to be available for execution.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Stores paramater mappings to enable Entity Actions to automatically invoke Actions', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Additional comments regarding the parameter.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'Comments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value of the parameter, used only when ValueType is Static or Script. When value is Script, any valid JavaScript code can be provided. The script will have access to an object called EntityActionContext. This object will have a property called EntityObject on it that will contain the BaseEntity derived sub-class with the current data for the entity object this action is operating against. The script must provide the parameter value to the EntityActionContext.result property. This scripting capabilty is designed for very small and simple code, for anything of meaningful complexity, create a sub-class instead.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'Value'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the value, which can be Static, Entity Object, or Script.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'ValueType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When another entity links to this entity with a foreign key, this is the default component type that will be used in the UI. CodeGen will populate the RelatedEntityDisplayType column in the Entity Fields entity with whatever is provided here whenever a new foreign key is detected by CodeGen. The selection can be overridden on a per-foreign-key basis in each row of the Entity Fields entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'RelationshipDefaultDisplayType'
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
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
PRINT N'Altering permissions on  [__mj].[spDeleteEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionParam] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[vwEntityActionParams]'
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_UI]
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
