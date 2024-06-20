/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.7.x
   TO:   1.8.x
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

PRINT(N'Drop constraints from [__mj].[Query]')
ALTER TABLE [__mj].[Query] NOCHECK CONSTRAINT [FK_Query_QueryCategory]

PRINT(N'Drop constraint FK_DataContextItem_Query from [__mj].[DataContextItem]')
ALTER TABLE [__mj].[DataContextItem] NOCHECK CONSTRAINT [FK_DataContextItem_Query]

PRINT(N'Drop constraint FK_QueryField_Query from [__mj].[QueryField]')
ALTER TABLE [__mj].[QueryField] NOCHECK CONSTRAINT [FK_QueryField_Query]

PRINT(N'Drop constraint FK_QueryPermission_Query from [__mj].[QueryPermission]')
ALTER TABLE [__mj].[QueryPermission] NOCHECK CONSTRAINT [FK_QueryPermission_Query]

PRINT(N'Drop constraints from [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_EntityRelationshipDisplayComponent]
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Drop constraints from [__mj].[UserView]')
ALTER TABLE [__mj].[UserView] NOCHECK CONSTRAINT [FK_UserView_Entity]
ALTER TABLE [__mj].[UserView] NOCHECK CONSTRAINT [FK_UserView_User]
ALTER TABLE [__mj].[UserView] NOCHECK CONSTRAINT [FK_UserView_UserViewCategory]

PRINT(N'Drop constraint FK_DataContextItem_UserView from [__mj].[DataContextItem]')
ALTER TABLE [__mj].[DataContextItem] NOCHECK CONSTRAINT [FK_DataContextItem_UserView]

PRINT(N'Drop constraint FK_UserViewRun_UserView from [__mj].[UserViewRun]')
ALTER TABLE [__mj].[UserViewRun] NOCHECK CONSTRAINT [FK_UserViewRun_UserView]

PRINT(N'Drop constraints from [__mj].[UserRole]')
ALTER TABLE [__mj].[UserRole] NOCHECK CONSTRAINT [FK_UserRole_RoleName]
ALTER TABLE [__mj].[UserRole] NOCHECK CONSTRAINT [FK_UserRole_User]

PRINT(N'Drop constraints from [__mj].[QueryCategory]')
ALTER TABLE [__mj].[QueryCategory] NOCHECK CONSTRAINT [FK_QueryCategory_QueryCategory]
ALTER TABLE [__mj].[QueryCategory] NOCHECK CONSTRAINT [FK_QueryCategory_User]

PRINT(N'Drop constraints from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Drop constraints from [__mj].[User]')
ALTER TABLE [__mj].[User] NOCHECK CONSTRAINT [FK_User_Employee]
ALTER TABLE [__mj].[User] NOCHECK CONSTRAINT [FK_User_LinkedEntity]

PRINT(N'Drop constraint FK__Action__CodeAppr__7B00556C from [__mj].[Action]')
ALTER TABLE [__mj].[Action] NOCHECK CONSTRAINT [FK__Action__CodeAppr__7B00556C]

PRINT(N'Drop constraint FK__ActionExe__UserI__3CCE18C9 from [__mj].[ActionExecutionLog]')
ALTER TABLE [__mj].[ActionExecutionLog] NOCHECK CONSTRAINT [FK__ActionExe__UserI__3CCE18C9]

PRINT(N'Drop constraint FK_AuditLog_User from [__mj].[AuditLog]')
ALTER TABLE [__mj].[AuditLog] NOCHECK CONSTRAINT [FK_AuditLog_User]

PRINT(N'Drop constraint FK__Communica__UserI__7FA83C54 from [__mj].[CommunicationRun]')
ALTER TABLE [__mj].[CommunicationRun] NOCHECK CONSTRAINT [FK__Communica__UserI__7FA83C54]

PRINT(N'Drop constraint FK_CompanyIntegrationRun_User from [__mj].[CompanyIntegrationRun]')
ALTER TABLE [__mj].[CompanyIntegrationRun] NOCHECK CONSTRAINT [FK_CompanyIntegrationRun_User]

PRINT(N'Drop constraint FK__Conversat__UserI__0429019C from [__mj].[Conversation]')
ALTER TABLE [__mj].[Conversation] NOCHECK CONSTRAINT [FK__Conversat__UserI__0429019C]

PRINT(N'Drop constraint FK__Dashboard__UserI__343EFBB6 from [__mj].[Dashboard]')
ALTER TABLE [__mj].[Dashboard] NOCHECK CONSTRAINT [FK__Dashboard__UserI__343EFBB6]

PRINT(N'Drop constraint FK_DashboardCategory_User from [__mj].[DashboardCategory]')
ALTER TABLE [__mj].[DashboardCategory] NOCHECK CONSTRAINT [FK_DashboardCategory_User]

PRINT(N'Drop constraint FK_DataContext_User from [__mj].[DataContext]')
ALTER TABLE [__mj].[DataContext] NOCHECK CONSTRAINT [FK_DataContext_User]

PRINT(N'Drop constraint FK_DuplicateRun_ApprovedByUserID from [__mj].[DuplicateRun]')
ALTER TABLE [__mj].[DuplicateRun] NOCHECK CONSTRAINT [FK_DuplicateRun_ApprovedByUserID]

PRINT(N'Drop constraint FK_DuplicateRun_User from [__mj].[DuplicateRun]')
ALTER TABLE [__mj].[DuplicateRun] NOCHECK CONSTRAINT [FK_DuplicateRun_User]

PRINT(N'Drop constraint FK_List_User from [__mj].[List]')
ALTER TABLE [__mj].[List] NOCHECK CONSTRAINT [FK_List_User]

PRINT(N'Drop constraint FK_RecommendationRun_User from [__mj].[RecommendationRun]')
ALTER TABLE [__mj].[RecommendationRun] NOCHECK CONSTRAINT [FK_RecommendationRun_User]

PRINT(N'Drop constraint FK_RecordChange_UserID from [__mj].[RecordChange]')
ALTER TABLE [__mj].[RecordChange] NOCHECK CONSTRAINT [FK_RecordChange_UserID]

PRINT(N'Drop constraint FK__RecordCha__UserI__355E3A42 from [__mj].[RecordChangeReplayRun]')
ALTER TABLE [__mj].[RecordChangeReplayRun] NOCHECK CONSTRAINT [FK__RecordCha__UserI__355E3A42]

PRINT(N'Drop constraint FK_RecordMergeLog_User from [__mj].[RecordMergeLog]')
ALTER TABLE [__mj].[RecordMergeLog] NOCHECK CONSTRAINT [FK_RecordMergeLog_User]

PRINT(N'Drop constraint FK__Report__UserID__5F2959BB from [__mj].[Report]')
ALTER TABLE [__mj].[Report] NOCHECK CONSTRAINT [FK__Report__UserID__5F2959BB]

PRINT(N'Drop constraint FK_ReportCategory_User from [__mj].[ReportCategory]')
ALTER TABLE [__mj].[ReportCategory] NOCHECK CONSTRAINT [FK_ReportCategory_User]

PRINT(N'Drop constraint FK__ReportSna__UserI__6BB324E4 from [__mj].[ReportSnapshot]')
ALTER TABLE [__mj].[ReportSnapshot] NOCHECK CONSTRAINT [FK__ReportSna__UserI__6BB324E4]

PRINT(N'Drop constraint FK__Template__UserID__6D3551B5 from [__mj].[Template]')
ALTER TABLE [__mj].[Template] NOCHECK CONSTRAINT [FK__Template__UserID__6D3551B5]

PRINT(N'Drop constraint FK__TemplateC__UserI__677C785F from [__mj].[TemplateCategory]')
ALTER TABLE [__mj].[TemplateCategory] NOCHECK CONSTRAINT [FK__TemplateC__UserI__677C785F]

PRINT(N'Drop constraint FK_UserApplication_User from [__mj].[UserApplication]')
ALTER TABLE [__mj].[UserApplication] NOCHECK CONSTRAINT [FK_UserApplication_User]

PRINT(N'Drop constraint FK_UserFavorite_ApplicationUser from [__mj].[UserFavorite]')
ALTER TABLE [__mj].[UserFavorite] NOCHECK CONSTRAINT [FK_UserFavorite_ApplicationUser]

PRINT(N'Drop constraint FK_UserNotification_User from [__mj].[UserNotification]')
ALTER TABLE [__mj].[UserNotification] NOCHECK CONSTRAINT [FK_UserNotification_User]

PRINT(N'Drop constraint FK_UserRecordLog_User from [__mj].[UserRecordLog]')
ALTER TABLE [__mj].[UserRecordLog] NOCHECK CONSTRAINT [FK_UserRecordLog_User]

PRINT(N'Drop constraint FK_UserViewCategory_User from [__mj].[UserViewCategory]')
ALTER TABLE [__mj].[UserViewCategory] NOCHECK CONSTRAINT [FK_UserViewCategory_User]

PRINT(N'Drop constraint FK_UserViewRun_User from [__mj].[UserViewRun]')
ALTER TABLE [__mj].[UserViewRun] NOCHECK CONSTRAINT [FK_UserViewRun_User]

PRINT(N'Drop constraint FK__Workspace__UserI__057AB683 from [__mj].[Workspace]')
ALTER TABLE [__mj].[Workspace] NOCHECK CONSTRAINT [FK__Workspace__UserI__057AB683]

PRINT(N'Drop constraints from [__mj].[ResourceType]')
ALTER TABLE [__mj].[ResourceType] NOCHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]

PRINT(N'Drop constraint FK__Workspace__Resou__73305268 from [__mj].[WorkspaceItem]')
ALTER TABLE [__mj].[WorkspaceItem] NOCHECK CONSTRAINT [FK__Workspace__Resou__73305268]

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

PRINT(N'Drop constraints from [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_DatasetName]
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_Entity]

PRINT(N'Drop constraints from [__mj].[CommunicationProviderMessageType]')
ALTER TABLE [__mj].[CommunicationProviderMessageType] NOCHECK CONSTRAINT [FK__Communica__Commu__7342656F]
ALTER TABLE [__mj].[CommunicationProviderMessageType] NOCHECK CONSTRAINT [FK__Communica__Commu__743689A8]

PRINT(N'Drop constraint FK__Communica__Commu__07495E1C from [__mj].[CommunicationLog]')
ALTER TABLE [__mj].[CommunicationLog] NOCHECK CONSTRAINT [FK__Communica__Commu__07495E1C]

PRINT(N'Drop constraints from [__mj].[AuditLogType]')
ALTER TABLE [__mj].[AuditLogType] NOCHECK CONSTRAINT [FK_AuditLogType_Authorization]
ALTER TABLE [__mj].[AuditLogType] NOCHECK CONSTRAINT [FK_AuditLogType_ParentID]

PRINT(N'Drop constraint FK_AuditLog_AuditLogType from [__mj].[AuditLog]')
ALTER TABLE [__mj].[AuditLog] NOCHECK CONSTRAINT [FK_AuditLog_AuditLogType]

PRINT(N'Drop constraints from [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_Entity]

PRINT(N'Drop constraint FK__TemplateC__TypeI__384D5381 from [__mj].[TemplateContent]')
ALTER TABLE [__mj].[TemplateContent] NOCHECK CONSTRAINT [FK__TemplateC__TypeI__384D5381]

PRINT(N'Drop constraint FK_AuthorizationRole_Role1 from [__mj].[AuthorizationRole]')
ALTER TABLE [__mj].[AuthorizationRole] NOCHECK CONSTRAINT [FK_AuthorizationRole_Role1]

PRINT(N'Drop constraint FK__EmployeeR__RoleI__74794A92 from [__mj].[EmployeeRole]')
ALTER TABLE [__mj].[EmployeeRole] NOCHECK CONSTRAINT [FK__EmployeeR__RoleI__74794A92]

PRINT(N'Drop constraint FK_QueryPermission_Role from [__mj].[QueryPermission]')
ALTER TABLE [__mj].[QueryPermission] NOCHECK CONSTRAINT [FK_QueryPermission_Role]

PRINT(N'Drop constraint FK_EntityDocument_EntityDocumentType from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_EntityDocumentType]

PRINT(N'Drop constraint FK_EntityBehavior_EntityBehaviorType from [__mj].[EntityBehavior]')
ALTER TABLE [__mj].[EntityBehavior] NOCHECK CONSTRAINT [FK_EntityBehavior_EntityBehaviorType]

PRINT(N'Drop constraint FK__EntityAct__Invoc__36211B3A from [__mj].[EntityActionInvocation]')
ALTER TABLE [__mj].[EntityActionInvocation] NOCHECK CONSTRAINT [FK__EntityAct__Invoc__36211B3A]

PRINT(N'Drop constraints from [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] NOCHECK CONSTRAINT [FK_Entity_Entity]

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

PRINT(N'Drop constraint FK_DuplicateRun_Entity from [__mj].[DuplicateRun]')
ALTER TABLE [__mj].[DuplicateRun] NOCHECK CONSTRAINT [FK_DuplicateRun_Entity]

PRINT(N'Drop constraint FK__EntityAct__Entit__221A228D from [__mj].[EntityAction]')
ALTER TABLE [__mj].[EntityAction] NOCHECK CONSTRAINT [FK__EntityAct__Entit__221A228D]

PRINT(N'Drop constraint FK_EntityAIAction_Entity from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity]

PRINT(N'Drop constraint FK_EntityAIAction_Entity1 from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity1]

PRINT(N'Drop constraint FK_EntityBehavior_Entity from [__mj].[EntityBehavior]')
ALTER TABLE [__mj].[EntityBehavior] NOCHECK CONSTRAINT [FK_EntityBehavior_Entity]

PRINT(N'Drop constraint FK__EntityCom__Entit__39823A33 from [__mj].[EntityCommunicationMessageType]')
ALTER TABLE [__mj].[EntityCommunicationMessageType] NOCHECK CONSTRAINT [FK__EntityCom__Entit__39823A33]

PRINT(N'Drop constraint FK_EntityDocument_Entity from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_Entity]

PRINT(N'Drop constraint FK_EntityRecordDocument_Entity from [__mj].[EntityRecordDocument]')
ALTER TABLE [__mj].[EntityRecordDocument] NOCHECK CONSTRAINT [FK_EntityRecordDocument_Entity]

PRINT(N'Drop constraint FK_EntitySetting_Entity from [__mj].[EntitySetting]')
ALTER TABLE [__mj].[EntitySetting] NOCHECK CONSTRAINT [FK_EntitySetting_Entity]

PRINT(N'Drop constraint FK_FileEntityRecordLink_Entity from [__mj].[FileEntityRecordLink]')
ALTER TABLE [__mj].[FileEntityRecordLink] NOCHECK CONSTRAINT [FK_FileEntityRecordLink_Entity]

PRINT(N'Drop constraint FK_IntegrationURLFormat_Entity from [__mj].[IntegrationURLFormat]')
ALTER TABLE [__mj].[IntegrationURLFormat] NOCHECK CONSTRAINT [FK_IntegrationURLFormat_Entity]

PRINT(N'Drop constraint FK_List_Entity from [__mj].[List]')
ALTER TABLE [__mj].[List] NOCHECK CONSTRAINT [FK_List_Entity]

PRINT(N'Drop constraint FK_QueryField_SourceEntity from [__mj].[QueryField]')
ALTER TABLE [__mj].[QueryField] NOCHECK CONSTRAINT [FK_QueryField_SourceEntity]

PRINT(N'Drop constraint FK_Recommendation_SourceEntity from [__mj].[Recommendation]')
ALTER TABLE [__mj].[Recommendation] NOCHECK CONSTRAINT [FK_Recommendation_SourceEntity]

PRINT(N'Drop constraint FK_RecommendationItem_DestinationEntity from [__mj].[RecommendationItem]')
ALTER TABLE [__mj].[RecommendationItem] NOCHECK CONSTRAINT [FK_RecommendationItem_DestinationEntity]

PRINT(N'Drop constraint FK_RecordChange_EntityID from [__mj].[RecordChange]')
ALTER TABLE [__mj].[RecordChange] NOCHECK CONSTRAINT [FK_RecordChange_EntityID]

PRINT(N'Drop constraint FK_RecordMergeLog_Entity from [__mj].[RecordMergeLog]')
ALTER TABLE [__mj].[RecordMergeLog] NOCHECK CONSTRAINT [FK_RecordMergeLog_Entity]

PRINT(N'Drop constraint FK_SystemEvent_Entity from [__mj].[SystemEvent]')
ALTER TABLE [__mj].[SystemEvent] NOCHECK CONSTRAINT [FK_SystemEvent_Entity]

PRINT(N'Drop constraint FK_TaggedItem_Entity from [__mj].[TaggedItem]')
ALTER TABLE [__mj].[TaggedItem] NOCHECK CONSTRAINT [FK_TaggedItem_Entity]

PRINT(N'Drop constraint FK__TemplateP__Entit__4F30B8D9 from [__mj].[TemplateParam]')
ALTER TABLE [__mj].[TemplateParam] NOCHECK CONSTRAINT [FK__TemplateP__Entit__4F30B8D9]

PRINT(N'Drop constraint FK_UserApplicationEntity_Entity from [__mj].[UserApplicationEntity]')
ALTER TABLE [__mj].[UserApplicationEntity] NOCHECK CONSTRAINT [FK_UserApplicationEntity_Entity]

PRINT(N'Drop constraint FK_UserFavorite_Entity from [__mj].[UserFavorite]')
ALTER TABLE [__mj].[UserFavorite] NOCHECK CONSTRAINT [FK_UserFavorite_Entity]

PRINT(N'Drop constraint FK_UserRecordLog_Entity from [__mj].[UserRecordLog]')
ALTER TABLE [__mj].[UserRecordLog] NOCHECK CONSTRAINT [FK_UserRecordLog_Entity]

PRINT(N'Drop constraint FK_UserViewCategory_Entity from [__mj].[UserViewCategory]')
ALTER TABLE [__mj].[UserViewCategory] NOCHECK CONSTRAINT [FK_UserViewCategory_Entity]

PRINT(N'Drop constraint FK__EntityCom__BaseM__3A765E6C from [__mj].[EntityCommunicationMessageType]')
ALTER TABLE [__mj].[EntityCommunicationMessageType] NOCHECK CONSTRAINT [FK__EntityCom__BaseM__3A765E6C]

PRINT(N'Drop constraints from [__mj].[Authorization]')
ALTER TABLE [__mj].[Authorization] NOCHECK CONSTRAINT [FK_Authorization_Parent]

PRINT(N'Drop constraint FK_ActionAuthorization_Authorization from [__mj].[ActionAuthorization]')
ALTER TABLE [__mj].[ActionAuthorization] NOCHECK CONSTRAINT [FK_ActionAuthorization_Authorization]

PRINT(N'Drop constraint FK_AuditLog_Authorization from [__mj].[AuditLog]')
ALTER TABLE [__mj].[AuditLog] NOCHECK CONSTRAINT [FK_AuditLog_Authorization]

PRINT(N'Drop constraint FK_AuthorizationRole_Authorization1 from [__mj].[AuthorizationRole]')
ALTER TABLE [__mj].[AuthorizationRole] NOCHECK CONSTRAINT [FK_AuthorizationRole_Authorization1]

PRINT(N'Drop constraint FK_ApplicationSetting_Application from [__mj].[ApplicationSetting]')
ALTER TABLE [__mj].[ApplicationSetting] NOCHECK CONSTRAINT [FK_ApplicationSetting_Application]

PRINT(N'Drop constraint FK_UserApplication_Application from [__mj].[UserApplication]')
ALTER TABLE [__mj].[UserApplication] NOCHECK CONSTRAINT [FK_UserApplication_Application]

PRINT(N'Drop constraints from [__mj].[ActionCategory]')
ALTER TABLE [__mj].[ActionCategory] NOCHECK CONSTRAINT [FK__ActionCat__Paren__7176EB32]

PRINT(N'Drop constraint FK__Action__Category__7A0C3133 from [__mj].[Action]')
ALTER TABLE [__mj].[Action] NOCHECK CONSTRAINT [FK__Action__Category__7A0C3133]

PRINT(N'Delete rows from [__mj].[EntityField]')
DELETE FROM [__mj].[EntityField] WHERE [ID] = 412
DELETE FROM [__mj].[EntityField] WHERE [ID] = 413
DELETE FROM [__mj].[EntityField] WHERE [ID] = 416
DELETE FROM [__mj].[EntityField] WHERE [ID] = 417
DELETE FROM [__mj].[EntityField] WHERE [ID] = 540
DELETE FROM [__mj].[EntityField] WHERE [ID] = 541
DELETE FROM [__mj].[EntityField] WHERE [ID] = 552
DELETE FROM [__mj].[EntityField] WHERE [ID] = 553
DELETE FROM [__mj].[EntityField] WHERE [ID] = 589
DELETE FROM [__mj].[EntityField] WHERE [ID] = 590
DELETE FROM [__mj].[EntityField] WHERE [ID] = 765
DELETE FROM [__mj].[EntityField] WHERE [ID] = 766
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1255
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1256
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1264
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1434
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1435
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1504
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1505
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1576
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1577
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1578
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1579
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1580
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1581
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1582
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1583
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1588
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1642
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1643
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1653
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1654
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1684
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1685
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1686
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1687
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1701
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1702
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1714
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1715
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1723
DELETE FROM [__mj].[EntityField] WHERE [ID] = 1724
DELETE FROM [__mj].[EntityField] WHERE [ID] = 2519
DELETE FROM [__mj].[EntityField] WHERE [ID] = 2520
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3088
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3089
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3233
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3234
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3244
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3245
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3253
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3254
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3258
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3259
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3472
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3473
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3479
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3480
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3496
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3497
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3504
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3505
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3701
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3702
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3708
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3709
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3743
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3750
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3751
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3755
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3756
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3762
DELETE FROM [__mj].[EntityField] WHERE [ID] = 3763
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7863
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7864
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7877
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7878
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7883
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7884
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7894
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7895
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7908
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7909
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7915
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7916
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7930
DELETE FROM [__mj].[EntityField] WHERE [ID] = 7931
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8001
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8004
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8005
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8169
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8170
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8178
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8179
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8192
PRINT(N'Operation applied to 95 rows out of 95')

PRINT(N'Delete row from [__mj].[VersionInstallation]')
DELETE FROM [__mj].[VersionInstallation] WHERE [ID] = 13

PRINT(N'Update row in [__mj].[Query]')
UPDATE [__mj].[Query] SET [__mj_CreatedAt]='2024-02-02 18:51:47.5833333 +00:00', [__mj_UpdatedAt]='2024-02-03 06:02:38.0266667 +00:00' WHERE [ID] = 2

PRINT(N'Update rows in [__mj].[EntityRelationship]')
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 9
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 10
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 23
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 25
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 26
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 27
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 28
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 29
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 31
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-05 15:46:22.2000000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 32
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-16 02:37:52.8433333 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 33
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-29 19:33:46.5600000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 34
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-04-29 19:34:48.7933333 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 35
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-05-15 20:00:24.6233333 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 36
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-05-30 20:27:08.1100000 +00:00', [__mj_UpdatedAt]='2023-09-14 03:53:29.3366667 +00:00' WHERE [ID] = 42
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:31.8500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:31.8500000 +00:00' WHERE [ID] = 43
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:32.0466667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:32.0466667 +00:00' WHERE [ID] = 44
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:32.3433333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:32.3433333 +00:00' WHERE [ID] = 45
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:32.5400000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:32.5400000 +00:00' WHERE [ID] = 46
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:32.7366667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:32.7366667 +00:00' WHERE [ID] = 47
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:32.9333333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:32.9333333 +00:00' WHERE [ID] = 48
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:33.1300000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:33.1300000 +00:00' WHERE [ID] = 49
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:33.3333333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:33.3333333 +00:00' WHERE [ID] = 50
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:33.5333333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:33.5333333 +00:00' WHERE [ID] = 51
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:33.7300000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:33.7300000 +00:00' WHERE [ID] = 52
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:33.9300000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:33.9300000 +00:00' WHERE [ID] = 53
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:34.2266667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:34.2266667 +00:00' WHERE [ID] = 54
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:34.4266667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:34.4266667 +00:00' WHERE [ID] = 55
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:34.6266667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:34.6266667 +00:00' WHERE [ID] = 56
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:35.0100000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:35.0100000 +00:00' WHERE [ID] = 57
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:35.2100000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:35.2100000 +00:00' WHERE [ID] = 58
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:35.4066667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:35.4066667 +00:00' WHERE [ID] = 59
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:35.8066667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:35.8066667 +00:00' WHERE [ID] = 60
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:36.1033333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:36.1033333 +00:00' WHERE [ID] = 61
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:36.3033333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:36.3033333 +00:00' WHERE [ID] = 62
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:36.5966667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:36.5966667 +00:00' WHERE [ID] = 63
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:36.8866667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:36.8866667 +00:00' WHERE [ID] = 64
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:37.0833333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:37.0833333 +00:00' WHERE [ID] = 65
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:37.2766667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:37.2766667 +00:00' WHERE [ID] = 66
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:37.4766667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:37.4766667 +00:00' WHERE [ID] = 67
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:37.8600000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:37.8600000 +00:00' WHERE [ID] = 68
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:38.0566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:38.0566667 +00:00' WHERE [ID] = 69
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:38.2566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:38.2566667 +00:00' WHERE [ID] = 70
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:38.4500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:38.4500000 +00:00' WHERE [ID] = 71
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:38.6533333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:38.6533333 +00:00' WHERE [ID] = 72
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:38.8766667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:38.8766667 +00:00' WHERE [ID] = 73
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:39.0733333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:39.0733333 +00:00' WHERE [ID] = 74
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:39.2700000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:39.2700000 +00:00' WHERE [ID] = 75
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:39.4766667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:39.4766667 +00:00' WHERE [ID] = 76
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:39.6800000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:39.6800000 +00:00' WHERE [ID] = 77
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:39.9666667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:39.9666667 +00:00' WHERE [ID] = 78
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:40.2566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:40.2566667 +00:00' WHERE [ID] = 79
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:40.4533333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:40.4533333 +00:00' WHERE [ID] = 80
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:40.6500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:40.6500000 +00:00' WHERE [ID] = 81
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:40.8566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:40.8566667 +00:00' WHERE [ID] = 82
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:41.0566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:41.0566667 +00:00' WHERE [ID] = 83
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:41.2500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:41.2500000 +00:00' WHERE [ID] = 84
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:41.6500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:41.6500000 +00:00' WHERE [ID] = 86
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:41.8533333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:41.8533333 +00:00' WHERE [ID] = 87
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:42.0533333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:42.0533333 +00:00' WHERE [ID] = 88
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:42.2533333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:42.2533333 +00:00' WHERE [ID] = 89
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:42.4500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:42.4500000 +00:00' WHERE [ID] = 90
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:42.6500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:42.6500000 +00:00' WHERE [ID] = 91
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:42.8466667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:42.8466667 +00:00' WHERE [ID] = 92
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:43.4300000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:43.4300000 +00:00' WHERE [ID] = 93
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:43.6333333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:43.6333333 +00:00' WHERE [ID] = 94
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:43.8300000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:43.8300000 +00:00' WHERE [ID] = 95
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:44.0266667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:44.0266667 +00:00' WHERE [ID] = 96
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:44.5100000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:44.5100000 +00:00' WHERE [ID] = 97
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:44.7100000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:44.7100000 +00:00' WHERE [ID] = 98
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:44.9066667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:44.9066667 +00:00' WHERE [ID] = 99
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:45.2066667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:45.2066667 +00:00' WHERE [ID] = 100
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:45.4033333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:45.4033333 +00:00' WHERE [ID] = 101
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:45.6033333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:45.6033333 +00:00' WHERE [ID] = 102
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:45.8033333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:45.8033333 +00:00' WHERE [ID] = 103
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:45.9933333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:45.9933333 +00:00' WHERE [ID] = 104
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:46.1933333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:46.1933333 +00:00' WHERE [ID] = 105
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:46.3900000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:46.3900000 +00:00' WHERE [ID] = 106
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:46.5866667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:46.5866667 +00:00' WHERE [ID] = 107
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:46.7800000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:46.7800000 +00:00' WHERE [ID] = 108
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:46.9766667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:46.9766667 +00:00' WHERE [ID] = 109
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:47.1700000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:47.1700000 +00:00' WHERE [ID] = 110
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:47.3633333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:47.3633333 +00:00' WHERE [ID] = 111
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:47.5633333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:47.5633333 +00:00' WHERE [ID] = 112
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:47.8566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:47.8566667 +00:00' WHERE [ID] = 113
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:48.0566667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:48.0566667 +00:00' WHERE [ID] = 114
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:48.4500000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:48.4500000 +00:00' WHERE [ID] = 116
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:48.6466667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:48.6466667 +00:00' WHERE [ID] = 117
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:48.8400000 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:48.8400000 +00:00' WHERE [ID] = 118
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:49.0366667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:49.0366667 +00:00' WHERE [ID] = 119
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:49.2333333 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:49.2333333 +00:00' WHERE [ID] = 120
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:49.4366667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:49.4366667 +00:00' WHERE [ID] = 121
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-29 01:51:49.6366667 +00:00', [__mj_UpdatedAt]='2023-09-29 01:51:49.6366667 +00:00' WHERE [ID] = 122
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-30 22:23:35.5766667 +00:00', [__mj_UpdatedAt]='2023-09-30 22:23:35.5766667 +00:00' WHERE [ID] = 124
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-09-30 22:23:36.1966667 +00:00', [__mj_UpdatedAt]='2023-09-30 22:23:36.1966667 +00:00' WHERE [ID] = 125
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-10-26 21:31:58.7600000 +00:00', [__mj_UpdatedAt]='2023-10-26 21:31:58.7600000 +00:00' WHERE [ID] = 126
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-10-26 21:32:02.7600000 +00:00', [__mj_UpdatedAt]='2023-10-26 21:32:02.7600000 +00:00' WHERE [ID] = 127
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2023-10-26 21:32:08.3966667 +00:00', [__mj_UpdatedAt]='2023-10-26 21:32:08.3966667 +00:00' WHERE [ID] = 128
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-01-15 02:01:11.0966667 +00:00', [__mj_UpdatedAt]='2024-01-15 02:01:11.0966667 +00:00' WHERE [ID] = 129
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 15:49:12.2733333 +00:00', [__mj_UpdatedAt]='2024-02-02 15:49:12.2733333 +00:00' WHERE [ID] = 134
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 15:49:33.1066667 +00:00', [__mj_UpdatedAt]='2024-02-02 15:49:33.1066667 +00:00' WHERE [ID] = 135
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 15:49:33.5000000 +00:00', [__mj_UpdatedAt]='2024-02-02 15:49:33.5000000 +00:00' WHERE [ID] = 136
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 15:49:34.3100000 +00:00', [__mj_UpdatedAt]='2024-02-02 15:49:34.3100000 +00:00' WHERE [ID] = 137
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 20:11:53.8600000 +00:00', [__mj_UpdatedAt]='2024-02-02 20:11:53.8600000 +00:00' WHERE [ID] = 138
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-02 20:12:12.0900000 +00:00', [__mj_UpdatedAt]='2024-02-02 20:12:12.0900000 +00:00' WHERE [ID] = 139
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-05 03:04:28.1666667 +00:00', [__mj_UpdatedAt]='2024-02-05 03:04:28.1666667 +00:00' WHERE [ID] = 140
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-09 02:05:33.1700000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:05:33.1700000 +00:00' WHERE [ID] = 162
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-09 02:05:37.2233333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:05:37.2233333 +00:00' WHERE [ID] = 163
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-09 02:05:38.8166667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:05:38.8166667 +00:00' WHERE [ID] = 164
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-09 02:05:38.9366667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:05:38.9366667 +00:00' WHERE [ID] = 165
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-09 02:05:39.0600000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:05:39.0600000 +00:00' WHERE [ID] = 166
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-13 23:18:30.2833333 +00:00', [__mj_UpdatedAt]='2024-02-13 23:18:30.2833333 +00:00' WHERE [ID] = 169
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-13 23:18:38.2766667 +00:00', [__mj_UpdatedAt]='2024-02-13 23:18:38.2766667 +00:00' WHERE [ID] = 170
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-14 14:28:37.1166667 +00:00', [__mj_UpdatedAt]='2024-02-14 14:28:37.1166667 +00:00' WHERE [ID] = 171
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-14 14:28:40.2900000 +00:00', [__mj_UpdatedAt]='2024-02-14 14:28:40.2900000 +00:00' WHERE [ID] = 172
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-14 14:28:47.7366667 +00:00', [__mj_UpdatedAt]='2024-02-14 14:28:47.7366667 +00:00' WHERE [ID] = 173
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:14.9633333 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:14.9633333 +00:00' WHERE [ID] = 174
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.0900000 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.0900000 +00:00' WHERE [ID] = 175
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.2100000 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.2100000 +00:00' WHERE [ID] = 176
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.3366667 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.3366667 +00:00' WHERE [ID] = 177
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.4600000 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.4600000 +00:00' WHERE [ID] = 178
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.5866667 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.5866667 +00:00' WHERE [ID] = 179
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-02-20 23:28:15.7100000 +00:00', [__mj_UpdatedAt]='2024-02-20 23:28:15.7100000 +00:00' WHERE [ID] = 180
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-08 02:03:40.7066667 +00:00', [__mj_UpdatedAt]='2024-03-08 02:03:40.7066667 +00:00' WHERE [ID] = 181
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-08 02:03:41.0700000 +00:00', [__mj_UpdatedAt]='2024-03-08 02:03:41.0700000 +00:00' WHERE [ID] = 182
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-16 22:22:55.5333333 +00:00', [__mj_UpdatedAt]='2024-03-16 22:22:55.5333333 +00:00' WHERE [ID] = 183
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-16 22:23:00.7200000 +00:00', [__mj_UpdatedAt]='2024-03-16 22:23:00.7200000 +00:00' WHERE [ID] = 184
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-16 22:23:00.8433333 +00:00', [__mj_UpdatedAt]='2024-03-16 22:23:00.8433333 +00:00' WHERE [ID] = 185
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-16 22:23:00.9700000 +00:00', [__mj_UpdatedAt]='2024-03-16 22:23:00.9700000 +00:00' WHERE [ID] = 186
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-16 22:23:01.0933333 +00:00', [__mj_UpdatedAt]='2024-03-16 22:23:01.0933333 +00:00' WHERE [ID] = 187
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-03-31 02:56:08.3333333 +00:00', [__mj_UpdatedAt]='2024-03-31 02:56:08.3333333 +00:00' WHERE [ID] = 188
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-03 22:29:41.0733333 +00:00', [__mj_UpdatedAt]='2024-04-03 22:29:41.0733333 +00:00' WHERE [ID] = 189
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-03 22:29:41.2500000 +00:00', [__mj_UpdatedAt]='2024-04-03 22:29:41.2500000 +00:00' WHERE [ID] = 190
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-03 22:29:41.3733333 +00:00', [__mj_UpdatedAt]='2024-04-03 22:29:41.3733333 +00:00' WHERE [ID] = 191
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-03 22:29:41.8666667 +00:00', [__mj_UpdatedAt]='2024-04-03 22:29:41.8666667 +00:00' WHERE [ID] = 192
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-12 19:44:28.2300000 +00:00', [__mj_UpdatedAt]='2024-04-12 19:44:28.2300000 +00:00' WHERE [ID] = 193
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-15 00:32:46.4800000 +00:00', [__mj_UpdatedAt]='2024-04-15 00:32:46.4800000 +00:00' WHERE [ID] = 194
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:11.6500000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:11.6500000 +00:00' WHERE [ID] = 195
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:11.7766667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:11.7766667 +00:00' WHERE [ID] = 196
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:12.0233333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:12.0233333 +00:00' WHERE [ID] = 197
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:14.1633333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:14.1633333 +00:00' WHERE [ID] = 198
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:15.3933333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:15.3933333 +00:00' WHERE [ID] = 199
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:16.6800000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:16.6800000 +00:00' WHERE [ID] = 200
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:17.3666667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:17.3666667 +00:00' WHERE [ID] = 201
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:18.2300000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:18.2300000 +00:00' WHERE [ID] = 202
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-04-30 17:15:18.3633333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:15:18.3633333 +00:00' WHERE [ID] = 203
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-22 20:48:18.4800000 +00:00', [__mj_UpdatedAt]='2024-05-22 20:48:18.4800000 +00:00' WHERE [ID] = 204
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-22 20:48:20.5733333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:48:20.5733333 +00:00' WHERE [ID] = 205
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-23 00:38:46.1533333 +00:00', [__mj_UpdatedAt]='2024-05-23 00:38:46.1533333 +00:00' WHERE [ID] = 207
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:29.4866667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:29.4866667 +00:00' WHERE [ID] = 241
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:29.6100000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:29.6100000 +00:00' WHERE [ID] = 242
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:29.7300000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:29.7300000 +00:00' WHERE [ID] = 243
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:33.0366667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:33.0366667 +00:00' WHERE [ID] = 244
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:36.4633333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:36.4633333 +00:00' WHERE [ID] = 245
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:36.5933333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:36.5933333 +00:00' WHERE [ID] = 246
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:36.7233333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:36.7233333 +00:00' WHERE [ID] = 247
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:36.8500000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:36.8500000 +00:00' WHERE [ID] = 248
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:36.9766667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:36.9766667 +00:00' WHERE [ID] = 249
UPDATE [__mj].[EntityRelationship] SET [Sequence]=6, [__mj_CreatedAt]='2024-05-25 22:52:37.1033333 +00:00', [__mj_UpdatedAt]='2024-06-01 00:15:40.2366667 +00:00' WHERE [ID] = 250
UPDATE [__mj].[EntityRelationship] SET [Sequence]=2, [__mj_CreatedAt]='2024-05-25 22:52:37.3566667 +00:00', [__mj_UpdatedAt]='2024-06-01 00:16:01.0633333 +00:00' WHERE [ID] = 252
UPDATE [__mj].[EntityRelationship] SET [Sequence]=3, [__mj_CreatedAt]='2024-05-25 22:52:37.4800000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:37.4800000 +00:00' WHERE [ID] = 253
UPDATE [__mj].[EntityRelationship] SET [Sequence]=4, [__mj_CreatedAt]='2024-05-25 22:52:37.7200000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:37.7200000 +00:00' WHERE [ID] = 255
UPDATE [__mj].[EntityRelationship] SET [Sequence]=5, [__mj_CreatedAt]='2024-05-25 22:52:37.8400000 +00:00', [__mj_UpdatedAt]='2024-06-01 00:16:28.7233333 +00:00' WHERE [ID] = 256
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:37.9600000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:37.9600000 +00:00' WHERE [ID] = 257
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-25 22:52:38.0800000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:52:38.0800000 +00:00' WHERE [ID] = 258
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-05-29 21:32:43.3400000 +00:00', [__mj_UpdatedAt]='2024-06-01 00:16:43.1100000 +00:00' WHERE [ID] = 259
UPDATE [__mj].[EntityRelationship] SET [Sequence]=1, [DisplayIconType]=N'Custom', [DisplayIcon]=N'fa-solid fa-book', [__mj_CreatedAt]='2024-05-31 17:01:19.0066667 +00:00', [__mj_UpdatedAt]='2024-06-01 00:16:54.0800000 +00:00' WHERE [ID] = 260
UPDATE [__mj].[EntityRelationship] SET [DisplayName]=N'Actions', [DisplayIconType]=N'Custom', [DisplayIcon]=N'fa-solid fa-bolt', [__mj_CreatedAt]='2024-05-31 17:01:19.3200000 +00:00', [__mj_UpdatedAt]='2024-05-31 17:01:19.3200000 +00:00' WHERE [ID] = 261
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-05 10:22:49.6866667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:22:49.6866667 +00:00' WHERE [ID] = 262
UPDATE [__mj].[EntityRelationship] SET [DisplayName]=N'Message Types', [DisplayComponentID]=2, [DisplayComponentConfiguration]=N'{ 
    "RowsEntityName": "Communication Base Message Types",
    "RowsEntityDisplayField": "Type",
    "RowsOrderBy": "Type",
    "RowsEntityDisplayName": "Base Type",
    "JoinEntityDisplayColumns": ["Name", "Status", "AdditionalAttributes"]}', [__mj_CreatedAt]='2024-06-05 10:22:57.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 01:40:22.8100000 +00:00' WHERE [ID] = 264
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-05 10:22:57.6200000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:22:57.6200000 +00:00' WHERE [ID] = 265
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-05 10:22:57.7633333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:22:57.7633333 +00:00' WHERE [ID] = 266
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-05 10:22:57.9066667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:22:57.9066667 +00:00' WHERE [ID] = 267
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-05 10:22:58.0433333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:22:58.0433333 +00:00' WHERE [ID] = 268
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 01:02:41.1133333 +00:00', [__mj_UpdatedAt]='2024-06-08 01:02:41.1133333 +00:00' WHERE [ID] = 276
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 01:02:41.2366667 +00:00', [__mj_UpdatedAt]='2024-06-08 01:02:41.2366667 +00:00' WHERE [ID] = 277
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 01:02:49.2500000 +00:00', [__mj_UpdatedAt]='2024-06-08 01:02:49.2500000 +00:00' WHERE [ID] = 278
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 01:02:49.3833333 +00:00', [__mj_UpdatedAt]='2024-06-08 01:02:49.3833333 +00:00' WHERE [ID] = 279
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 15:41:13.2933333 +00:00', [__mj_UpdatedAt]='2024-06-08 15:41:13.2933333 +00:00' WHERE [ID] = 280
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 15:41:21.4933333 +00:00', [__mj_UpdatedAt]='2024-06-08 15:41:21.4933333 +00:00' WHERE [ID] = 281
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 15:41:21.6166667 +00:00', [__mj_UpdatedAt]='2024-06-08 15:41:21.6166667 +00:00' WHERE [ID] = 282
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-08 15:41:21.8600000 +00:00', [__mj_UpdatedAt]='2024-06-08 15:41:21.8600000 +00:00' WHERE [ID] = 283
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:20:56.9300000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:20:56.9300000 +00:00' WHERE [ID] = 284
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:20:57.5366667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:20:57.5366667 +00:00' WHERE [ID] = 285
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:20:59.8666667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:20:59.8666667 +00:00' WHERE [ID] = 286
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:21:26.0400000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:21:26.0400000 +00:00' WHERE [ID] = 287
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:21:26.6900000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:21:26.6900000 +00:00' WHERE [ID] = 288
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 00:21:27.0300000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:21:27.0300000 +00:00' WHERE [ID] = 289
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 19:09:08.2666667 +00:00', [__mj_UpdatedAt]='2024-06-10 19:09:08.2666667 +00:00' WHERE [ID] = 290
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 19:09:25.8300000 +00:00', [__mj_UpdatedAt]='2024-06-10 19:09:25.8300000 +00:00' WHERE [ID] = 291
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-10 20:18:28.0833333 +00:00', [__mj_UpdatedAt]='2024-06-10 20:18:28.0833333 +00:00' WHERE [ID] = 292
UPDATE [__mj].[EntityRelationship] SET [__mj_CreatedAt]='2024-06-12 04:01:29.8166667 +00:00', [__mj_UpdatedAt]='2024-06-12 04:01:29.8166667 +00:00' WHERE [ID] = 293
PRINT(N'Operation applied to 192 rows out of 192')

PRINT(N'Update rows in [__mj].[UserView]')
UPDATE [__mj].[UserView] SET [__mj_CreatedAt]='2023-03-25 18:47:55.7933333 +00:00', [__mj_UpdatedAt]='2023-09-13 19:17:11.7500000 +00:00' WHERE [ID] = 85
UPDATE [__mj].[UserView] SET [__mj_CreatedAt]='2023-05-08 20:26:22.9466667 +00:00', [__mj_UpdatedAt]='2024-02-02 17:58:01.0800000 +00:00' WHERE [ID] = 97
UPDATE [__mj].[UserView] SET [__mj_CreatedAt]='2023-05-08 20:32:45.3166667 +00:00', [__mj_UpdatedAt]='2023-09-13 19:17:11.7500000 +00:00' WHERE [ID] = 99
UPDATE [__mj].[UserView] SET [__mj_CreatedAt]='2023-11-09 23:47:09.4866667 +00:00', [__mj_UpdatedAt]='2023-11-09 23:47:09.4866667 +00:00' WHERE [ID] = 105
UPDATE [__mj].[UserView] SET [__mj_CreatedAt]='2024-02-02 17:00:00.9000000 +00:00', [__mj_UpdatedAt]='2024-02-02 17:00:32.6100000 +00:00' WHERE [ID] = 117
PRINT(N'Operation applied to 5 rows out of 5')

PRINT(N'Update rows in [__mj].[UserRole]')
UPDATE [__mj].[UserRole] SET [__mj_CreatedAt]='2023-12-05 17:16:33.1900000 +00:00', [__mj_UpdatedAt]='2023-12-05 17:16:33.1900000 +00:00' WHERE [ID] = 18
UPDATE [__mj].[UserRole] SET [__mj_CreatedAt]='2024-03-18 01:12:10.5600000 +00:00', [__mj_UpdatedAt]='2024-03-18 01:12:10.5600000 +00:00' WHERE [ID] = 66
UPDATE [__mj].[UserRole] SET [__mj_CreatedAt]='2024-03-23 22:56:40.9400000 +00:00', [__mj_UpdatedAt]='2024-03-23 22:56:40.9400000 +00:00' WHERE [ID] = 77
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Update row in [__mj].[QueryCategory]')
UPDATE [__mj].[QueryCategory] SET [__mj_CreatedAt]='2024-02-02 18:51:42.1200000 +00:00', [__mj_UpdatedAt]='2024-02-02 18:51:42.1200000 +00:00' WHERE [ID] = 1

PRINT(N'Update rows in [__mj].[EntityFieldValue]')
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2023-05-01 20:46:07.0633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.2400000 +00:00' WHERE [ID] = 1
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2023-05-01 20:46:35.4900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.1766667 +00:00' WHERE [ID] = 2
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:02.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.9800000 +00:00' WHERE [ID] = 3
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:10.5200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.0400000 +00:00' WHERE [ID] = 4
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:15.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.1066667 +00:00' WHERE [ID] = 5
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:22.5066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.1700000 +00:00' WHERE [ID] = 6
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:31.7266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.2333333 +00:00' WHERE [ID] = 7
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 15:41:35.4433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.2966667 +00:00' WHERE [ID] = 8
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 16:04:11.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.2733333 +00:00' WHERE [ID] = 9
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 16:04:12.0300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.3366667 +00:00' WHERE [ID] = 10
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-30 16:04:12.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.4000000 +00:00' WHERE [ID] = 11
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:38.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:28.3400000 +00:00' WHERE [ID] = 12
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:38.3666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:28.2700000 +00:00' WHERE [ID] = 13
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:38.6466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.1300000 +00:00' WHERE [ID] = 14
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:38.7066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.0666667 +00:00' WHERE [ID] = 15
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:38.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.1933333 +00:00' WHERE [ID] = 16
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.0433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.1300000 +00:00' WHERE [ID] = 17
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.1033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.0500000 +00:00' WHERE [ID] = 18
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.9700000 +00:00' WHERE [ID] = 19
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.9066667 +00:00' WHERE [ID] = 20
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.2866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.8400000 +00:00' WHERE [ID] = 21
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.3400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.7700000 +00:00' WHERE [ID] = 22
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.6133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.6933333 +00:00' WHERE [ID] = 23
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.6733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.6300000 +00:00' WHERE [ID] = 24
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.7333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.5633333 +00:00' WHERE [ID] = 25
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:39.7933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.4833333 +00:00' WHERE [ID] = 26
UPDATE [__mj].[EntityFieldValue] SET [Sequence]=1, [__mj_CreatedAt]='2024-03-31 02:55:40.7400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.3900000 +00:00' WHERE [ID] = 27
UPDATE [__mj].[EntityFieldValue] SET [Sequence]=2, [__mj_CreatedAt]='2024-03-31 02:55:40.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.4500000 +00:00' WHERE [ID] = 28
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:41.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.8800000 +00:00' WHERE [ID] = 29
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:41.1533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.8166667 +00:00' WHERE [ID] = 30
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:41.7866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.6100000 +00:00' WHERE [ID] = 31
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:41.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.5366667 +00:00' WHERE [ID] = 32
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.9800000 +00:00' WHERE [ID] = 33
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.9066667 +00:00' WHERE [ID] = 34
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.4766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.4366667 +00:00' WHERE [ID] = 35
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.5366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.3633333 +00:00' WHERE [ID] = 36
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.5966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.2966667 +00:00' WHERE [ID] = 37
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.8766667 +00:00' WHERE [ID] = 38
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.9333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.8100000 +00:00' WHERE [ID] = 39
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:42.9966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.7366667 +00:00' WHERE [ID] = 40
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.2733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.3033333 +00:00' WHERE [ID] = 41
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.3300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.2400000 +00:00' WHERE [ID] = 42
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.6000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.7200000 +00:00' WHERE [ID] = 43
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.6600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.6566667 +00:00' WHERE [ID] = 44
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.7200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.6000000 +00:00' WHERE [ID] = 45
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:43.9966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.1400000 +00:00' WHERE [ID] = 46
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.0766667 +00:00' WHERE [ID] = 47
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.1266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.0133333 +00:00' WHERE [ID] = 48
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.5833333 +00:00' WHERE [ID] = 49
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.5200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.5166667 +00:00' WHERE [ID] = 50
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.4533333 +00:00' WHERE [ID] = 51
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.0900000 +00:00' WHERE [ID] = 52
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:44.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.0100000 +00:00' WHERE [ID] = 53
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.0366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.9466667 +00:00' WHERE [ID] = 54
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.1033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.8833333 +00:00' WHERE [ID] = 55
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.4133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.5033333 +00:00' WHERE [ID] = 56
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.4833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.4400000 +00:00' WHERE [ID] = 57
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.3733333 +00:00' WHERE [ID] = 58
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.8500000 +00:00' WHERE [ID] = 59
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:45.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.7800000 +00:00' WHERE [ID] = 60
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.1900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.4000000 +00:00' WHERE [ID] = 61
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.2533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.3333333 +00:00' WHERE [ID] = 62
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.3133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.2700000 +00:00' WHERE [ID] = 63
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.2066667 +00:00' WHERE [ID] = 64
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.4333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.1400000 +00:00' WHERE [ID] = 65
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.7100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.7533333 +00:00' WHERE [ID] = 66
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:46.7733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.6900000 +00:00' WHERE [ID] = 67
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:47.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.2533333 +00:00' WHERE [ID] = 68
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:47.1200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.1900000 +00:00' WHERE [ID] = 69
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:47.1800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.1266667 +00:00' WHERE [ID] = 70
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 02:55:47.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.0500000 +00:00' WHERE [ID] = 71
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-03-31 03:14:21.2600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.1766667 +00:00' WHERE [ID] = 72
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.7033333 +00:00' WHERE [ID] = 73
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.4666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.6266667 +00:00' WHERE [ID] = 74
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.5600000 +00:00' WHERE [ID] = 75
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.8066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.1500000 +00:00' WHERE [ID] = 76
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.0600000 +00:00' WHERE [ID] = 77
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:05.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.9966667 +00:00' WHERE [ID] = 78
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.2100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.9300000 +00:00' WHERE [ID] = 79
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.2700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.8466667 +00:00' WHERE [ID] = 80
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.3333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.7833333 +00:00' WHERE [ID] = 81
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.6133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.4600000 +00:00' WHERE [ID] = 82
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.6766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.3933333 +00:00' WHERE [ID] = 83
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.7400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.3166667 +00:00' WHERE [ID] = 84
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:06.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.2500000 +00:00' WHERE [ID] = 85
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.9466667 +00:00' WHERE [ID] = 86
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.1433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.8833333 +00:00' WHERE [ID] = 87
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.2066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.8200000 +00:00' WHERE [ID] = 88
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.2700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.7566667 +00:00' WHERE [ID] = 89
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.5566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.4466667 +00:00' WHERE [ID] = 90
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.6200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.3833333 +00:00' WHERE [ID] = 91
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.6833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.3200000 +00:00' WHERE [ID] = 92
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-04-30 17:15:07.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.2533333 +00:00' WHERE [ID] = 93
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-07 21:25:19.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.5000000 +00:00' WHERE [ID] = 94
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-07 21:25:19.3133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.4333333 +00:00' WHERE [ID] = 95
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.3933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.8766667 +00:00' WHERE [ID] = 96
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.4566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.8000000 +00:00' WHERE [ID] = 97
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.7366667 +00:00' WHERE [ID] = 98
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.3000000 +00:00' WHERE [ID] = 99
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.9133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.2333333 +00:00' WHERE [ID] = 100
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:22.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.1666667 +00:00' WHERE [ID] = 101
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.2900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.7366667 +00:00' WHERE [ID] = 102
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.6733333 +00:00' WHERE [ID] = 103
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.4433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.6100000 +00:00' WHERE [ID] = 104
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.1700000 +00:00' WHERE [ID] = 105
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.0966667 +00:00' WHERE [ID] = 106
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:23.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.0333333 +00:00' WHERE [ID] = 107
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.2000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.5933333 +00:00' WHERE [ID] = 108
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.2633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.5233333 +00:00' WHERE [ID] = 109
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.3300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.4566667 +00:00' WHERE [ID] = 110
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.6100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.0400000 +00:00' WHERE [ID] = 111
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.6733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.9633333 +00:00' WHERE [ID] = 112
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:24.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.9000000 +00:00' WHERE [ID] = 113
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:25.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.5100000 +00:00' WHERE [ID] = 114
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:25.0766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.4466667 +00:00' WHERE [ID] = 115
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-25 22:52:25.1366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.3700000 +00:00' WHERE [ID] = 116
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.1966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.7966667 +00:00' WHERE [ID] = 117
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.2633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.8600000 +00:00' WHERE [ID] = 118
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.3300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.9233333 +00:00' WHERE [ID] = 119
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.6000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:46.7166667 +00:00' WHERE [ID] = 120
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.6666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:46.7833333 +00:00' WHERE [ID] = 121
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.7300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:46.8466667 +00:00' WHERE [ID] = 122
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-29 21:32:31.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:46.9100000 +00:00' WHERE [ID] = 123
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 17:01:07.3133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.2000000 +00:00' WHERE [ID] = 124
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 17:01:07.3766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.2633333 +00:00' WHERE [ID] = 125
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 17:01:07.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.3266667 +00:00' WHERE [ID] = 126
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.0266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.6966667 +00:00' WHERE [ID] = 127
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.1000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.7700000 +00:00' WHERE [ID] = 128
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.8333333 +00:00' WHERE [ID] = 129
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.4466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.1433333 +00:00' WHERE [ID] = 130
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.5133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.2066667 +00:00' WHERE [ID] = 131
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.3366667 +00:00' WHERE [ID] = 132
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.4133333 +00:00' WHERE [ID] = 133
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.4866667 +00:00' WHERE [ID] = 134
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.5500000 +00:00' WHERE [ID] = 135
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.6133333 +00:00' WHERE [ID] = 136
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.6800000 +00:00' WHERE [ID] = 137
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:30.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.7400000 +00:00' WHERE [ID] = 138
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:31.0400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.8166667 +00:00' WHERE [ID] = 139
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:31.1000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.8800000 +00:00' WHERE [ID] = 140
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:26:31.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.9500000 +00:00' WHERE [ID] = 141
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:36:34.1966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:27.2700000 +00:00' WHERE [ID] = 142
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:10.7633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.6600000 +00:00' WHERE [ID] = 143
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:10.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.7233333 +00:00' WHERE [ID] = 144
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:10.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.7900000 +00:00' WHERE [ID] = 145
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:10.9766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.8533333 +00:00' WHERE [ID] = 146
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:11.0566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.9166667 +00:00' WHERE [ID] = 147
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-05-31 22:46:11.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:25.9800000 +00:00' WHERE [ID] = 148
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:42.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.6400000 +00:00' WHERE [ID] = 149
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.7100000 +00:00' WHERE [ID] = 150
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.2966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.0100000 +00:00' WHERE [ID] = 151
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.3566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.0700000 +00:00' WHERE [ID] = 152
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.6533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.3733333 +00:00' WHERE [ID] = 153
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.4400000 +00:00' WHERE [ID] = 154
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.7833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.5033333 +00:00' WHERE [ID] = 155
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:43.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.5700000 +00:00' WHERE [ID] = 156
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.8600000 +00:00' WHERE [ID] = 157
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.9233333 +00:00' WHERE [ID] = 158
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.5000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.2166667 +00:00' WHERE [ID] = 159
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.5666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.2833333 +00:00' WHERE [ID] = 160
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.8800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.6100000 +00:00' WHERE [ID] = 161
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:44.9433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.6900000 +00:00' WHERE [ID] = 162
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:45.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.7500000 +00:00' WHERE [ID] = 163
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-05 10:22:45.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.8300000 +00:00' WHERE [ID] = 164
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-08 15:41:08.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.1366667 +00:00' WHERE [ID] = 165
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-08 15:41:08.8633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.1966667 +00:00' WHERE [ID] = 166
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-08 15:41:08.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.2600000 +00:00' WHERE [ID] = 167
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-08 15:41:08.9933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.3233333 +00:00' WHERE [ID] = 168
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-10 00:20:40.9166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.6366667 +00:00' WHERE [ID] = 169
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-10 00:20:41.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.7033333 +00:00' WHERE [ID] = 170
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-10 00:20:41.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.7700000 +00:00' WHERE [ID] = 171
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-10 00:20:41.3966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.8400000 +00:00' WHERE [ID] = 172
UPDATE [__mj].[EntityFieldValue] SET [__mj_CreatedAt]='2024-06-10 00:20:41.5400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.9100000 +00:00' WHERE [ID] = 173
PRINT(N'Operation applied to 173 rows out of 173')

PRINT(N'Update row in [__mj].[User]')
UPDATE [__mj].[User] SET [__mj_CreatedAt]='2023-11-25 21:52:30.7133333 +00:00', [__mj_UpdatedAt]='2023-11-25 21:52:30.7133333 +00:00' WHERE [ID] = 8

PRINT(N'Update rows in [__mj].[ResourceType]')
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2023-07-01 21:50:04.3733333 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 1
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2023-07-01 21:50:04.3733333 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 2
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2023-07-01 21:50:04.3733333 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 3
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2023-07-01 21:50:04.3733333 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 4
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2023-08-17 18:24:54.6300000 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 5
UPDATE [__mj].[ResourceType] SET [__mj_CreatedAt]='2024-02-03 01:14:06.5566667 +00:00', [__mj_UpdatedAt]='2024-04-14 16:47:02.9433333 +00:00' WHERE [ID] = 6
PRINT(N'Operation applied to 6 rows out of 6')

PRINT(N'Update rows in [__mj].[EntityPermission]')
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.8300000 +00:00' WHERE [ID] = 9
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.8900000 +00:00' WHERE [ID] = 11
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 15
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 16
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 17
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 18
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 20
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 32
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 33
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 34
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 35
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2024-03-16 18:40:09.3133333 +00:00' WHERE [ID] = 36
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 37
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 38
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 39
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 40
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 42
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 43
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 47
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 48
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 60
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 61
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 66
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 67
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 68
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 69
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 70
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 71
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 72
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 73
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 74
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 75
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 76
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 85
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 87
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 91
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 92
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 93
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 94
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 96
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 108
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 109
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 110
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 111
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2024-03-16 18:40:09.3766667 +00:00' WHERE [ID] = 112
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 113
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 114
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 115
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 116
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 118
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 119
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 123
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 124
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 136
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 137
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 142
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 143
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 144
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 145
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 146
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 147
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 148
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 149
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 150
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 151
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:09:10.0366667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 152
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2024-03-21 21:02:06.4500000 +00:00' WHERE [ID] = 190
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 191
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 192
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 195
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 196
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 197
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 200
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 201
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 202
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 203
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 204
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 205
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2024-03-16 18:39:42.7233333 +00:00' WHERE [ID] = 206
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 208
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 209
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 210
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 211
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 212
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 213
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 214
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 216
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 217
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 219
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 220
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 221
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 222
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 223
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 224
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 225
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 226
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 227
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-03 17:29:08.3766667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 228
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-04 00:33:10.1100000 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 229
UPDATE [__mj].[EntityPermission] SET [CanUpdate]=1, [__mj_CreatedAt]='2023-04-04 00:33:12.7400000 +00:00', [__mj_UpdatedAt]='2024-06-13 00:38:07.5900000 +00:00' WHERE [ID] = 230
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-04 00:33:15.3266667 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 231
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-27 23:45:56.3233333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 238
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-27 23:45:56.3233333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 239
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-27 23:45:56.3233333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 240
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2024-04-10 23:52:35.4900000 +00:00' WHERE [ID] = 242
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 243
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 244
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2024-04-10 23:43:26.6100000 +00:00' WHERE [ID] = 245
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 246
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 247
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2024-03-21 20:59:42.6833333 +00:00' WHERE [ID] = 248
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 249
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 250
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2024-04-10 23:52:35.4300000 +00:00' WHERE [ID] = 251
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 252
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 253
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 254
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 255
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-04-29 22:40:36.9033333 +00:00', [__mj_UpdatedAt]='2023-05-16 20:59:15.5233333 +00:00' WHERE [ID] = 256
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:45:52.4833333 +00:00', [__mj_UpdatedAt]='2023-05-29 01:45:52.4833333 +00:00' WHERE [ID] = 259
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:03.4333333 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:03.4333333 +00:00' WHERE [ID] = 260
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:06.3566667 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:06.3566667 +00:00' WHERE [ID] = 261
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:09.3100000 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:09.3100000 +00:00' WHERE [ID] = 262
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:12.4833333 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:12.4833333 +00:00' WHERE [ID] = 263
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:38.3433333 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:38.3433333 +00:00' WHERE [ID] = 264
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:42.2000000 +00:00', [__mj_UpdatedAt]='2024-04-10 20:01:53.1700000 +00:00' WHERE [ID] = 265
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:45.4333333 +00:00', [__mj_UpdatedAt]='2024-04-10 20:01:53.2600000 +00:00' WHERE [ID] = 266
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:48.5133333 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:48.5133333 +00:00' WHERE [ID] = 267
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-29 01:46:52.2800000 +00:00', [__mj_UpdatedAt]='2023-05-29 01:46:52.2800000 +00:00' WHERE [ID] = 268
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.6900000 +00:00' WHERE [ID] = 275
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.4900000 +00:00' WHERE [ID] = 276
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.5566667 +00:00' WHERE [ID] = 277
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2023-05-30 20:39:57.9200000 +00:00' WHERE [ID] = 278
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2024-04-10 23:41:52.6233333 +00:00' WHERE [ID] = 279
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-05-30 20:39:57.9200000 +00:00', [__mj_UpdatedAt]='2023-05-30 20:39:57.9200000 +00:00' WHERE [ID] = 282
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-09 19:37:26.4600000 +00:00', [__mj_UpdatedAt]='2023-06-09 19:37:26.4600000 +00:00' WHERE [ID] = 287
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-09 19:37:31.6100000 +00:00', [__mj_UpdatedAt]='2023-06-09 19:37:31.6100000 +00:00' WHERE [ID] = 288
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 293
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 294
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 295
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 296
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 297
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 299
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 300
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 301
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2023-06-20 17:47:54.0366667 +00:00' WHERE [ID] = 302
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2024-03-16 23:39:09.4633333 +00:00' WHERE [ID] = 303
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-20 17:47:54.0366667 +00:00', [__mj_UpdatedAt]='2024-03-16 21:58:40.1933333 +00:00' WHERE [ID] = 304
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:44:15.2200000 +00:00', [__mj_UpdatedAt]='2023-06-25 22:44:15.2200000 +00:00' WHERE [ID] = 308
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:53:36.7433333 +00:00', [__mj_UpdatedAt]='2023-06-25 22:53:36.7433333 +00:00' WHERE [ID] = 309
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:53:43.5333333 +00:00', [__mj_UpdatedAt]='2023-06-25 22:53:43.5333333 +00:00' WHERE [ID] = 310
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:53:47.1900000 +00:00', [__mj_UpdatedAt]='2023-06-25 22:53:47.1900000 +00:00' WHERE [ID] = 311
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:53:52.1033333 +00:00', [__mj_UpdatedAt]='2023-06-25 22:53:52.1033333 +00:00' WHERE [ID] = 312
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-06-25 22:53:56.5000000 +00:00', [__mj_UpdatedAt]='2023-06-25 22:53:56.5000000 +00:00' WHERE [ID] = 313
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-07-08 22:28:16.5433333 +00:00', [__mj_UpdatedAt]='2024-04-25 00:09:30.6233333 +00:00' WHERE [ID] = 317
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-07-08 22:28:19.0033333 +00:00', [__mj_UpdatedAt]='2024-04-25 00:09:30.7100000 +00:00' WHERE [ID] = 318
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-07-08 22:28:29.2433333 +00:00', [__mj_UpdatedAt]='2024-03-20 23:07:29.3200000 +00:00' WHERE [ID] = 320
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-07-08 22:28:31.7733333 +00:00', [__mj_UpdatedAt]='2024-03-20 23:07:29.3933333 +00:00' WHERE [ID] = 321
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-08-21 19:25:10.9100000 +00:00', [__mj_UpdatedAt]='2023-08-21 19:25:10.9100000 +00:00' WHERE [ID] = 322
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-08-21 19:25:14.4966667 +00:00', [__mj_UpdatedAt]='2023-08-21 19:25:14.4966667 +00:00' WHERE [ID] = 323
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-08-21 19:25:18.0133333 +00:00', [__mj_UpdatedAt]='2023-08-21 19:25:18.0133333 +00:00' WHERE [ID] = 324
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-09-30 22:22:41.9000000 +00:00', [__mj_UpdatedAt]='2023-09-30 22:22:41.9000000 +00:00' WHERE [ID] = 325
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-09-30 22:22:42.0066667 +00:00', [__mj_UpdatedAt]='2023-09-30 22:22:42.0066667 +00:00' WHERE [ID] = 326
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2023-09-30 22:22:42.0900000 +00:00', [__mj_UpdatedAt]='2023-09-30 22:22:42.0900000 +00:00' WHERE [ID] = 327
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:28.3300000 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:28.3300000 +00:00' WHERE [ID] = 389
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:28.5566667 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:28.5566667 +00:00' WHERE [ID] = 390
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:28.7533333 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:28.7533333 +00:00' WHERE [ID] = 391
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:30.0966667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 392
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:30.2766667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 393
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:30.4866667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 394
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:31.9766667 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:31.9766667 +00:00' WHERE [ID] = 395
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:32.2266667 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:32.2266667 +00:00' WHERE [ID] = 396
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 15:47:32.4266667 +00:00', [__mj_UpdatedAt]='2024-02-02 15:47:32.4266667 +00:00' WHERE [ID] = 397
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 19:46:17.7100000 +00:00', [__mj_UpdatedAt]='2024-02-02 19:46:17.7100000 +00:00' WHERE [ID] = 398
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 19:46:17.9100000 +00:00', [__mj_UpdatedAt]='2024-02-02 19:46:17.9100000 +00:00' WHERE [ID] = 399
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-02 19:46:18.1100000 +00:00', [__mj_UpdatedAt]='2024-02-02 19:46:18.1100000 +00:00' WHERE [ID] = 400
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:55.5033333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:55.5033333 +00:00' WHERE [ID] = 443
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:55.5666667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:55.5666667 +00:00' WHERE [ID] = 444
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:55.6266667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:55.6266667 +00:00' WHERE [ID] = 445
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.0566667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.0566667 +00:00' WHERE [ID] = 446
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.1200000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.1200000 +00:00' WHERE [ID] = 447
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.1900000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.1900000 +00:00' WHERE [ID] = 448
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.6166667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.6166667 +00:00' WHERE [ID] = 449
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.6800000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.6800000 +00:00' WHERE [ID] = 450
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:56.7433333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:56.7433333 +00:00' WHERE [ID] = 451
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.1700000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.1700000 +00:00' WHERE [ID] = 452
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.2333333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.2333333 +00:00' WHERE [ID] = 453
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.2966667 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.2966667 +00:00' WHERE [ID] = 454
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.7300000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.7300000 +00:00' WHERE [ID] = 455
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.7900000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.7900000 +00:00' WHERE [ID] = 456
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:57.8533333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:57.8533333 +00:00' WHERE [ID] = 457
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:58.2800000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:58.2800000 +00:00' WHERE [ID] = 458
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:58.3400000 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:58.3400000 +00:00' WHERE [ID] = 459
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-09 02:04:58.4033333 +00:00', [__mj_UpdatedAt]='2024-02-09 02:04:58.4033333 +00:00' WHERE [ID] = 460
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:10.6966667 +00:00', [__mj_UpdatedAt]='2024-05-03 17:43:37.0600000 +00:00' WHERE [ID] = 461
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:10.8466667 +00:00', [__mj_UpdatedAt]='2024-05-03 17:43:37.0600000 +00:00' WHERE [ID] = 462
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:11.0000000 +00:00', [__mj_UpdatedAt]='2024-02-13 23:17:11.0000000 +00:00' WHERE [ID] = 463
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:11.9800000 +00:00', [__mj_UpdatedAt]='2024-05-03 17:44:35.6366667 +00:00' WHERE [ID] = 464
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:12.1200000 +00:00', [__mj_UpdatedAt]='2024-05-03 17:44:35.6366667 +00:00' WHERE [ID] = 465
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-13 23:17:12.2733333 +00:00', [__mj_UpdatedAt]='2024-02-13 23:17:12.2733333 +00:00' WHERE [ID] = 466
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:29.9033333 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 467
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:29.9666667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 468
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:30.0333333 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 469
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:30.5033333 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 470
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:30.5700000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 471
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:30.6366667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 472
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:31.1066667 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 473
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:31.1700000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 474
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-02-20 23:27:31.2400000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 475
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 479
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 480
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 481
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 482
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 483
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 484
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 485
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 486
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 487
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 488
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 489
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 490
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 491
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 492
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 493
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 494
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 495
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 496
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 497
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 498
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-18 21:01:51.5100000 +00:00' WHERE [ID] = 499
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 500
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 501
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:24:33.2200000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:24:33.2200000 +00:00' WHERE [ID] = 502
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:37:43.8000000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:37:43.8000000 +00:00' WHERE [ID] = 503
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:38:12.3700000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:38:32.6000000 +00:00' WHERE [ID] = 504
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:38:12.4300000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:38:32.6666667 +00:00' WHERE [ID] = 505
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:39:00.7000000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:39:00.7000000 +00:00' WHERE [ID] = 506
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-16 23:39:00.7600000 +00:00', [__mj_UpdatedAt]='2024-03-16 23:39:00.7600000 +00:00' WHERE [ID] = 507
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-20 23:07:29.4600000 +00:00', [__mj_UpdatedAt]='2024-03-20 23:07:29.4600000 +00:00' WHERE [ID] = 508
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-20 23:07:40.9933333 +00:00', [__mj_UpdatedAt]='2024-04-25 00:09:30.7733333 +00:00' WHERE [ID] = 509
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-21 22:03:39.8166667 +00:00', [__mj_UpdatedAt]='2024-03-21 22:03:39.8166667 +00:00' WHERE [ID] = 510
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-29 20:46:33.4500000 +00:00', [__mj_UpdatedAt]='2024-03-29 20:46:33.4500000 +00:00' WHERE [ID] = 521
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-29 20:46:33.5666667 +00:00', [__mj_UpdatedAt]='2024-03-29 20:46:33.5666667 +00:00' WHERE [ID] = 522
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-03-29 20:46:33.6900000 +00:00', [__mj_UpdatedAt]='2024-03-29 20:46:33.6900000 +00:00' WHERE [ID] = 523
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:00.7700000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:00.7700000 +00:00' WHERE [ID] = 524
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:00.8333333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:00.8333333 +00:00' WHERE [ID] = 525
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:00.8966667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:00.8966667 +00:00' WHERE [ID] = 526
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:01.3366667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:01.3366667 +00:00' WHERE [ID] = 527
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:01.4000000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:01.4000000 +00:00' WHERE [ID] = 528
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:01.4633333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:01.4633333 +00:00' WHERE [ID] = 529
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:01.8966667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:01.8966667 +00:00' WHERE [ID] = 530
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:01.9600000 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:01.9600000 +00:00' WHERE [ID] = 531
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:02.0233333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:02.0233333 +00:00' WHERE [ID] = 532
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:02.4533333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:02.4533333 +00:00' WHERE [ID] = 533
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:02.5166667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:02.5166667 +00:00' WHERE [ID] = 534
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:02.5833333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:02.5833333 +00:00' WHERE [ID] = 535
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:03.0233333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:03.0233333 +00:00' WHERE [ID] = 536
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:03.0833333 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:03.0833333 +00:00' WHERE [ID] = 537
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-04-30 17:14:03.1466667 +00:00', [__mj_UpdatedAt]='2024-04-30 17:14:03.1466667 +00:00' WHERE [ID] = 538
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.1300000 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.1300000 +00:00' WHERE [ID] = 539
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.1933333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.1933333 +00:00' WHERE [ID] = 540
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.2533333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.2533333 +00:00' WHERE [ID] = 541
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.6900000 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.6900000 +00:00' WHERE [ID] = 542
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.7533333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.7533333 +00:00' WHERE [ID] = 543
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:08.8133333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:08.8133333 +00:00' WHERE [ID] = 544
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:09.2566667 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:09.2566667 +00:00' WHERE [ID] = 545
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:09.3200000 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:09.3200000 +00:00' WHERE [ID] = 546
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-22 20:47:09.3833333 +00:00', [__mj_UpdatedAt]='2024-05-22 20:47:09.3833333 +00:00' WHERE [ID] = 547
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:43.5133333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:43.5133333 +00:00' WHERE [ID] = 611
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:43.5800000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:43.5800000 +00:00' WHERE [ID] = 612
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:43.6433333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:43.6433333 +00:00' WHERE [ID] = 613
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:44.6700000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:44.6700000 +00:00' WHERE [ID] = 617
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:44.7333333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:44.7333333 +00:00' WHERE [ID] = 618
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:44.8000000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:44.8000000 +00:00' WHERE [ID] = 619
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.2500000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.2500000 +00:00' WHERE [ID] = 620
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.3133333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.3133333 +00:00' WHERE [ID] = 621
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.3800000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.3800000 +00:00' WHERE [ID] = 622
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.8300000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.8300000 +00:00' WHERE [ID] = 623
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.8966667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.8966667 +00:00' WHERE [ID] = 624
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:45.9600000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:45.9600000 +00:00' WHERE [ID] = 625
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:46.4000000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:46.4000000 +00:00' WHERE [ID] = 626
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:46.4633333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:46.4633333 +00:00' WHERE [ID] = 627
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:46.5300000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:46.5300000 +00:00' WHERE [ID] = 628
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:46.9733333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:46.9733333 +00:00' WHERE [ID] = 629
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:47.0400000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:47.0400000 +00:00' WHERE [ID] = 630
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:47.1033333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:47.1033333 +00:00' WHERE [ID] = 631
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:47.5566667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:47.5566667 +00:00' WHERE [ID] = 632
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:47.6200000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:47.6200000 +00:00' WHERE [ID] = 633
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:47.6833333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:47.6833333 +00:00' WHERE [ID] = 634
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:48.7100000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:48.7100000 +00:00' WHERE [ID] = 638
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:48.7766667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:48.7766667 +00:00' WHERE [ID] = 639
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:48.8400000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:48.8400000 +00:00' WHERE [ID] = 640
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:49.2966667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:49.2966667 +00:00' WHERE [ID] = 641
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:49.3600000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:49.3600000 +00:00' WHERE [ID] = 642
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:49.4233333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:49.4233333 +00:00' WHERE [ID] = 643
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:49.8733333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:49.8733333 +00:00' WHERE [ID] = 644
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:49.9400000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:49.9400000 +00:00' WHERE [ID] = 645
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:50.0033333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:50.0033333 +00:00' WHERE [ID] = 646
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:50.4900000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:50.4900000 +00:00' WHERE [ID] = 647
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:50.5566667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:50.5566667 +00:00' WHERE [ID] = 648
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:50.6300000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:50.6300000 +00:00' WHERE [ID] = 649
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:51.1066667 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:51.1066667 +00:00' WHERE [ID] = 650
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:51.1800000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:51.1800000 +00:00' WHERE [ID] = 651
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-25 22:50:51.2433333 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:51.2433333 +00:00' WHERE [ID] = 652
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-29 21:30:58.9733333 +00:00', [__mj_UpdatedAt]='2024-05-29 21:30:58.9733333 +00:00' WHERE [ID] = 653
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-29 21:30:59.0400000 +00:00', [__mj_UpdatedAt]='2024-05-29 21:30:59.0400000 +00:00' WHERE [ID] = 654
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-29 21:30:59.1100000 +00:00', [__mj_UpdatedAt]='2024-05-29 21:30:59.1100000 +00:00' WHERE [ID] = 655
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:30.9666667 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:30.9666667 +00:00' WHERE [ID] = 656
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:31.0400000 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.0400000 +00:00' WHERE [ID] = 657
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:31.1033333 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.1033333 +00:00' WHERE [ID] = 658
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:31.5366667 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.5366667 +00:00' WHERE [ID] = 659
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:31.6033333 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.6033333 +00:00' WHERE [ID] = 660
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 16:59:31.6633333 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.6633333 +00:00' WHERE [ID] = 661
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 18:34:01.6400000 +00:00', [__mj_UpdatedAt]='2024-05-31 18:34:01.6400000 +00:00' WHERE [ID] = 662
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 18:34:01.6966667 +00:00', [__mj_UpdatedAt]='2024-05-31 18:34:01.6966667 +00:00' WHERE [ID] = 663
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-05-31 18:34:01.7500000 +00:00', [__mj_UpdatedAt]='2024-05-31 18:34:01.7500000 +00:00' WHERE [ID] = 664
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.2033333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.2033333 +00:00' WHERE [ID] = 668
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.2666667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.2666667 +00:00' WHERE [ID] = 669
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.3400000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.3400000 +00:00' WHERE [ID] = 670
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.7800000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.7800000 +00:00' WHERE [ID] = 671
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.8600000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.8600000 +00:00' WHERE [ID] = 672
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:55.9233333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.9233333 +00:00' WHERE [ID] = 673
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:56.3666667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:56.3666667 +00:00' WHERE [ID] = 674
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:56.4266667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:56.4266667 +00:00' WHERE [ID] = 675
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:56.4900000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:56.4900000 +00:00' WHERE [ID] = 676
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:56.9533333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:56.9533333 +00:00' WHERE [ID] = 677
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:57.0166667 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:57.0166667 +00:00' WHERE [ID] = 678
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:57.0833333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:57.0833333 +00:00' WHERE [ID] = 679
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:57.5300000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:57.5300000 +00:00' WHERE [ID] = 680
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:57.5900000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:57.5900000 +00:00' WHERE [ID] = 681
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-05 10:20:57.6533333 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:57.6533333 +00:00' WHERE [ID] = 682
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.2566667 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.2566667 +00:00' WHERE [ID] = 683
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.3300000 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.3300000 +00:00' WHERE [ID] = 684
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.4033333 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.4033333 +00:00' WHERE [ID] = 685
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.8466667 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.8466667 +00:00' WHERE [ID] = 686
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.9066667 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.9066667 +00:00' WHERE [ID] = 687
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 01:00:50.9700000 +00:00', [__mj_UpdatedAt]='2024-06-08 01:00:50.9700000 +00:00' WHERE [ID] = 688
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.1633333 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.1633333 +00:00' WHERE [ID] = 689
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.2266667 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.2266667 +00:00' WHERE [ID] = 690
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.2900000 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.2900000 +00:00' WHERE [ID] = 691
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.7500000 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.7500000 +00:00' WHERE [ID] = 692
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.8133333 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.8133333 +00:00' WHERE [ID] = 693
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:22.8800000 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:22.8800000 +00:00' WHERE [ID] = 694
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:23.3466667 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:23.3466667 +00:00' WHERE [ID] = 695
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:23.4100000 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:23.4100000 +00:00' WHERE [ID] = 696
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-08 15:39:23.4766667 +00:00', [__mj_UpdatedAt]='2024-06-08 15:39:23.4766667 +00:00' WHERE [ID] = 697
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:51.3900000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:51.3900000 +00:00' WHERE [ID] = 698
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:51.5433333 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:51.5433333 +00:00' WHERE [ID] = 699
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:51.6966667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:51.6966667 +00:00' WHERE [ID] = 700
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:52.8400000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:52.8400000 +00:00' WHERE [ID] = 701
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:53.0100000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:53.0100000 +00:00' WHERE [ID] = 702
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:53.1700000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:53.1700000 +00:00' WHERE [ID] = 703
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:54.5133333 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:54.5133333 +00:00' WHERE [ID] = 704
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:54.6966667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:54.6966667 +00:00' WHERE [ID] = 705
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:54.8766667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:54.8766667 +00:00' WHERE [ID] = 706
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:56.0466667 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:56.0466667 +00:00' WHERE [ID] = 707
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:56.2100000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:56.2100000 +00:00' WHERE [ID] = 708
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 00:15:56.3900000 +00:00', [__mj_UpdatedAt]='2024-06-10 00:15:56.3900000 +00:00' WHERE [ID] = 709
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 19:05:20.3900000 +00:00', [__mj_UpdatedAt]='2024-06-10 19:05:20.3900000 +00:00' WHERE [ID] = 710
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 19:05:20.5433333 +00:00', [__mj_UpdatedAt]='2024-06-10 19:05:20.5433333 +00:00' WHERE [ID] = 711
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 19:05:20.6933333 +00:00', [__mj_UpdatedAt]='2024-06-10 19:05:20.6933333 +00:00' WHERE [ID] = 712
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 20:13:38.9666667 +00:00', [__mj_UpdatedAt]='2024-06-10 20:13:38.9666667 +00:00' WHERE [ID] = 713
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 20:13:39.1100000 +00:00', [__mj_UpdatedAt]='2024-06-10 20:13:39.1100000 +00:00' WHERE [ID] = 714
UPDATE [__mj].[EntityPermission] SET [__mj_CreatedAt]='2024-06-10 20:13:39.2600000 +00:00', [__mj_UpdatedAt]='2024-06-10 20:13:39.2600000 +00:00' WHERE [ID] = 715
PRINT(N'Operation applied to 364 rows out of 364')

PRINT(N'Update rows in [__mj].[EntityField]')
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 336
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 337
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:28.4366667 +00:00' WHERE [ID] = 338
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 339
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 340
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 341
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 342
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 343
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 344
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 345
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 406
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 407
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 408
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 409
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 410
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 411
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 414
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 415
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 418
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 419
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 420
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 421
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 422
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 423
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 424
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 425
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 426
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 427
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 428
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 429
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 430
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 431
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:28.0533333 +00:00' WHERE [ID] = 432
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 433
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 434
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 536
UPDATE [__mj].[EntityField] SET [DisplayName]=N'', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 537
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 538
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 539
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 542
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 543
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 544
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 545
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 546
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 547
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 548
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 549
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 550
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 551
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 586
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 587
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 588
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 591
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 592
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 593
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 594
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 595
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 641
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 642
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 643
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 644
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 645
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 646
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 647
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 648
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 649
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 650
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 651
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 652
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 653
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 655
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 657
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 658
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 659
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 660
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 662
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 663
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 664
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 665
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 666
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 667
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 668
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 669
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 670
UPDATE [__mj].[EntityField] SET [Sequence]=40, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 686
UPDATE [__mj].[EntityField] SET [Sequence]=42, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 687
UPDATE [__mj].[EntityField] SET [Sequence]=43, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 688
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 701
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 702
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 707
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 708
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 709
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 710
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:29.2266667 +00:00' WHERE [ID] = 711
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 712
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 713
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 714
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 715
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 716
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 717
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 718
UPDATE [__mj].[EntityField] SET [Sequence]=23, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 719
UPDATE [__mj].[EntityField] SET [Sequence]=24, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 720
UPDATE [__mj].[EntityField] SET [Sequence]=25, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 721
UPDATE [__mj].[EntityField] SET [Sequence]=26, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 722
UPDATE [__mj].[EntityField] SET [Sequence]=27, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 723
UPDATE [__mj].[EntityField] SET [Sequence]=28, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 724
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 727
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 728
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 729
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 730
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 731
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 732
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 733
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 734
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 757
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 758
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 759
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 760
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 761
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 762
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 764
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 777
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 778
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 779
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 781
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 796
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 797
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 798
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 799
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 800
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 801
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 802
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 803
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 804
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 805
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 806
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 807
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 808
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 811
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 812
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 829
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 830
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 831
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 832
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 843
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 844
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 845
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 846
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 847
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1095
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1152
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1153
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1154
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1155
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1174
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1191
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1192
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1193
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1194
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1195
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1196
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1197
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1198
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1199
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1200
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1201
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1203
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1204
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1205
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1206
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1211
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1212
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1220
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1221
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1222
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1226
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1227
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1228
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1244
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1246
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1247
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1248
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1249
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1251
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1252
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1253
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1254
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1262
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1263
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1268
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1269
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1270
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1271
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1272
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1273
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1274
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1275
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1277
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1278
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1279
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1280
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1281
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1282
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1293
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1297
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1324
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1325
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1326
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1327
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1328
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1329
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1330
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1331
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1332
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1333
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1334
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1335
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1337
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1338
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1339
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1340
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1342
UPDATE [__mj].[EntityField] SET [Sequence]=46, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1343
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1347
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1349
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1350
UPDATE [__mj].[EntityField] SET [Description]=N'When unchecked the relationship will NOT be displayed on the generated form', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1351
UPDATE [__mj].[EntityField] SET [Sequence]=15, [Description]=N'Optional, when specified this value overrides the related entity name for the label on the tab', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1355
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1356
UPDATE [__mj].[EntityField] SET [Sequence]=47, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1359
UPDATE [__mj].[EntityField] SET [Sequence]=48, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1362
UPDATE [__mj].[EntityField] SET [Sequence]=49, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1363
UPDATE [__mj].[EntityField] SET [Sequence]=50, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1364
UPDATE [__mj].[EntityField] SET [Sequence]=51, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1365
UPDATE [__mj].[EntityField] SET [Sequence]=44, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1366
UPDATE [__mj].[EntityField] SET [Sequence]=45, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1367
UPDATE [__mj].[EntityField] SET [Sequence]=41, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1368
UPDATE [__mj].[EntityField] SET [Sequence]=29, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1369
UPDATE [__mj].[EntityField] SET [Sequence]=30, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1370
UPDATE [__mj].[EntityField] SET [Sequence]=31, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1371
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1419
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1420
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1421
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1422
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1423
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.2900000 +00:00' WHERE [ID] = 1424
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1425
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1430
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1431
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1432
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1433
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1438
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1439
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1440
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1441
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1442
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1443
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1444
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1445
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1446
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1447
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1448
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1449
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1450
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1451
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1452
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1453
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1454
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1455
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1474
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1475
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1476
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1479
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1480
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1481
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1482
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1483
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1484
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1485
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1486
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1487
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1488
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1489
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1490
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1492
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:30.7866667 +00:00' WHERE [ID] = 1493
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1494
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1495
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1503
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1506
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1521
UPDATE [__mj].[EntityField] SET [Type]=N'datetimeoffset', [Length]=10, [Precision]=34, [Scale]=7, [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1527
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1528
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1529
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1530
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.6133333 +00:00' WHERE [ID] = 1531
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1532
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1533
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1534
UPDATE [__mj].[EntityField] SET [Sequence]=15, [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1535
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1537
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1538
UPDATE [__mj].[EntityField] SET [Description]=N'When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.', [__mj_CreatedAt]='2023-04-05 15:42:43.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1549
UPDATE [__mj].[EntityField] SET [Sequence]=6, [__mj_CreatedAt]='2023-04-13 23:21:36.6466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1638
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-16 01:40:30.9500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1639
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-16 01:40:31.0500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1640
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:00:33.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1649
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:00:33.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1650
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:00:33.6166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1651
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:00:33.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1652
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:10:53.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1664
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:10:53.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1665
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:10:54.0333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1666
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-27 22:10:54.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1667
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 17:57:53.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1688
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 17:57:53.5833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1690
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:32.3400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.9733333 +00:00' WHERE [ID] = 1693
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1694
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1695
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1696
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.4433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1697
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.5333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1698
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1699
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.7166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1700
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:36.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1703
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.2700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.3400000 +00:00' WHERE [ID] = 1706
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.3566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1707
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1708
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.5233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1709
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.6066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1710
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.6900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1711
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 18:09:37.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1712
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:43.8466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1717
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:44.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1719
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:44.4200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1720
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:44.6300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1721
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:44.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1722
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-04-29 19:12:45.4366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.5033333 +00:00' WHERE [ID] = 1725
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-01 22:14:10.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1728
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-01 22:14:10.6633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1729
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-01 22:38:37.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1730
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-01 22:38:37.8366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1731
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-01 22:42:29.5700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1732
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-02 00:34:19.3066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1733
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-02 00:34:19.4166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1734
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-08 15:34:29.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1742
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-08 15:34:29.6066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1743
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-08 15:34:29.6700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1744
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-08 15:34:29.7333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1745
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-08 15:34:29.8066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.9433333 +00:00' WHERE [ID] = 1746
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-16 14:51:29.6833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1780
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.1400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1942
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.2066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1943
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1944
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.3500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1945
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.4200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1946
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1947
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1948
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1949
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.6900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1950
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.7633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1951
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1952
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.9100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1953
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:45.9800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1954
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.0466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1955
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.1166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1956
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.1800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1957
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1958
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.3166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1959
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.3833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1960
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1963
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.6600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1964
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.7300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1965
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1966
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.8666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1967
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:46.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:33.7133333 +00:00' WHERE [ID] = 1968
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:47.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1969
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:47.0733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.0766667 +00:00' WHERE [ID] = 1970
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:47.1400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1971
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:47.2133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1972
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:23:47.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1973
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:52:44.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1974
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:52:44.5433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1975
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:52:45.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1983
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:52:45.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1984
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 17:52:45.2266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1985
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 18:26:50.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1986
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 18:26:51.0433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1987
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 18:26:51.1066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1988
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-28 18:53:36.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1989
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-29 01:16:55.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 1990
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:00.8166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2003
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:00.9266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2004
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.0500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2005
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2006
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.2900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2007
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.4000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2008
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.5133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2009
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2010
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2011
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2012
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:01.9866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2013
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2014
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.5466667 +00:00' WHERE [ID] = 2015
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2016
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.4666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2017
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2018
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2019
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-05-30 16:17:02.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2020
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-01 23:27:58.6666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2024
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-03 13:12:06.8633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2026
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-04 20:18:01.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2028
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-04 20:18:03.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2029
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:14:00.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2030
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2031
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.2700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2032
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.4166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2033
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2034
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.7100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2035
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:51.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2036
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.0166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2037
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2038
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.3000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2039
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.4533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2040
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.5966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2041
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:30:52.7400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2042
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:45:38.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2043
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-07 10:45:38.9166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2044
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.2900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2143
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2144
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.4100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2145
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.4800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2146
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.5433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2147
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.6800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2149
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2150
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.8333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2151
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2152
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:35.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2153
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.0300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2154
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2155
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2156
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2157
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.2833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2158
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2159
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2160
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.4966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2161
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2162
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.6933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2164
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:36.8466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2166
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:34.9800000 +00:00' WHERE [ID] = 2170
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.3200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2172
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2174
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.5933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2176
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.6733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2177
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:37.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2178
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.4433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2187
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2188
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2189
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2191
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2192
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:38.9200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2193
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2194
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2195
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.1533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2196
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2197
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2198
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2199
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.4900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2200
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.5666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2201
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.6466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2202
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.7200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2203
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.8066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2204
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.8766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2205
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:39.9433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2206
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2207
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.1166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2208
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2209
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.2766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2210
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2211
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2212
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.5066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2213
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.5766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2214
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-20 17:18:40.6566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2215
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-22 14:46:35.9333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2257
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-22 14:46:36.0266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2258
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:21.5833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2267
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:21.7233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2268
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:21.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2269
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:21.9800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2270
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:22.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2272
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:22.3833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2273
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:22.5133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2274
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:22.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2275
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-25 17:55:22.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2276
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-06-28 16:48:06.3133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2283
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-02 22:48:43.6033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2521
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.2500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2522
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.3266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2523
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.3966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2524
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.5966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2527
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2529
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.8366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2530
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-04 11:20:35.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2531
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:16.6700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.4033333 +00:00' WHERE [ID] = 2535
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:16.7533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2536
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:16.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2537
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:16.9766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2538
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:17.0633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2539
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:17.1500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2540
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-08 04:18:17.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2541
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-09 13:56:03.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2544
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-09 13:56:03.6366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2547
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-09 13:56:03.7300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2548
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 02:59:26.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2580
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 21:28:05.0266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2581
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:55.7666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2582
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:55.8233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2583
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:55.8800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2584
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:55.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2585
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:55.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2586
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.0366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2587
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2588
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.1433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2589
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.1966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2590
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.2500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2591
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-13 22:11:56.3033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2592
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-07-14 01:13:00.3300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2594
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-28 16:36:11.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2604
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-30 19:35:13.4733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2623
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-08-30 19:49:22.3566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2624
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-08-30 19:49:22.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2625
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-30 19:49:22.4966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2626
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-30 19:49:22.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2627
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-30 19:49:22.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2628
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-31 15:27:32.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2634
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-31 15:27:32.7866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2635
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-08-31 18:28:01.3366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2636
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2643
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.2966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2644
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2645
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2646
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.5000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2647
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.5666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2648
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2649
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-02 20:47:06.7033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2650
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-05 21:37:57.0100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2664
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:54.8833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2706
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:54.9533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2707
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2708
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2709
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2710
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.2266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2711
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-09-06 17:01:55.3033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2712
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.3766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2713
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.4466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2714
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2715
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:01:55.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2716
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:27.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2717
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:27.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2718
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:27.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2719
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:27.8533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2720
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:27.9266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2721
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:28.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2722
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-09-06 17:09:28.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2723
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-09-06 17:09:28.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2724
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:28.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2725
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:28.3066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2726
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:28.3800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2727
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-06 17:09:28.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2728
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-09-06 17:09:28.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2729
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:48.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2745
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:48.9433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2746
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2747
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2748
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.1700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2749
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2750
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2751
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.3900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2752
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.4600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2753
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 01:43:49.5366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2754
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.5766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2756
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.6533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2757
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2758
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.8166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2759
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.8933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2760
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:23.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2761
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-10 14:04:24.0400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2762
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:47:59.8966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2765
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.0300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2766
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2767
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.3900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2769
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.5100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2770
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.6400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2771
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.7900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2772
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:00.9133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2773
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:01.0533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2774
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:01.2100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2775
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:01.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2776
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 21:48:01.4833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2777
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 22:10:18.9100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2778
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-11 22:10:19.0266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2779
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-12 17:51:44.3000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2781
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-12 18:26:22.6566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2785
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-12 18:26:22.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2787
UPDATE [__mj].[EntityField] SET [Sequence]=18, [__mj_CreatedAt]='2023-09-13 19:19:34.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2790
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-13 19:19:34.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2791
UPDATE [__mj].[EntityField] SET [Sequence]=32, [__mj_CreatedAt]='2023-09-14 02:47:43.2833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2792
UPDATE [__mj].[EntityField] SET [Sequence]=33, [__mj_CreatedAt]='2023-09-14 02:47:43.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2793
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:32.7066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2794
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:32.7966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2795
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:32.8766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2796
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:32.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2797
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:33.0500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2798
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:33.3233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2799
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-09-30 22:23:33.4066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2800
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-20 20:04:15.4966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2802
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-20 20:04:15.5966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2803
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-20 20:04:15.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2804
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-23 22:29:33.2200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2805
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.3333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2806
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.4766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2807
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.6100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2808
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2809
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.8633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.2500000 +00:00' WHERE [ID] = 2810
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:53.9900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2811
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:35.8166667 +00:00' WHERE [ID] = 2812
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.2533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2813
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.3833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2814
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.5100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2815
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.6433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2816
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.7700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2817
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:54.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2818
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.0233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2819
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.1466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2820
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.2766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2821
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:36.6900000 +00:00' WHERE [ID] = 2822
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2823
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.6600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2824
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-10-26 21:31:55.7900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 2825
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:00.4233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3079
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:00.5233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3080
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:00.7233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3082
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:00.8200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3083
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:01.0233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3085
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:01.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3086
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:01.2200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3087
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:01.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3090
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:01.6433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3091
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:01.8333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3093
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:01.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3094
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.0366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3095
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.1333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3096
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.2333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3097
UPDATE [__mj].[EntityField] SET [Sequence]=16, [__mj_CreatedAt]='2023-12-29 19:44:02.3500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3098
UPDATE [__mj].[EntityField] SET [Sequence]=17, [__mj_CreatedAt]='2023-12-29 19:44:02.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3099
UPDATE [__mj].[EntityField] SET [Sequence]=18, [__mj_CreatedAt]='2023-12-29 19:44:02.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3100
UPDATE [__mj].[EntityField] SET [Sequence]=19, [__mj_CreatedAt]='2023-12-29 19:44:02.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3101
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3102
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3103
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:02.9500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3104
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.0500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3105
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.1500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3106
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.2500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3107
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.3500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3108
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3109
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3110
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3111
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2023-12-29 19:44:03.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3112
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3113
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:03.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3114
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.1666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3116
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.2666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3117
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3118
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.4633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3119
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3120
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.6633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3121
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:04.7633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3122
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:05.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3126
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:44:05.2633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3127
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:49:42.8833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3128
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:49:42.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3129
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2023-12-29 19:49:43.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3130
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-01-15 01:37:18.7666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3131
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-01-15 01:37:22.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3132
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-01-15 02:03:49.2133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3133
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:48:59.1900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3221
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:48:59.3900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3222
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:48:59.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3223
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:48:59.7866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3224
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:00.0566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3225
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:00.2500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3226
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:00.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3227
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:00.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3228
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:00.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3229
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:01.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3230
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:01.3266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3231
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:01.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3232
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:02.2500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3235
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:02.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3236
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:02.6533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3237
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:02.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3238
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:03.0400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3239
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:03.2600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3240
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:03.4600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3241
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:03.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.1833333 +00:00' WHERE [ID] = 3242
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 15:49:03.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3243
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-02-02 15:50:50.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3246
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-02-02 15:50:50.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3248
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-02-02 15:50:50.6300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3249
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 17:38:50.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3250
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 17:38:50.4366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3251
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 17:38:50.6366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3252
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 19:47:32.5733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3255
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 19:47:32.7533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3256
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-02 19:47:32.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3257
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-03 22:47:37.2033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3260
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-03 22:47:37.4633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3261
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-03 22:47:37.7166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3262
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-05 03:04:16.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3263
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-05 03:04:17.2966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3264
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-05 03:06:40.9966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3265
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:27.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3462
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:27.9666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3463
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.0300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3464
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.0966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3465
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3466
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.2200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3467
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.2833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3468
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3469
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.4066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3470
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3471
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.6566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3474
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.7200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3475
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3476
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3477
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:28.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.6000000 +00:00' WHERE [ID] = 3478
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3481
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.1500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3482
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.2133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3483
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.2766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3484
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.3400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3485
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3486
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.4633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3487
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3488
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3489
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3490
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.7100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3491
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.7700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3492
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3493
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3494
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:29.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3495
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3498
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.2200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3499
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.2833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3500
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3501
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.4100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:37.9500000 +00:00' WHERE [ID] = 3502
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:05:30.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3503
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:06:08.8866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3506
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-09 02:06:08.9500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3507
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-02-09 02:06:09.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3508
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-02-09 02:06:09.1366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3510
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3511
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.3666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3512
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.5100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3513
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.4966667 +00:00' WHERE [ID] = 3514
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3515
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:17.9466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3516
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3517
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3518
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.3766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3519
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.5200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3520
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.6600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3521
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.8066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3522
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:18.9466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3523
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:19.0866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3524
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:19.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3525
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:19.3700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3526
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:18:19.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3527
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:19:30.4566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3528
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-13 23:19:30.6000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3529
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:28:28.4933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3530
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:28:28.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3531
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:28:28.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3532
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:29:41.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3533
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:29:41.9200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3534
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:58:25.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3536
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 14:58:25.2200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3537
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 15:57:57.7266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3538
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-14 15:57:57.8633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3539
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3540
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.1500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3541
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3542
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.2866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3543
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.3566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3544
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.4233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3545
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.4900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3546
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.5566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3547
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3548
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.6900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3549
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.7566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3550
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.8233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3551
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.8866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3552
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:06.9500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3553
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3554
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3555
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.1466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3556
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.2133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3557
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3558
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3559
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.4100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3560
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.4766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3561
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:07.5433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3562
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.1366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3563
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.2033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3564
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.2700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3565
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.3400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3566
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.4066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3567
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-20 23:28:45.4766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3568
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-02-23 22:04:39.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3569
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-08 02:04:17.8133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3570
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-08 02:04:17.8800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3571
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-08 02:04:17.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3572
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-08 02:04:18.0033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3573
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-03-08 02:04:18.0666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3574
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-03-08 02:04:18.1266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3575
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-08 02:04:18.1900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3576
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.5833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3583
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.6466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3584
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.7100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3585
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.7733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3586
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.8366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3587
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3588
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:49.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3589
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.0266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3590
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3591
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3592
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3593
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3594
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3595
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.4100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3596
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.4833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3597
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3598
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.6133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3599
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.6800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3600
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3601
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.8066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3602
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3603
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3604
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:50.9933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3605
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.0566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3606
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.1200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3607
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.1833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3608
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3609
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3610
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.3700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3611
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.4333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3612
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:22:51.5000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3613
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:23:31.9266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3614
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:23:31.9933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3615
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:23:32.0633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3616
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:23:32.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3617
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-16 22:23:32.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3618
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-21 22:43:29.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3631
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-22 17:16:20.4133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3632
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-23 15:14:41.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3633
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.1066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3634
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.4000000 +00:00' WHERE [ID] = 3635
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.3500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3636
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.4733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3637
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.5933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3638
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3639
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.8366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3640
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:03.9566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3641
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.0766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:38.8500000 +00:00' WHERE [ID] = 3642
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.1966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3643
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.3233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.3566667 +00:00' WHERE [ID] = 3644
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.4500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3645
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.5733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3646
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.6966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3647
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-29 20:48:04.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3648
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-03-30 15:25:12.8900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3649
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-30 15:37:39.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3650
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-03-30 15:37:39.2266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3651
UPDATE [__mj].[EntityField] SET [Sequence]=5, [__mj_CreatedAt]='2024-04-03 22:29:27.0466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3652
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-03 22:29:27.1133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3653
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-03 22:29:27.1800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3654
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-03 22:29:27.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3655
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-08 22:44:55.6000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3665
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-08 22:44:55.6633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3666
UPDATE [__mj].[EntityField] SET [Sequence]=9, [__mj_CreatedAt]='2024-04-12 19:44:11.6933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3667
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:44:11.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3668
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:44:11.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3669
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.0100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3670
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-04-12 19:45:04.0700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3671
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3672
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.1900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3673
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.2566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3674
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-04-12 19:45:04.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3675
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3676
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.6800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3677
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-12 19:45:04.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3678
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.2633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3682
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.3266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3683
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.3933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3684
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.4600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3685
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3686
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3687
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.6533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3688
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.7166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3689
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:39.8000000 +00:00' WHERE [ID] = 3690
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.2433333 +00:00' WHERE [ID] = 3691
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3692
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:52.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3693
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.0333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3694
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.0966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3695
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3696
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.2266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3697
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.2900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3698
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3699
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.4166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3700
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.6066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3703
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.6700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3704
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.7333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3705
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.7966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3706
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:53.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3707
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3710
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.1233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3711
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.1800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3712
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3713
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3714
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.0300000 +00:00' WHERE [ID] = 3715
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.4400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3716
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.5033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3717
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.5666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:41.5533333 +00:00' WHERE [ID] = 3718
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3719
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.6966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3720
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3721
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.8266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3722
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.8900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3723
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:54.9533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3724
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3725
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.0400000 +00:00' WHERE [ID] = 3726
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.1466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3727
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.2100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3728
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.2766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.5400000 +00:00' WHERE [ID] = 3729
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.3400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3730
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3731
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:14:55.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3732
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-04-30 17:16:01.6300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3733
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-04-30 17:16:01.6966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3734
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:16:01.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3735
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:16:01.8233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3736
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:16:01.8866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3737
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-04-30 17:16:01.9500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3738
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-07 21:25:08.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3739
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-07 21:25:08.2833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:40.5933333 +00:00' WHERE [ID] = 3740
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3744
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.5966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3745
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.6666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3746
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3747
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3748
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:00.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3749
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.0566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3752
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.1200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3753
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.1800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3754
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3757
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.5000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3759
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3760
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 20:48:01.6300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3761
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-22 20:49:10.2933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3764
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-22 21:13:38.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3766
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-23 00:49:03.5033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3768
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-23 15:04:16.3266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 3769
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:02.2133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7858
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:02.2900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7859
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:02.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7860
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:02.4366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7861
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:02.5100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:42.9733333 +00:00' WHERE [ID] = 7862
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.2933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7873
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7874
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.4366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7875
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.5100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.4000000 +00:00' WHERE [ID] = 7876
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.7300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7879
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.7966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7880
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.8666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7881
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:03.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:43.8400000 +00:00' WHERE [ID] = 7882
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.1433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7885
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.2066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7886
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.3333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7888
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.4000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7889
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.4633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7890
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7891
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7892
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.6566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7893
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7896
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.9166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7897
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:04.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7898
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.0466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7899
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.1100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7900
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.1733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7901
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.2366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.2666667 +00:00' WHERE [ID] = 7902
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.3000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7903
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7904
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.4233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7905
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7906
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:44.6966667 +00:00' WHERE [ID] = 7907
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.7333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7910
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.7966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7911
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7912
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.9233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7913
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:05.9933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.1366667 +00:00' WHERE [ID] = 7914
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:06.7233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7925
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:06.7900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7926
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:06.8566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7927
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:06.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7928
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7929
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.2100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7932
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7933
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7934
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.4266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7935
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.4966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7936
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.5700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7937
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.6433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7938
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7939
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7940
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7941
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.9133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7942
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:07.9766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7943
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.0400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7944
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.1033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7945
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.1700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:45.6066667 +00:00' WHERE [ID] = 7946
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7947
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.3000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7948
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7949
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7950
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.4900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7951
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7952
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7955
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.8100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7956
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7957
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:08.9333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7958
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:52:09.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7959
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-25 22:53:44.5066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7960
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-25 22:53:44.5700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7961
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-25 22:53:44.6366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7962
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-25 22:53:44.7733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7964
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-25 22:53:44.8366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7965
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:53:44.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7966
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-25 22:53:44.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7967
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-26 20:48:01.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7968
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-26 20:48:01.7666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7969
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-05-26 20:49:35.3633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7971
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-26 20:49:35.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7974
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-26 20:49:35.6100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7975
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-26 20:49:35.6733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7976
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.5566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7977
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.6233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7978
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.6900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7979
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.7566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7980
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.8200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:46.0266667 +00:00' WHERE [ID] = 7981
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.8900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.0033333 +00:00' WHERE [ID] = 7982
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:14.9566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7983
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:15.0233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7984
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:15.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7985
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:15.1533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7986
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:32:15.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7987
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-29 21:33:51.0233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7988
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-30 00:28:09.1666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7989
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-30 12:59:05.0533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7990
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.6366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7991
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.7033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7992
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.7666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7993
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.8333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7994
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.8966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7995
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:48.9633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7996
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:49.0300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7997
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:49.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7998
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:49.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 7999
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:00:49.2166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.4366667 +00:00' WHERE [ID] = 8000
UPDATE [__mj].[EntityField] SET [Sequence]=5, [__mj_CreatedAt]='2024-05-31 17:00:49.3533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8002
UPDATE [__mj].[EntityField] SET [Sequence]=6, [__mj_CreatedAt]='2024-05-31 17:00:49.4200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8003
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:02:27.9200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8006
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 17:02:27.9833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8007
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:17:44.3966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8009
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8010
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.6433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8011
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.6933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8012
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.7466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8013
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8014
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.8500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8015
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 18:35:09.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8016
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 19:17:36.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8017
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 22:28:08.1866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8018
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-05-31 22:46:09.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:26.0766667 +00:00' WHERE [ID] = 8019
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-02 13:06:36.7033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8020
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-02 13:06:36.7733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8021
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-02 13:06:36.8433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8022
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-02 13:06:36.9100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8023
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.4366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8031
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.5033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8032
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.5733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8033
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:47.8133333 +00:00' WHERE [ID] = 8034
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.7200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8035
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.7900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8036
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8037
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.9233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8038
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:19.9900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8039
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.0533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8040
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.1200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.1700000 +00:00' WHERE [ID] = 8041
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.1866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:48.6800000 +00:00' WHERE [ID] = 8042
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.2600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8043
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.3266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8044
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.4000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8045
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.4733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8046
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8047
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.6200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8048
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.6833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8049
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.0200000 +00:00' WHERE [ID] = 8050
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.8233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8051
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8052
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:20.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8053
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.0366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8054
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.1000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8055
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8056
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.2266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8057
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.2866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.3800000 +00:00' WHERE [ID] = 8058
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.3566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8059
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.4166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:49.9300000 +00:00' WHERE [ID] = 8060
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.4800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8061
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8062
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.6133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8063
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.6733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8064
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.7366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8065
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8066
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8067
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8068
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:21.9966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8069
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:22.0700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8070
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:22.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8071
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:22:22.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8072
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:24:07.6066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8074
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:24:07.6700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8075
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 10:24:07.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8076
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 11:28:20.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8077
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 11:30:05.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8078
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-05 11:30:05.9233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8079
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8080
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.6933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8081
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.7533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8082
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.8166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8083
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.8800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8084
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:12.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8085
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.0033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8086
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.0633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8087
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.1333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8088
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.1933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8089
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.2766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8090
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8091
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.4066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8092
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:02:13.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8093
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:03:59.5633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8094
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:03:59.6300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8095
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:03:59.6966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8096
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 01:03:59.7600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8097
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.6166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8099
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.6800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8100
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.7400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8101
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8102
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8103
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:44.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8104
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.0000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8105
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.0700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8106
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.1333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8107
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.1966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8108
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.2600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8109
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.3200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8110
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.3966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8111
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.4566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8112
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8113
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.5900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:50.4200000 +00:00' WHERE [ID] = 8114
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.6533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8115
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8116
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8117
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.8400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8118
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.9066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8119
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:45.9733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8120
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:46.0333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8121
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:46.1000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8122
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:46.1600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8123
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:40:46.2233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8124
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:42:34.9133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8125
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:42:34.9766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8126
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:42:35.0400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8127
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 15:42:35.1000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8128
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 16:04:19.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8129
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-08 18:34:56.6566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8130
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:29.5766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8131
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:29.7300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8132
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:29.8766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8133
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.0366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8134
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.1866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8135
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.3466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8136
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8137
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.6366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8138
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:30.7966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8139
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:31.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8140
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:31.3900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8141
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:31.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8142
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:31.7033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8143
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:31.8633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8144
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.0233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8145
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.1766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:51.0066667 +00:00' WHERE [ID] = 8146
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.3333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8147
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8148
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.6200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8149
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.7633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8150
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:32.9333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8151
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.0900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8152
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.2533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8153
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.4100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8154
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.5833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8155
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.7433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8156
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:19:33.9000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8157
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:26:40.8733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8158
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:26:41.1633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8159
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:26:41.3200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8160
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 00:26:41.4866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8161
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 17:12:19.5733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8162
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 17:12:19.7233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8163
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 19:08:05.4166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8164
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 19:08:05.5700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8165
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 19:08:05.7233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8166
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 19:08:05.8800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8167
UPDATE [__mj].[EntityField] SET [DefaultValue]=NULL, [__mj_CreatedAt]='2024-06-10 19:11:33.6100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8171
UPDATE [__mj].[EntityField] SET [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-06-10 19:11:33.7466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8172
UPDATE [__mj].[EntityField] SET [Sequence]=41, [__mj_CreatedAt]='2024-06-10 20:17:05.0833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8173
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 20:17:05.2400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8174
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 20:17:05.3966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8175
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 20:17:05.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8176
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-10 20:17:05.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8177
UPDATE [__mj].[EntityField] SET [Sequence]=42, [__mj_CreatedAt]='2024-06-11 16:26:26.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8180
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-11 16:26:26.9300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8181
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-11 16:26:27.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8182
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-11 16:26:27.2466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8183
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-11 16:26:27.4033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8184
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-11 16:26:27.5466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8185
UPDATE [__mj].[EntityField] SET [ValueListType]=N'List', [__mj_CreatedAt]='2024-06-12 04:00:33.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:31.8233333 +00:00' WHERE [ID] = 8186
UPDATE [__mj].[EntityField] SET [AllowsNull]=0, [DefaultValue]=N'(N''Internal'')', [ValueListType]=N'List', [__mj_CreatedAt]='2024-06-12 04:00:34.0800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:32.1866667 +00:00' WHERE [ID] = 8187
UPDATE [__mj].[EntityField] SET [__mj_CreatedAt]='2024-06-12 04:00:34.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8188
UPDATE [__mj].[EntityField] SET [Sequence]=14, [__mj_CreatedAt]='2024-06-12 04:00:34.3766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8189
UPDATE [__mj].[EntityField] SET [Sequence]=16, [Type]=N'datetimeoffset', [Length]=10, [Precision]=34, [Scale]=7, [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-06-12 04:00:34.5233333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8190
UPDATE [__mj].[EntityField] SET [Sequence]=17, [Type]=N'datetimeoffset', [Length]=10, [Precision]=34, [Scale]=7, [DefaultValue]=N'(getutcdate())', [__mj_CreatedAt]='2024-06-12 04:00:34.6633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:29:12.1866667 +00:00' WHERE [ID] = 8191
PRINT(N'Operation applied to 1253 rows out of 1253')

PRINT(N'Update rows in [__mj].[DatasetItem]')
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 4
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 5
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 6
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 7
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 8
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 9
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 10
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 11
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 13
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 14
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 15
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 18
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 19
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 20
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 21
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 22
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 23
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 24
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 25
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt' WHERE [ID] = 26
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 27
UPDATE [__mj].[DatasetItem] SET [DateFieldToCheck]=N'__mj_UpdatedAt', [UpdatedAt]='2024-06-17 02:01:45.470' WHERE [ID] = 28
PRINT(N'Operation applied to 22 rows out of 22')

PRINT(N'Update row in [__mj].[CommunicationProviderMessageType]')
UPDATE [__mj].[CommunicationProviderMessageType] SET [AdditionalAttributes]=N'{"field":"val"}' WHERE [ID] = 1

PRINT(N'Update rows in [__mj].[AuditLogType]')
UPDATE [__mj].[AuditLogType] SET [__mj_CreatedAt]='2023-05-01 20:42:48.5033333 +00:00', [__mj_UpdatedAt]='2023-05-01 20:42:48.5033333 +00:00' WHERE [ID] = 2
UPDATE [__mj].[AuditLogType] SET [__mj_CreatedAt]='2023-05-01 20:43:09.6333333 +00:00', [__mj_UpdatedAt]='2023-05-01 20:43:09.6333333 +00:00' WHERE [ID] = 3
UPDATE [__mj].[AuditLogType] SET [__mj_CreatedAt]='2023-05-02 00:46:18.9600000 +00:00', [__mj_UpdatedAt]='2023-05-02 00:46:18.9600000 +00:00' WHERE [ID] = 4
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Update rows in [__mj].[ApplicationEntity]')
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2023-04-05 15:48:41.3500000 +00:00' WHERE [ID] = 8
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 9
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 10
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 14
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 15
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2023-04-05 15:48:41.3500000 +00:00' WHERE [ID] = 16
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-04-05 15:48:41.3500000 +00:00', [__mj_UpdatedAt]='2023-04-05 15:48:41.3500000 +00:00' WHERE [ID] = 17
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-05-15 03:46:33.7100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 21
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-05-30 20:25:52.9700000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 31
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-05-30 20:25:52.9700000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 32
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-05-30 20:25:52.9700000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 33
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2023-09-30 22:22:41.8100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 34
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-02 15:47:28.1000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 52
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-02 15:47:29.9000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 53
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-02 15:47:31.7233333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 54
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-02 19:46:17.5166667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 55
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-09 02:04:55.4400000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 70
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-09 02:04:55.9966667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 71
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-09 02:04:56.5566667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 72
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-09 02:04:57.1100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 73
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-09 02:04:58.2166667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 75
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-13 23:17:10.5500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 76
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-13 23:17:11.8366667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 77
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-20 23:27:29.8366667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 78
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-02-20 23:27:30.4366667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 79
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:44.1233333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 92
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:44.1833333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 93
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:44.2466667 +00:00', [__mj_UpdatedAt]='2024-03-24 16:37:44.2466667 +00:00' WHERE [ID] = 94
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:44.3100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 95
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:44.3700000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 96
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:45.4433333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 97
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.1100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 98
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.1666667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 99
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.2233333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 100
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.2833333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 101
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.3400000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 102
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-24 16:37:46.4000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 103
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-03-29 20:46:33.3266667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 108
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-04 20:52:40.3233333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 110
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-04 20:52:40.3800000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 111
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-04 20:52:40.4400000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 112
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-04 20:52:40.5000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 113
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-30 17:14:00.7033333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 116
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-30 17:14:01.2733333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 117
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-30 17:14:01.8333333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 118
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-30 17:14:02.3900000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 119
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-04-30 17:14:02.9566667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 120
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 20:47:08.0666667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 121
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 20:47:08.6266667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 122
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 20:47:09.1900000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 123
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 23:12:57.8800000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 125
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 23:13:03.4100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 126
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-22 23:13:06.4100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 127
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:43.4500000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 149
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:44.6000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 151
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:45.1833333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 152
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:45.7666667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 153
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:46.3333333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 154
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:46.9100000 +00:00', [__mj_UpdatedAt]='2024-05-25 22:50:46.9100000 +00:00' WHERE [ID] = 155
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:47.4900000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 156
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:48.6466667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 158
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:49.2200000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 159
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:49.8066667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 160
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:50.4133333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 161
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-25 22:50:51.0300000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 162
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-29 21:30:58.9100000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 163
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-31 16:59:30.9000000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 164
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-31 16:59:31.4766667 +00:00', [__mj_UpdatedAt]='2024-05-31 16:59:31.4766667 +00:00' WHERE [ID] = 165
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-05-31 18:34:01.5733333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 166
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-05 10:20:55.1400000 +00:00', [__mj_UpdatedAt]='2024-06-05 10:20:55.1400000 +00:00' WHERE [ID] = 168
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-05 10:20:55.7166667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 169
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-05 10:20:56.3033333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 170
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-05 10:20:56.8866667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 171
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-05 10:20:57.4666667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 172
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-08 01:00:50.1933333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 177
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-08 01:00:50.7833333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 178
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-08 15:39:22.0966667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 179
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-08 15:39:22.6833333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 180
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-08 15:39:23.2766667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 181
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 00:15:51.2033333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 182
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 00:15:52.6800000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 183
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 00:15:54.3533333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 184
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 00:15:55.8733333 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 185
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 19:05:20.2400000 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 186
UPDATE [__mj].[ApplicationEntity] SET [__mj_CreatedAt]='2024-06-10 20:13:38.8166667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:20:03.7800000 +00:00' WHERE [ID] = 187
PRINT(N'Operation applied to 85 rows out of 85')

PRINT(N'Update rows in [__mj].[RowLevelSecurityFilter]')
UPDATE [__mj].[RowLevelSecurityFilter] SET [__mj_CreatedAt]='2023-04-30 00:58:41.6833333 +00:00', [__mj_UpdatedAt]='2023-04-30 00:58:41.6833333 +00:00' WHERE [ID] = 1
UPDATE [__mj].[RowLevelSecurityFilter] SET [__mj_CreatedAt]='2023-04-30 00:59:41.7566667 +00:00', [__mj_UpdatedAt]='2023-04-30 00:59:41.7566667 +00:00' WHERE [ID] = 2
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Update rows in [__mj].[Role]')
UPDATE [__mj].[Role] SET [__mj_CreatedAt]='2023-04-03 17:04:11.9400000 +00:00', [__mj_UpdatedAt]='2023-04-03 17:04:11.9400000 +00:00' WHERE [ID] = 1
UPDATE [__mj].[Role] SET [__mj_CreatedAt]='2023-04-03 17:04:28.0866667 +00:00', [__mj_UpdatedAt]='2024-03-23 20:53:47.8633333 +00:00' WHERE [ID] = 2
UPDATE [__mj].[Role] SET [__mj_CreatedAt]='2023-04-03 17:04:41.9166667 +00:00', [__mj_UpdatedAt]='2023-04-03 17:04:41.9166667 +00:00' WHERE [ID] = 3
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Update row in [__mj].[EntityDocumentType]')
UPDATE [__mj].[EntityDocumentType] SET [__mj_CreatedAt]='2024-04-12 16:45:57.2866667 +00:00', [__mj_UpdatedAt]='2024-04-12 16:45:57.2866667 +00:00' WHERE [ID] = 9

PRINT(N'Update row in [__mj].[EntityBehaviorType]')
UPDATE [__mj].[EntityBehaviorType] SET [__mj_CreatedAt]='2024-05-22 23:03:27.7000000 +00:00', [__mj_UpdatedAt]='2024-05-22 23:03:27.7000000 +00:00' WHERE [ID] = 1

PRINT(N'Update rows in [__mj].[EntityActionInvocationType]')
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:23:12.0200000 +00:00', [__mj_UpdatedAt]='2024-05-29 16:23:12.0200000 +00:00' WHERE [ID] = 1
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:23:37.8400000 +00:00', [__mj_UpdatedAt]='2024-05-29 16:23:37.8400000 +00:00' WHERE [ID] = 2
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:23:45.9900000 +00:00', [__mj_UpdatedAt]='2024-05-29 16:23:45.9900000 +00:00' WHERE [ID] = 3
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:23:56.1000000 +00:00', [__mj_UpdatedAt]='2024-05-29 16:23:56.1000000 +00:00' WHERE [ID] = 4
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:24:07.6700000 +00:00', [__mj_UpdatedAt]='2024-05-29 16:24:07.6700000 +00:00' WHERE [ID] = 5
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:24:37.8033333 +00:00', [__mj_UpdatedAt]='2024-05-29 16:24:37.8033333 +00:00' WHERE [ID] = 6
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-29 16:24:50.4733333 +00:00', [__mj_UpdatedAt]='2024-05-29 16:24:50.4733333 +00:00' WHERE [ID] = 7
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-30 00:23:10.9900000 +00:00', [__mj_UpdatedAt]='2024-05-30 00:23:10.9900000 +00:00' WHERE [ID] = 8
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-30 00:23:25.3633333 +00:00', [__mj_UpdatedAt]='2024-05-30 00:23:25.3633333 +00:00' WHERE [ID] = 9
UPDATE [__mj].[EntityActionInvocationType] SET [__mj_CreatedAt]='2024-05-30 00:23:54.2300000 +00:00', [__mj_UpdatedAt]='2024-05-30 00:23:54.2300000 +00:00' WHERE [ID] = 10
PRINT(N'Operation applied to 10 rows out of 10')

PRINT(N'Update rows in [__mj].[Entity]')
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 5
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 6
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 9
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 17
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 18
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 19
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 25
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 26
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 32
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 34
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 35
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 36
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 37
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 39
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 40
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 41
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 42
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 53
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 54
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 70
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 71
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 76
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 77
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 79
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 80
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 87
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 88
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 89
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 90
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 91
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 92
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 93
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-02 18:10:39.2433333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 96
UPDATE [__mj].[Entity] SET [AllowUpdateAPI]=1, [spCreateGenerated]=1, [__mj_CreatedAt]='2023-04-03 21:20:31.6166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 97
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-16 01:39:43.4133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 124
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-27 21:59:00.9866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 125
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-29 17:57:34.7166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 126
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-29 17:57:34.8033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 127
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-04-29 17:57:34.8900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 128
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-04-29 17:57:34.9800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 129
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [AllowUpdateAPI]=1, [__mj_CreatedAt]='2023-04-29 19:11:55.0166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 130
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-28 17:23:26.9266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 135
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-28 17:23:26.9966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 136
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-28 17:23:27.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 137
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-05-28 17:23:27.1300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 138
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-28 17:52:25.2866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 139
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-30 16:16:26.5300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 142
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-30 16:16:26.6400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 143
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-05-30 16:16:26.7500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 144
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 153
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.5733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 154
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.6400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 155
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.7133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 156
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.7933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 157
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:11.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 159
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2023-06-20 17:18:12.0033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 160
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:12.0833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 161
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:12.1566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 162
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:12.2300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 163
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-20 17:18:12.3100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 164
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-25 17:54:06.9666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 168
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-06-25 17:54:24.0566667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 169
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-07-04 11:20:04.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 172
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-07-04 11:20:04.9200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 173
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-07-13 22:11:30.9700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 174
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-09-10 14:03:54.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 180
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-09-30 22:22:41.6400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 181
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-10-26 21:30:51.0066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 182
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2023-10-26 21:30:51.9166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 183
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-02 15:47:27.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 184
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-02 15:47:29.5333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 185
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-02 15:47:31.2600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 186
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-02 19:46:17.0200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 187
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-09 02:04:55.3133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 188
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-09 02:04:55.8700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 189
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-09 02:04:56.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 190
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-09 02:04:56.9866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 191
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-09 02:04:57.5400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 192
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-02-09 02:04:58.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 193
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-13 23:17:10.2666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 194
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-13 23:17:11.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 195
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-20 23:27:29.7000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 196
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-20 23:27:30.2966667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 197
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-02-20 23:27:30.9033333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 198
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-03-16 22:20:30.4333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 199
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-03-16 22:20:30.8000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 200
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-03-16 22:20:31.1700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 201
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-03-16 22:20:31.5266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 202
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-03-29 20:46:33.0833333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 203
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-04-30 17:14:00.5766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 204
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-04-30 17:14:01.1466667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 205
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-04-30 17:14:01.7066667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 206
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-04-30 17:14:02.2666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 207
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-04-30 17:14:02.8266667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 208
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-22 20:47:07.9366667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 209
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-22 20:47:08.5000000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 210
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-22 20:47:09.0600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 211
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:43.3200000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 212
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-25 22:50:44.4700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 214
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-25 22:50:45.0533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 215
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:45.6333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 216
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-25 22:50:46.2100000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 217
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:46.7800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 218
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-25 22:50:47.3600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 219
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:48.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 221
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:49.0933333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 222
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:49.6766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 223
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:50.2800000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 224
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-25 22:50:50.8900000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 225
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-29 21:30:58.7766667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 226
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-31 16:59:30.7700000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 227
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-05-31 16:59:31.3500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 228
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-05-31 18:34:01.4300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 229
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-05 10:20:55.0133333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 231
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-05 10:20:55.5866667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 232
UPDATE [__mj].[Entity] SET [AllowDeleteAPI]=1, [__mj_CreatedAt]='2024-06-05 10:20:56.1733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 233
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-05 10:20:56.7533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 234
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-05 10:20:57.3333333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 235
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-08 01:00:50.0633333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 236
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-08 01:00:50.6500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 237
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-08 15:39:21.9666667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 238
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-08 15:39:22.5500000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 239
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-08 15:39:23.1400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 240
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-10 00:15:50.8600000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 241
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-10 00:15:52.3733333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 242
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-10 00:15:53.8300000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 243
UPDATE [__mj].[Entity] SET [__mj_CreatedAt]='2024-06-10 00:15:55.5533333 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 244
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-06-10 19:05:19.9400000 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 245
UPDATE [__mj].[Entity] SET [TrackRecordChanges]=1, [__mj_CreatedAt]='2024-06-10 20:13:38.5166667 +00:00', [__mj_UpdatedAt]='2024-06-19 02:25:17.3566667 +00:00' WHERE [ID] = 246
PRINT(N'Operation applied to 129 rows out of 129')

PRINT(N'Update rows in [__mj].[Authorization]')
UPDATE [__mj].[Authorization] SET [__mj_CreatedAt]='2023-05-01 20:42:18.4233333 +00:00', [__mj_UpdatedAt]='2023-05-01 20:42:18.4233333 +00:00' WHERE [ID] = 1
UPDATE [__mj].[Authorization] SET [__mj_CreatedAt]='2023-05-01 20:42:38.2200000 +00:00', [__mj_UpdatedAt]='2023-05-01 20:42:38.2200000 +00:00' WHERE [ID] = 2
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Update row in [__mj].[Application]')
UPDATE [__mj].[Application] SET [__mj_CreatedAt]='2023-04-05 15:48:05.4966667 +00:00', [__mj_UpdatedAt]='2024-06-11 20:35:08.2200000 +00:00' WHERE [ID] = 3

PRINT(N'Add row to [__mj].[ActionCategory]')
SET IDENTITY_INSERT [__mj].[ActionCategory] ON
INSERT INTO [__mj].[ActionCategory] ([ID], [Name], [Description], [ParentID], [Status], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (1, N'__mj', N'Restricted Category - only used for core MemberJunction Framework Actions, do not add or modify anything in this category of Actions or modify the category itself.', NULL, N'Pending', '2024-05-27 16:26:39.9400000 +00:00', '2024-05-27 16:26:39.9400000 +00:00')
SET IDENTITY_INSERT [__mj].[ActionCategory] OFF

PRINT(N'Add rows to [__mj].[CommunicationBaseMessageType]')
SET IDENTITY_INSERT [__mj].[CommunicationBaseMessageType] ON
INSERT INTO [__mj].[CommunicationBaseMessageType] ([ID], [Type], [SupportsAttachments], [SupportsSubjectLine], [SupportsHtml], [MaxBytes], [CreatedAt], [UpdatedAt]) VALUES (2, N'SMS', 0, 0, 0, NULL, '2024-06-19 01:34:33.873', '2024-06-19 01:34:33.873')
INSERT INTO [__mj].[CommunicationBaseMessageType] ([ID], [Type], [SupportsAttachments], [SupportsSubjectLine], [SupportsHtml], [MaxBytes], [CreatedAt], [UpdatedAt]) VALUES (3, N'Phone', 0, 0, 0, NULL, '2024-06-19 02:25:12.510', '2024-06-19 02:25:12.510')
SET IDENTITY_INSERT [__mj].[CommunicationBaseMessageType] OFF
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Add rows to [__mj].[Entity]')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [PreferredCommunicationField], [Icon], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (247, NULL, N'Record Change Replay Runs', NULL, N'Table to track the runs of replaying external record changes', 1, N'RecordChangeReplayRun', N'vwRecordChangeReplayRuns', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, NULL, NULL, '2024-06-12 19:27:26.5033333 +00:00', '2024-06-19 02:25:17.3566667 +00:00')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [PreferredCommunicationField], [Icon], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (248, NULL, N'Library Items', NULL, N'Table to store individual library items', 1, N'LibraryItem', N'vwLibraryItems', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, NULL, NULL, '2024-06-13 23:37:51.0533333 +00:00', '2024-06-19 02:25:17.3566667 +00:00')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [PreferredCommunicationField], [Icon], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (249, NULL, N'Entity Relationship Display Components', NULL, N'This table stores a list of components that are available for displaying relationships in the MJ Explorer UI', 1, N'EntityRelationshipDisplayComponent', N'vwEntityRelationshipDisplayComponents', 1, N'__mj', 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, NULL, NULL, '2024-06-18 12:27:52.7266667 +00:00', '2024-06-19 02:25:17.3566667 +00:00')
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Add rows to [__mj].[EntityRelationshipDisplayComponent]')
SET IDENTITY_INSERT [__mj].[EntityRelationshipDisplayComponent] ON
INSERT INTO [__mj].[EntityRelationshipDisplayComponent] ([ID], [Name], [Description], [RelationshipType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (1, N'UserViewGrid', N'This component will display related entity data in a standard grid format and allow for a wide array of functionality like drilling into records, comparing, etc.', N'Both', '2024-06-18 14:59:32.2033333 +00:00', '2024-06-18 14:59:32.2033333 +00:00')
INSERT INTO [__mj].[EntityRelationshipDisplayComponent] ([ID], [Name], [Description], [RelationshipType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (2, N'JoinGrid', N'Used to display related entity data cross-tabulated against a reference type or type table.', N'One to Many', '2024-06-19 01:14:09.1400000 +00:00', '2024-06-19 01:14:09.1400000 +00:00')
SET IDENTITY_INSERT [__mj].[EntityRelationshipDisplayComponent] OFF
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Add rows to [__mj].[TemplateContentType]')
SET IDENTITY_INSERT [__mj].[TemplateContentType] ON
INSERT INTO [__mj].[TemplateContentType] ([ID], [Name], [Description], [CreatedAt], [UpdatedAt]) VALUES (1, N'Text', N'Plain Text', '2024-06-08 16:33:35.947', '2024-06-08 16:33:35.947')
INSERT INTO [__mj].[TemplateContentType] ([ID], [Name], [Description], [CreatedAt], [UpdatedAt]) VALUES (2, N'HTML', N'HTML Content', '2024-06-08 16:34:00.507', '2024-06-08 16:34:00.507')
SET IDENTITY_INSERT [__mj].[TemplateContentType] OFF
PRINT(N'Operation applied to 2 rows out of 2')

PRINT(N'Add row to [__mj].[VersionInstallation]')
SET IDENTITY_INSERT [__mj].[VersionInstallation] ON
INSERT INTO [__mj].[VersionInstallation] ([ID], [MajorVersion], [MinorVersion], [PatchVersion], [Type], [InstalledAt], [Status], [InstallLog], [Comments], [CreatedAt], [UpdatedAt]) VALUES (14, 1, 8, 0, N'New', '2024-06-19 11:30:18.827', N'Pending', NULL, NULL, '2024-06-19 11:30:18.827', '2024-06-19 11:30:18.827')
SET IDENTITY_INSERT [__mj].[VersionInstallation] OFF

PRINT(N'Add rows to [__mj].[ApplicationEntity]')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] ON
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (188, N'Admin', 247, 1045, 1, '2024-06-12 19:27:26.7766667 +00:00', '2024-06-12 19:27:26.7766667 +00:00')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (189, N'Admin', 248, 1046, 1, '2024-06-13 23:37:51.3400000 +00:00', '2024-06-13 23:37:51.3400000 +00:00')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (192, N'Admin', 249, 1047, 1, '2024-06-18 12:27:52.8666667 +00:00', '2024-06-18 12:27:52.8666667 +00:00')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] OFF
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Add rows to [__mj].[EntityField]')
SET IDENTITY_INSERT [__mj].[EntityField] ON
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8193, 97, 13, N'ReplayRunID', N'Replay Run ID', N'For external changes only, this run ID is the link to the replay run that the change record was part of', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 247, N'ID', 0, NULL, N'Search', '2024-06-12 19:30:37.9566667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8194, 247, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:38.1166667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8195, 247, 2, N'StartedAt', N'Started At', N'Timestamp when the replay run started', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:38.2766667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8196, 247, 3, N'EndedAt', N'Ended At', N'Timestamp when the replay run ended', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:38.4300000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8197, 247, 4, N'Status', N'Status', N'Status of the replay run (Pending, In Progress, Complete, Error)', 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, NULL, 0, N'List', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:38.5766667 +00:00', '2024-06-19 02:29:51.5500000 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8198, 247, 5, N'UserID', N'User ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 39, N'ID', 1, N'User', N'Search', '2024-06-12 19:30:38.7200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8199, 247, 6, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:38.8800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8200, 247, 7, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:30:39.0333333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8201, 247, 8, N'User', N'User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-12 19:48:05.0400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8204, 248, 1, N'ID', N'ID', N'Primary key of the LibraryItem table.', 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:38:07.2766667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8205, 248, 2, N'Name', N'Name', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:38:07.4166667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8206, 248, 3, N'LibraryID', N'Library ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 228, N'ID', 1, N'Library', N'Search', '2024-06-13 23:38:07.5700000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8207, 248, 4, N'Type', N'Type', N'Type of the library item for example Class, Interface, etc.', 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, NULL, 0, N'List', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:38:07.7033333 +00:00', '2024-06-19 02:29:52.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8208, 248, 5, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:38:07.8400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8209, 248, 6, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:38:07.9800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8211, 248, 7, N'Library', N'Library', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-13 23:42:01.1400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8225, 53, 8, N'RunByUser', N'Run By User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.0533333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8226, 77, 14, N'Entity', N'Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.1966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8227, 77, 15, N'RoleSQLName', N'Role SQLName', NULL, 1, 0, 0, NULL, N'nvarchar', 500, 0, 0, 1, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.3433333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8228, 77, 16, N'CreateRLSFilter', N'Create RLSFilter', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.4833333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8229, 77, 17, N'ReadRLSFilter', N'Read RLSFilter', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.6266667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8230, 77, 18, N'UpdateRLSFilter', N'Update RLSFilter', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.7666667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8231, 77, 19, N'DeleteRLSFilter', N'Delete RLSFilter', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-14 16:45:45.9133333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8233, 5, 7, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.0633333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8234, 5, 8, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.1266667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8235, 18, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.1933333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8236, 18, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.2566667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8237, 19, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.3200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8238, 19, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.3800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8239, 71, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.4500000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8240, 71, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.5166667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8241, 212, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.5833333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8242, 212, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.6533333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8243, 218, 15, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.7266667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8244, 218, 16, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.8000000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8245, 221, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.8666667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8246, 221, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 15:09:41.9400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8247, 6, 11, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.1966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8248, 6, 12, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.2600000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8249, 39, 13, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.3466667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8250, 39, 14, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.4066667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8251, 42, 20, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.4700000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8252, 42, 21, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:11:44.5400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8253, 36, 38, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.4100000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8254, 36, 39, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.4800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8255, 37, 43, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.5566667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8256, 37, 44, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.6200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8257, 40, 21, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.6833333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8258, 40, 22, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.7433333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8259, 77, 12, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.8200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8260, 77, 13, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.8833333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8261, 130, 8, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:17.9466667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8262, 130, 9, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.0133333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8263, 138, 14, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.0766667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8264, 138, 15, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.1533333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8265, 189, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.2200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8266, 189, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.2866667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8267, 190, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.3566667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8268, 190, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.4200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8269, 192, 10, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.4933333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8270, 192, 11, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.5666667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8271, 193, 11, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.6400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8272, 193, 12, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.6966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8273, 205, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.7600000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8274, 205, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.8300000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8275, 206, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.8933333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8276, 206, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:18.9566667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8277, 209, 9, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.0200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8278, 209, 10, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.1000000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8279, 210, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.1633333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8280, 210, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.2300000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8281, 214, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.2966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8282, 214, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.3600000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8283, 215, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.4266667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8284, 215, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.5000000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8285, 217, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.5700000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8286, 217, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.6466667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8287, 219, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.7133333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8288, 219, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.7866667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8289, 245, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.8500000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8290, 245, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.9233333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8291, 246, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:19.9866667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8292, 246, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-16 16:27:20.0500000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8293, 25, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.1200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8294, 25, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.1866667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8295, 76, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.2500000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8296, 76, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.3100000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8297, 124, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.3800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8298, 124, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.4433333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8299, 125, 5, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.5066667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8300, 125, 6, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.5666667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8301, 127, 7, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.6266667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8302, 127, 8, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.6966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8303, 129, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.7600000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8304, 129, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.8200000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8305, 160, 7, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.8900000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8306, 160, 8, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:12.9533333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8307, 184, 14, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.0133333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8308, 184, 15, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.0766667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8309, 185, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.1400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8310, 185, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.2000000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8311, 186, 13, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.2633333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8312, 186, 14, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.3233333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8313, 187, 4, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.3866667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8314, 187, 5, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.4433333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8315, 211, 6, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.5066667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8316, 211, 7, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.5700000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8317, 228, 7, N'__mj_CreatedAt', N'__mj _Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.6300000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8318, 228, 8, N'__mj_UpdatedAt', N'__mj _Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 00:13:13.6933333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8319, 40, 14, N'DisplayLocation', N'Display Location', NULL, 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, N'(N''After Field Tabs'')', 0, N'List', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 10:20:29.3066667 +00:00', '2024-06-19 02:29:29.5800000 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8320, 40, 16, N'DisplayIconType', N'Display Icon Type', N'When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed', 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, N'(N''Related Entity Icon'')', 0, N'List', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 10:20:29.3733333 +00:00', '2024-06-19 02:29:28.8766667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8321, 40, 17, N'DisplayIcon', N'Display Icon', N'If specified, the icon ', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 10:20:29.4400000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8322, 97, 18, N'Entity', N'Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 23:43:05.9500000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8323, 97, 19, N'User', N'User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 23:43:06.0166667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8324, 97, 20, N'Integration', N'Integration', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-17 23:43:06.0800000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8325, 36, 37, N'RelatedEntityDisplayType', N'Related Entity Display Type', N'Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown', 1, 0, 0, NULL, N'nvarchar', 40, 0, 0, 0, N'(N''Search'')', 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.4966667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8326, 40, 19, N'DisplayComponentID', N'Display Component ID', N'If specified, this component will be used for displaying the relationship within the parent entity''s form', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 249, N'ID', 1, NULL, N'Search', '2024-06-18 12:29:43.5766667 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8327, 40, 20, N'DisplayComponentConfiguration', N'Display Component Configuration', N'If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.6533333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8328, 249, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.7300000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8329, 249, 2, N'Name', N'Name', NULL, 1, 0, 1, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.7933333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8330, 249, 3, N'Description', N'Description', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.8633333 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8331, 249, 4, N'RelationshipType', N'Relationship Type', N'The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".', 1, 0, 0, NULL, N'nvarchar', 40, 0, 0, 0, NULL, 0, N'List', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:43.9300000 +00:00', '2024-06-19 02:29:52.6200000 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8332, 249, 5, N'__mj_CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 1, NULL, 100, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:44.0000000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [RelatedEntityDisplayType], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (8333, 249, 6, N'__mj_UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetimeoffset', 10, 34, 7, 0, N'(getutcdate())', 0, N'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, N'Search', '2024-06-18 12:29:44.0700000 +00:00', '2024-06-19 02:29:12.1866667 +00:00')
SET IDENTITY_INSERT [__mj].[EntityField] OFF
PRINT(N'Operation applied to 124 rows out of 124')

PRINT(N'Add rows to [__mj].[EntityPermission]')
SET IDENTITY_INSERT [__mj].[EntityPermission] ON
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (716, 247, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-12 19:27:26.9133333 +00:00', '2024-06-12 19:27:26.9133333 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (717, 247, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-12 19:27:27.0466667 +00:00', '2024-06-12 19:27:27.0466667 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (718, 247, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-12 19:27:27.1900000 +00:00', '2024-06-12 19:27:27.1900000 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (719, 248, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-13 23:37:51.4800000 +00:00', '2024-06-13 23:37:51.4800000 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (720, 248, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-13 23:37:51.6133333 +00:00', '2024-06-13 23:37:51.6133333 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (721, 248, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-13 23:37:51.7500000 +00:00', '2024-06-13 23:37:51.7500000 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (728, 249, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-18 12:27:52.9600000 +00:00', '2024-06-18 12:27:52.9600000 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (729, 249, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-18 12:27:53.0366667 +00:00', '2024-06-18 12:27:53.0366667 +00:00')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (730, 249, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-18 12:27:53.1033333 +00:00', '2024-06-18 12:27:53.1033333 +00:00')
SET IDENTITY_INSERT [__mj].[EntityPermission] OFF
PRINT(N'Operation applied to 9 rows out of 9')

PRINT(N'Add rows to [__mj].[EntityFieldValue]')
SET IDENTITY_INSERT [__mj].[EntityFieldValue] ON
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (174, 247, N'Status', 1, N'Pending', N'Pending', NULL, '2024-06-12 19:31:32.4500000 +00:00', '2024-06-19 02:29:51.2100000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (175, 247, N'Status', 2, N'In Progress', N'In Progress', NULL, '2024-06-12 19:31:32.5933333 +00:00', '2024-06-19 02:29:51.2833333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (176, 247, N'Status', 3, N'Complete', N'Complete', NULL, '2024-06-12 19:31:32.7400000 +00:00', '2024-06-19 02:29:51.3600000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (177, 247, N'Status', 4, N'Error', N'Error', NULL, '2024-06-12 19:31:32.8900000 +00:00', '2024-06-19 02:29:51.4366667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (178, 97, N'Type', 1, N'Create', N'Create', NULL, '2024-06-12 19:57:28.6533333 +00:00', '2024-06-19 02:29:31.5933333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (179, 97, N'Type', 2, N'Update', N'Update', NULL, '2024-06-12 19:57:28.8033333 +00:00', '2024-06-19 02:29:31.6600000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (180, 97, N'Type', 3, N'Delete', N'Delete', NULL, '2024-06-12 19:57:28.9500000 +00:00', '2024-06-19 02:29:31.7266667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (181, 97, N'Source', 1, N'Internal', N'Internal', NULL, '2024-06-12 20:38:59.7900000 +00:00', '2024-06-19 02:29:32.0233333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (182, 97, N'Source', 2, N'External', N'External', NULL, '2024-06-12 20:38:59.9333333 +00:00', '2024-06-19 02:29:32.0866667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (183, 97, N'Status', 3, N'Error', N'Error', NULL, '2024-06-12 20:54:45.6933333 +00:00', '2024-06-19 02:29:32.5166667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (184, 248, N'Type', 1, N'Class', N'Class', NULL, '2024-06-13 23:39:05.6400000 +00:00', '2024-06-19 02:29:51.7600000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (185, 248, N'Type', 2, N'Interface', N'Interface', NULL, '2024-06-13 23:39:05.7800000 +00:00', '2024-06-19 02:29:51.8233333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (188, 248, N'Type', 5, N'Variable', N'Variable', NULL, '2024-06-14 02:55:27.2166667 +00:00', '2024-06-19 02:29:52.0166667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (190, 248, N'Type', 3, N'Type', N'Type', NULL, '2024-06-14 03:36:03.0400000 +00:00', '2024-06-19 02:29:51.8933333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (191, 248, N'Type', 4, N'Module', N'Module', NULL, '2024-06-14 03:36:03.1800000 +00:00', '2024-06-19 02:29:51.9533333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (192, 248, N'Type', 6, N'Function', N'Function', NULL, '2024-06-14 03:36:03.3166667 +00:00', '2024-06-19 02:29:52.0833333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (193, 40, N'DisplayLocation', 1, N'After Field Tabs', N'After Field Tabs', NULL, '2024-06-17 10:20:33.7400000 +00:00', '2024-06-19 02:29:29.4233333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (194, 40, N'DisplayLocation', 2, N'Before Field Tabs', N'Before Field Tabs', NULL, '2024-06-17 10:20:33.9533333 +00:00', '2024-06-19 02:29:29.4900000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (195, 40, N'DisplayIconType', 1, N'Related Entity Icon', N'Related Entity Icon', NULL, '2024-06-17 10:20:34.2500000 +00:00', '2024-06-19 02:29:28.6433333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (196, 40, N'DisplayIconType', 2, N'Custom', N'Custom', NULL, '2024-06-17 10:20:34.3100000 +00:00', '2024-06-19 02:29:28.7066667 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (197, 40, N'DisplayIconType', 3, N'None', N'None', NULL, '2024-06-17 10:20:34.3766667 +00:00', '2024-06-19 02:29:28.7800000 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (198, 249, N'RelationshipType', 1, N'One to Many', N'One to Many', NULL, '2024-06-18 12:30:10.7700000 +00:00', '2024-06-19 02:29:52.3833333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (199, 249, N'RelationshipType', 2, N'Many to Many', N'Many to Many', NULL, '2024-06-18 12:30:10.8333333 +00:00', '2024-06-19 02:29:52.4533333 +00:00')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (200, 249, N'RelationshipType', 3, N'Both', N'Both', NULL, '2024-06-18 12:30:10.8933333 +00:00', '2024-06-19 02:29:52.5200000 +00:00')
SET IDENTITY_INSERT [__mj].[EntityFieldValue] OFF
PRINT(N'Operation applied to 24 rows out of 24')

PRINT(N'Add rows to [__mj].[EntityRelationship]')
SET IDENTITY_INSERT [__mj].[EntityRelationship] ON
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [DisplayLocation], [DisplayIconType], [DisplayIcon], [DisplayComponentID], [DisplayComponentConfiguration], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (294, 39, 0, 247, 1, 0, N'One To Many         ', NULL, N'UserID', NULL, NULL, NULL, 1, N'Record Change Replay Runs', NULL, N'After Field Tabs', N'Related Entity Icon', NULL, NULL, NULL, '2024-06-12 19:31:43.5833333 +00:00', '2024-06-12 19:31:43.5833333 +00:00')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [DisplayLocation], [DisplayIconType], [DisplayIcon], [DisplayComponentID], [DisplayComponentConfiguration], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (295, 228, 0, 248, 1, 0, N'One To Many         ', NULL, N'LibraryID', NULL, NULL, NULL, 1, N'Items', NULL, N'After Field Tabs', N'Related Entity Icon', NULL, NULL, NULL, '2024-06-13 23:39:37.7066667 +00:00', '2024-06-13 23:39:37.7066667 +00:00')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [DisplayLocation], [DisplayIconType], [DisplayIcon], [DisplayComponentID], [DisplayComponentConfiguration], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (297, 247, 1, 97, 1, 0, N'One To Many         ', NULL, N'ReplayRunID', NULL, NULL, NULL, 1, N'Record Changes', NULL, N'After Field Tabs', N'Related Entity Icon', NULL, NULL, NULL, '2024-06-18 12:44:54.2200000 +00:00', '2024-06-18 12:44:54.2200000 +00:00')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [DisplayLocation], [DisplayIconType], [DisplayIcon], [DisplayComponentID], [DisplayComponentConfiguration], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES (298, 249, 1, 40, 1, 0, N'One To Many         ', NULL, N'DisplayComponentID', NULL, NULL, NULL, 1, N'Entity Relationships', NULL, N'After Field Tabs', N'Related Entity Icon', NULL, NULL, NULL, '2024-06-18 12:44:54.3500000 +00:00', '2024-06-18 12:44:54.3500000 +00:00')
SET IDENTITY_INSERT [__mj].[EntityRelationship] OFF
PRINT(N'Operation applied to 4 rows out of 4')

PRINT(N'Add constraints to [__mj].[Query]')
ALTER TABLE [__mj].[Query] WITH CHECK CHECK CONSTRAINT [FK_Query_QueryCategory]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_Query]
ALTER TABLE [__mj].[QueryField] WITH CHECK CHECK CONSTRAINT [FK_QueryField_Query]
ALTER TABLE [__mj].[QueryPermission] WITH CHECK CHECK CONSTRAINT [FK_QueryPermission_Query]

PRINT(N'Add constraints to [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_EntityRelationshipDisplayComponent]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Add constraints to [__mj].[UserView]')
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_Entity]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_User]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_UserViewCategory]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_UserView]
ALTER TABLE [__mj].[UserViewRun] WITH CHECK CHECK CONSTRAINT [FK_UserViewRun_UserView]

PRINT(N'Add constraints to [__mj].[UserRole]')
ALTER TABLE [__mj].[UserRole] WITH CHECK CHECK CONSTRAINT [FK_UserRole_RoleName]
ALTER TABLE [__mj].[UserRole] WITH CHECK CHECK CONSTRAINT [FK_UserRole_User]

PRINT(N'Add constraints to [__mj].[QueryCategory]')
ALTER TABLE [__mj].[QueryCategory] WITH CHECK CHECK CONSTRAINT [FK_QueryCategory_QueryCategory]
ALTER TABLE [__mj].[QueryCategory] WITH CHECK CHECK CONSTRAINT [FK_QueryCategory_User]

PRINT(N'Add constraints to [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Add constraints to [__mj].[User]')
ALTER TABLE [__mj].[User] WITH CHECK CHECK CONSTRAINT [FK_User_Employee]
ALTER TABLE [__mj].[User] WITH CHECK CHECK CONSTRAINT [FK_User_LinkedEntity]
ALTER TABLE [__mj].[Action] WITH CHECK CHECK CONSTRAINT [FK__Action__CodeAppr__7B00556C]
ALTER TABLE [__mj].[ActionExecutionLog] WITH CHECK CHECK CONSTRAINT [FK__ActionExe__UserI__3CCE18C9]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_User]
ALTER TABLE [__mj].[CommunicationRun] WITH CHECK CHECK CONSTRAINT [FK__Communica__UserI__7FA83C54]
ALTER TABLE [__mj].[CompanyIntegrationRun] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRun_User]
ALTER TABLE [__mj].[Conversation] WITH CHECK CHECK CONSTRAINT [FK__Conversat__UserI__0429019C]
ALTER TABLE [__mj].[Dashboard] WITH CHECK CHECK CONSTRAINT [FK__Dashboard__UserI__343EFBB6]
ALTER TABLE [__mj].[DashboardCategory] WITH CHECK CHECK CONSTRAINT [FK_DashboardCategory_User]
ALTER TABLE [__mj].[DataContext] WITH CHECK CHECK CONSTRAINT [FK_DataContext_User]
ALTER TABLE [__mj].[DuplicateRun] WITH CHECK CHECK CONSTRAINT [FK_DuplicateRun_ApprovedByUserID]
ALTER TABLE [__mj].[DuplicateRun] WITH CHECK CHECK CONSTRAINT [FK_DuplicateRun_User]
ALTER TABLE [__mj].[List] WITH CHECK CHECK CONSTRAINT [FK_List_User]
ALTER TABLE [__mj].[RecommendationRun] WITH CHECK CHECK CONSTRAINT [FK_RecommendationRun_User]
ALTER TABLE [__mj].[RecordChange] WITH CHECK CHECK CONSTRAINT [FK_RecordChange_UserID]
ALTER TABLE [__mj].[RecordChangeReplayRun] WITH CHECK CHECK CONSTRAINT [FK__RecordCha__UserI__355E3A42]
ALTER TABLE [__mj].[RecordMergeLog] WITH CHECK CHECK CONSTRAINT [FK_RecordMergeLog_User]
ALTER TABLE [__mj].[Report] WITH CHECK CHECK CONSTRAINT [FK__Report__UserID__5F2959BB]
ALTER TABLE [__mj].[ReportCategory] WITH CHECK CHECK CONSTRAINT [FK_ReportCategory_User]
ALTER TABLE [__mj].[ReportSnapshot] WITH CHECK CHECK CONSTRAINT [FK__ReportSna__UserI__6BB324E4]
ALTER TABLE [__mj].[Template] WITH CHECK CHECK CONSTRAINT [FK__Template__UserID__6D3551B5]
ALTER TABLE [__mj].[TemplateCategory] WITH CHECK CHECK CONSTRAINT [FK__TemplateC__UserI__677C785F]
ALTER TABLE [__mj].[UserApplication] WITH CHECK CHECK CONSTRAINT [FK_UserApplication_User]
ALTER TABLE [__mj].[UserFavorite] WITH CHECK CHECK CONSTRAINT [FK_UserFavorite_ApplicationUser]
ALTER TABLE [__mj].[UserNotification] WITH CHECK CHECK CONSTRAINT [FK_UserNotification_User]
ALTER TABLE [__mj].[UserRecordLog] WITH CHECK CHECK CONSTRAINT [FK_UserRecordLog_User]
ALTER TABLE [__mj].[UserViewCategory] WITH CHECK CHECK CONSTRAINT [FK_UserViewCategory_User]
ALTER TABLE [__mj].[UserViewRun] WITH CHECK CHECK CONSTRAINT [FK_UserViewRun_User]
ALTER TABLE [__mj].[Workspace] WITH CHECK CHECK CONSTRAINT [FK__Workspace__UserI__057AB683]

PRINT(N'Add constraints to [__mj].[ResourceType]')
ALTER TABLE [__mj].[ResourceType] WITH CHECK CHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]
ALTER TABLE [__mj].[WorkspaceItem] WITH CHECK CHECK CONSTRAINT [FK__Workspace__Resou__73305268]

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

PRINT(N'Add constraints to [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_DatasetName]
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_Entity]

PRINT(N'Add constraints to [__mj].[CommunicationProviderMessageType]')
ALTER TABLE [__mj].[CommunicationProviderMessageType] WITH CHECK CHECK CONSTRAINT [FK__Communica__Commu__7342656F]
ALTER TABLE [__mj].[CommunicationProviderMessageType] WITH CHECK CHECK CONSTRAINT [FK__Communica__Commu__743689A8]
ALTER TABLE [__mj].[CommunicationLog] WITH CHECK CHECK CONSTRAINT [FK__Communica__Commu__07495E1C]

PRINT(N'Add constraints to [__mj].[AuditLogType]')
ALTER TABLE [__mj].[AuditLogType] WITH CHECK CHECK CONSTRAINT [FK_AuditLogType_Authorization]
ALTER TABLE [__mj].[AuditLogType] WITH CHECK CHECK CONSTRAINT [FK_AuditLogType_ParentID]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_AuditLogType]

PRINT(N'Add constraints to [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_Entity]
ALTER TABLE [__mj].[TemplateContent] WITH CHECK CHECK CONSTRAINT [FK__TemplateC__TypeI__384D5381]
ALTER TABLE [__mj].[AuthorizationRole] WITH CHECK CHECK CONSTRAINT [FK_AuthorizationRole_Role1]
ALTER TABLE [__mj].[EmployeeRole] WITH CHECK CHECK CONSTRAINT [FK__EmployeeR__RoleI__74794A92]
ALTER TABLE [__mj].[QueryPermission] WITH CHECK CHECK CONSTRAINT [FK_QueryPermission_Role]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_EntityDocumentType]
ALTER TABLE [__mj].[EntityBehavior] WITH CHECK CHECK CONSTRAINT [FK_EntityBehavior_EntityBehaviorType]
ALTER TABLE [__mj].[EntityActionInvocation] WITH CHECK CHECK CONSTRAINT [FK__EntityAct__Invoc__36211B3A]

PRINT(N'Add constraints to [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] WITH CHECK CHECK CONSTRAINT [FK_Entity_Entity]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity]
ALTER TABLE [__mj].[Conversation] WITH CHECK CHECK CONSTRAINT [FK_Conversation_Entity]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_Entity]
ALTER TABLE [__mj].[DuplicateRun] WITH CHECK CHECK CONSTRAINT [FK_DuplicateRun_Entity]
ALTER TABLE [__mj].[EntityAction] WITH CHECK CHECK CONSTRAINT [FK__EntityAct__Entit__221A228D]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity1]
ALTER TABLE [__mj].[EntityBehavior] WITH CHECK CHECK CONSTRAINT [FK_EntityBehavior_Entity]
ALTER TABLE [__mj].[EntityCommunicationMessageType] WITH CHECK CHECK CONSTRAINT [FK__EntityCom__Entit__39823A33]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_Entity]
ALTER TABLE [__mj].[EntityRecordDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityRecordDocument_Entity]
ALTER TABLE [__mj].[EntitySetting] WITH CHECK CHECK CONSTRAINT [FK_EntitySetting_Entity]
ALTER TABLE [__mj].[FileEntityRecordLink] WITH CHECK CHECK CONSTRAINT [FK_FileEntityRecordLink_Entity]
ALTER TABLE [__mj].[IntegrationURLFormat] WITH CHECK CHECK CONSTRAINT [FK_IntegrationURLFormat_Entity]
ALTER TABLE [__mj].[List] WITH CHECK CHECK CONSTRAINT [FK_List_Entity]
ALTER TABLE [__mj].[QueryField] WITH CHECK CHECK CONSTRAINT [FK_QueryField_SourceEntity]
ALTER TABLE [__mj].[Recommendation] WITH CHECK CHECK CONSTRAINT [FK_Recommendation_SourceEntity]
ALTER TABLE [__mj].[RecommendationItem] WITH CHECK CHECK CONSTRAINT [FK_RecommendationItem_DestinationEntity]
ALTER TABLE [__mj].[RecordChange] WITH CHECK CHECK CONSTRAINT [FK_RecordChange_EntityID]
ALTER TABLE [__mj].[RecordMergeLog] WITH CHECK CHECK CONSTRAINT [FK_RecordMergeLog_Entity]
ALTER TABLE [__mj].[SystemEvent] WITH CHECK CHECK CONSTRAINT [FK_SystemEvent_Entity]
ALTER TABLE [__mj].[TaggedItem] WITH CHECK CHECK CONSTRAINT [FK_TaggedItem_Entity]
ALTER TABLE [__mj].[TemplateParam] WITH CHECK CHECK CONSTRAINT [FK__TemplateP__Entit__4F30B8D9]
ALTER TABLE [__mj].[UserApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_UserApplicationEntity_Entity]
ALTER TABLE [__mj].[UserFavorite] WITH CHECK CHECK CONSTRAINT [FK_UserFavorite_Entity]
ALTER TABLE [__mj].[UserRecordLog] WITH CHECK CHECK CONSTRAINT [FK_UserRecordLog_Entity]
ALTER TABLE [__mj].[UserViewCategory] WITH CHECK CHECK CONSTRAINT [FK_UserViewCategory_Entity]
ALTER TABLE [__mj].[EntityCommunicationMessageType] WITH CHECK CHECK CONSTRAINT [FK__EntityCom__BaseM__3A765E6C]

PRINT(N'Add constraints to [__mj].[Authorization]')
ALTER TABLE [__mj].[Authorization] WITH CHECK CHECK CONSTRAINT [FK_Authorization_Parent]
ALTER TABLE [__mj].[ActionAuthorization] WITH CHECK CHECK CONSTRAINT [FK_ActionAuthorization_Authorization]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_Authorization]
ALTER TABLE [__mj].[AuthorizationRole] WITH CHECK CHECK CONSTRAINT [FK_AuthorizationRole_Authorization1]
ALTER TABLE [__mj].[ApplicationSetting] WITH CHECK CHECK CONSTRAINT [FK_ApplicationSetting_Application]
ALTER TABLE [__mj].[UserApplication] WITH CHECK CHECK CONSTRAINT [FK_UserApplication_Application]

PRINT(N'Add constraints to [__mj].[ActionCategory]')
ALTER TABLE [__mj].[ActionCategory] WITH CHECK CHECK CONSTRAINT [FK__ActionCat__Paren__7176EB32]
ALTER TABLE [__mj].[Action] WITH CHECK CHECK CONSTRAINT [FK__Action__Category__7A0C3133]
COMMIT TRANSACTION
GO
