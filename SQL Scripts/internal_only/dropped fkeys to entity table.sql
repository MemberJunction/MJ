ALTER TABLE [__mj].[EntityAction] DROP CONSTRAINT [FK__EntityAct__Entit__221A228D];
ALTER TABLE [__mj].[EntityCommunicationMessageType] DROP CONSTRAINT [FK__EntityCom__Entit__39823A33];
ALTER TABLE [__mj].[ResourceType] DROP CONSTRAINT [FK__ResourceT__Entit__6D777912];
ALTER TABLE [__mj].[TemplateParam] DROP CONSTRAINT [FK__TemplateP__Entit__4F30B8D9];
ALTER TABLE [__mj].[ApplicationEntity] DROP CONSTRAINT [FK_ApplicationEntity_Entity];
ALTER TABLE [__mj].[AuditLog] DROP CONSTRAINT [FK_AuditLog_Entity];
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] DROP CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity];
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] DROP CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity];
ALTER TABLE [__mj].[Conversation] DROP CONSTRAINT [FK_Conversation_Entity];
ALTER TABLE [__mj].[DataContextItem] DROP CONSTRAINT [FK_DataContextItem_Entity];
ALTER TABLE [__mj].[DatasetItem] DROP CONSTRAINT [FK_DatasetItem_Entity];
ALTER TABLE [__mj].[DuplicateRun] DROP CONSTRAINT [FK_DuplicateRun_Entity];
ALTER TABLE [__mj].[Entity] DROP CONSTRAINT [FK_Entity_Entity];
ALTER TABLE [__mj].[EntityAIAction] DROP CONSTRAINT [FK_EntityAIAction_Entity];
ALTER TABLE [__mj].[EntityAIAction] DROP CONSTRAINT [FK_EntityAIAction_Entity1];
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [FK_EntityDocument_Entity];
ALTER TABLE [__mj].[EntityField] DROP CONSTRAINT [FK_EntityField_Entity];
ALTER TABLE [__mj].[EntityField] DROP CONSTRAINT [FK_EntityField_RelatedEntity];
ALTER TABLE [__mj].[EntityPermission] DROP CONSTRAINT [FK_EntityPermission_Entity];
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [FK_EntityRecordDocument_Entity];
ALTER TABLE [__mj].[EntityRelationship] DROP CONSTRAINT [FK_EntityRelationship_EntityID];
ALTER TABLE [__mj].[EntityRelationship] DROP CONSTRAINT [FK_EntityRelationship_RelatedEntityID];
ALTER TABLE [__mj].[EntitySetting] DROP CONSTRAINT [FK_EntitySetting_Entity];
ALTER TABLE [__mj].[FileEntityRecordLink] DROP CONSTRAINT [FK_FileEntityRecordLink_Entity];
ALTER TABLE [__mj].[IntegrationURLFormat] DROP CONSTRAINT [FK_IntegrationURLFormat_Entity];
ALTER TABLE [__mj].[List] DROP CONSTRAINT [FK_List_Entity];
ALTER TABLE [__mj].[QueryField] DROP CONSTRAINT [FK_QueryField_SourceEntity];
ALTER TABLE [__mj].[Recommendation] DROP CONSTRAINT [FK_Recommendation_SourceEntity];
ALTER TABLE [__mj].[RecommendationItem] DROP CONSTRAINT [FK_RecommendationItem_Entity];
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [FK_RecordChange_EntityID];
ALTER TABLE [__mj].[RecordMergeLog] DROP CONSTRAINT [FK_RecordMergeLog_Entity];
ALTER TABLE [__mj].[SystemEvent] DROP CONSTRAINT [FK_SystemEvent_Entity];
ALTER TABLE [__mj].[TaggedItem] DROP CONSTRAINT [FK_TaggedItem_Entity];
ALTER TABLE [__mj].[User] DROP CONSTRAINT [FK_User_LinkedEntity];
ALTER TABLE [__mj].[UserApplicationEntity] DROP CONSTRAINT [FK_UserApplicationEntity_Entity];
ALTER TABLE [__mj].[UserFavorite] DROP CONSTRAINT [FK_UserFavorite_Entity];
ALTER TABLE [__mj].[UserRecordLog] DROP CONSTRAINT [FK_UserRecordLog_Entity];
ALTER TABLE [__mj].[UserView] DROP CONSTRAINT [FK_UserView_Entity];
ALTER TABLE [__mj].[UserViewCategory] DROP CONSTRAINT [FK_UserViewCategory_Entity];