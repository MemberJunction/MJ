/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.5.x
   TO:   1.6.x
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

PRINT(N'Drop constraints from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

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

PRINT(N'Drop constraints from [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_Entity]

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

PRINT(N'Drop constraint FK_DatasetItem_Entity from [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_Entity]

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

PRINT(N'Drop constraint FK_RecordChange_Entity from [__mj].[RecordChange]')
ALTER TABLE [__mj].[RecordChange] NOCHECK CONSTRAINT [FK_RecordChange_Entity]

PRINT(N'Drop constraint FK_RecordMergeLog_Entity from [__mj].[RecordMergeLog]')
ALTER TABLE [__mj].[RecordMergeLog] NOCHECK CONSTRAINT [FK_RecordMergeLog_Entity]

PRINT(N'Drop constraint FK__ResourceT__Entit__6D777912 from [__mj].[ResourceType]')
ALTER TABLE [__mj].[ResourceType] NOCHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]

PRINT(N'Drop constraint FK_SystemEvent_Entity from [__mj].[SystemEvent]')
ALTER TABLE [__mj].[SystemEvent] NOCHECK CONSTRAINT [FK_SystemEvent_Entity]

PRINT(N'Drop constraint FK_TaggedItem_Entity from [__mj].[TaggedItem]')
ALTER TABLE [__mj].[TaggedItem] NOCHECK CONSTRAINT [FK_TaggedItem_Entity]

PRINT(N'Drop constraint FK__TemplateP__Entit__4F30B8D9 from [__mj].[TemplateParam]')
ALTER TABLE [__mj].[TemplateParam] NOCHECK CONSTRAINT [FK__TemplateP__Entit__4F30B8D9]

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

PRINT(N'Drop constraints from [__mj].[AIModel]')
ALTER TABLE [__mj].[AIModel] NOCHECK CONSTRAINT [FK_AIModel_AIModelType]

PRINT(N'Drop constraint FK_AIAction_AIModel from [__mj].[AIAction]')
ALTER TABLE [__mj].[AIAction] NOCHECK CONSTRAINT [FK_AIAction_AIModel]

PRINT(N'Drop constraint FK_AIModelAction_AIModel from [__mj].[AIModelAction]')
ALTER TABLE [__mj].[AIModelAction] NOCHECK CONSTRAINT [FK_AIModelAction_AIModel]

PRINT(N'Drop constraint FK_EntityAIAction_AIModel from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_AIModel]

PRINT(N'Drop constraint FK_EntityDocument_AIModel from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_AIModel]

PRINT(N'Drop constraint FK_VectorIndex_AIModel from [__mj].[VectorIndex]')
ALTER TABLE [__mj].[VectorIndex] NOCHECK CONSTRAINT [FK_VectorIndex_AIModel]

PRINT(N'Delete row from [__mj].[EntityRelationship]')
DELETE FROM [__mj].[EntityRelationship] WHERE [ID] = 263

PRINT(N'Delete rows from [__mj].[EntityPermission]')
DELETE FROM [__mj].[EntityPermission] WHERE [ID] = 665
DELETE FROM [__mj].[EntityPermission] WHERE [ID] = 666
DELETE FROM [__mj].[EntityPermission] WHERE [ID] = 667
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Delete rows from [__mj].[EntityField]')
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8024
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8025
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8026
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8027
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8028
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8029
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8030
DELETE FROM [__mj].[EntityField] WHERE [ID] = 8073
PRINT(N'Operation applied to 8 rows out of 8')

PRINT(N'Delete row from [__mj].[ApplicationEntity]')
DELETE FROM [__mj].[ApplicationEntity] WHERE [ID] = 167

PRINT(N'Delete row from [__mj].[VersionInstallation]')
DELETE FROM [__mj].[VersionInstallation] WHERE [ID] = 11

PRINT(N'Delete row from [__mj].[Entity]')
DELETE FROM [__mj].[Entity] WHERE [ID] = 230

PRINT(N'Update rows in [__mj].[EntityField]')
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 336
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 341
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 344
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 345
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 406
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 407
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 408
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 409
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 410
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 411
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 412
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 413
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 414
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 415
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 416
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 417
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 418
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 426
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 427
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 428
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 429
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 542
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 657
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 658
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 659
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 660
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 662
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 663
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 715
UPDATE [__mj].[EntityField] SET [Sequence]=47, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 716
UPDATE [__mj].[EntityField] SET [Sequence]=48, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 717
UPDATE [__mj].[EntityField] SET [Sequence]=49, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 764
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 801
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 829
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 830
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 831
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 832
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 843
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 844
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 845
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 846
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 847
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1220
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1227
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1244
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1247
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1248
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1271
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1277
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1278
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1279
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1280
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1281
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1282
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1293
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1297
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1324
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1325
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1326
UPDATE [__mj].[EntityField] SET [Sequence]=44, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1327
UPDATE [__mj].[EntityField] SET [Sequence]=45, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1328
UPDATE [__mj].[EntityField] SET [Sequence]=46, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1329
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1330
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1331
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1332
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1333
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1334
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1335
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1347
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1349
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1350
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1351
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1355
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1356
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1359
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1362
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1363
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1364
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1365
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1366
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1367
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1368
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1369
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1370
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1371
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1435
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1438
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1439
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1440
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1441
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1442
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1443
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1444
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1445
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1446
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1447
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1448
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1449
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1450
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1451
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1452
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1453
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1454
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1455
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1532
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1533
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1534
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1577
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1578
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1579
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1580
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1742
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1743
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1744
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1780
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1942
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1943
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1944
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1945
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1946
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1947
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1948
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1949
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1950
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1951
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1952
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1953
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1954
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1955
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1956
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1957
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1958
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1959
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1960
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1963
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1964
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1965
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1966
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1967
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1968
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1969
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1970
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1971
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1972
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1973
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1974
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1975
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1983
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1984
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1985
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1986
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1987
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1988
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1989
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 1990
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2003
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2004
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2005
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2006
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2007
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2008
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2009
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2010
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2011
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2012
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2013
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2014
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2015
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2016
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2017
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2018
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2019
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2020
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2024
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2026
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2028
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2029
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2030
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2031
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2032
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2033
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2034
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2035
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2036
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2037
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2038
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2039
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2040
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2041
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2042
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2043
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2044
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2143
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2144
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2145
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2146
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2147
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2149
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2150
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2151
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2156
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2157
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2158
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2159
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2160
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2161
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2162
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2164
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2166
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2170
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2172
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2176
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2177
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2178
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2187
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2188
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2189
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2202
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2207
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2208
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2209
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2210
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2213
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2214
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2215
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2267
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2276
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2283
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2580
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2623
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2624
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2625
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2626
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2627
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2628
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2747
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2748
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2749
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2750
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2751
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2752
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2753
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2754
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2756
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2767
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2769
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2770
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2771
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2772
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2773
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2774
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2775
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2776
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2785
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2787
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2790
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2791
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2792
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2793
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2794
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2795
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2809
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2810
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2813
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2814
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2815
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2816
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2817
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2818
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2819
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2820
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2821
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2822
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2823
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2824
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 2825
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3079
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3080
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3082
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3083
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3085
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3086
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3087
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3088
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3089
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3090
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3091
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3093
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3094
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3096
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3097
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3098
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3099
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3100
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3101
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3102
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3103
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3104
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3105
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3106
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3107
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3108
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3109
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3110
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3111
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3112
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3113
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3114
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3116
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3117
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3118
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3119
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3120
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3121
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3122
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3126
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3127
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3128
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3129
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3130
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3131
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3132
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3133
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3223
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3224
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3225
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3227
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3229
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3230
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3231
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3232
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3233
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3234
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3235
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3236
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3237
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3238
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3239
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3240
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3241
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3242
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3243
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3244
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3245
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3248
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3250
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3259
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3260
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3261
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3265
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3462
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3463
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3464
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3465
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3466
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3467
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3468
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3469
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3470
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3471
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3472
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3473
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3477
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3478
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3491
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3496
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3497
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3498
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3499
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3500
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3501
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3502
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3507
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3508
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3510
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3511
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3512
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3513
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3514
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3515
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3516
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3517
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3518
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3525
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3526
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3532
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3533
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3534
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3542
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3554
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3555
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3556
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3557
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3558
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3559
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3560
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3561
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3562
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3563
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3564
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3565
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3566
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3567
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3568
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3569
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3570
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3571
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3572
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3573
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3574
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3575
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3596
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3597
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3598
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3599
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3600
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3601
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3602
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3603
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3605
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3606
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3607
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3608
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3609
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3610
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3611
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3612
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3613
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3614
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3615
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3616
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3617
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3618
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3631
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3632
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3633
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3637
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3671
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3672
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3673
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3674
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3675
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3676
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3677
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3678
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3682
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3683
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3689
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3691
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3692
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3704
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3705
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3735
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3736
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3737
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3738
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3739
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3740
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3743
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3744
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3747
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3748
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3749
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3750
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3751
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3752
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3753
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3754
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3755
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3756
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3763
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3764
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3768
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 3769
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7858
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7859
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7860
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7861
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7862
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7863
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7864
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7873
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7874
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7875
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7876
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7877
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7878
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7879
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7880
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7881
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7882
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7883
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7884
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7885
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7886
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7888
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7889
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7890
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7891
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7892
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7893
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7894
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7895
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7896
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7897
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7898
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7899
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7900
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7901
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7902
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7903
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7904
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7905
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7906
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7907
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7908
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7909
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7910
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7911
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7912
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7913
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7914
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7915
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7916
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7925
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7926
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7927
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7928
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7929
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7930
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7931
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7932
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7933
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7934
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7935
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7936
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7937
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7938
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7939
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7940
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7941
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7942
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7943
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7944
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7945
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7946
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7947
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7948
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7949
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7950
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7951
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7952
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7955
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7956
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7957
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7958
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7959
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7960
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7961
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7962
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7964
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7965
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7966
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7967
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7968
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7969
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7971
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7974
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7975
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7976
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7977
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7978
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7979
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7980
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7981
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7982
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7983
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7984
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7985
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7986
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7987
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7988
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7989
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7990
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7991
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7992
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7993
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7994
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7995
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7996
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7997
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7998
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 7999
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8000
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8001
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8002
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8003
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8004
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8005
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8006
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8007
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8009
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8010
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8011
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8012
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8013
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8014
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8015
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8016
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8017
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8018
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8019
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8020
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8021
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8022
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8023
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8031
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8032
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8033
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8034
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8035
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8036
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8037
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8038
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8039
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8040
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8041
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8042
UPDATE [__mj].[EntityField] SET [Sequence]=7, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8043
UPDATE [__mj].[EntityField] SET [Sequence]=8, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8044
UPDATE [__mj].[EntityField] SET [Sequence]=9, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8045
UPDATE [__mj].[EntityField] SET [Sequence]=10, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8046
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8047
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8048
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8049
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8050
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8051
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8052
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8053
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8054
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8055
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8056
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8057
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8058
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8059
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8060
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8061
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8062
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8063
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8064
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8065
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8066
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8067
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8068
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8069
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8070
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8071
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8072
UPDATE [__mj].[EntityField] SET [Sequence]=11, [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8074
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8075
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8076
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8077
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8078
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-10 20:20:36.880' WHERE [ID] = 8079
PRINT(N'Operation applied to 1237 rows out of 1237')

PRINT(N'Update rows in [__mj].[Entity]')
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1, [AllowDeleteAPI]=1, [UpdatedAt]='2024-06-08 21:37:31.223' WHERE [ID] = 135
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1, [UpdatedAt]='2024-06-08 21:37:31.223' WHERE [ID] = 136
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1, [UpdatedAt]='2024-06-08 21:37:31.223' WHERE [ID] = 137
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1, [UpdatedAt]='2024-06-08 21:37:31.223' WHERE [ID] = 138
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1, [AllowDeleteAPI]=1, [UpdatedAt]='2024-06-08 21:37:31.223' WHERE [ID] = 139
PRINT(N'Operation applied to 5 rows out of 5')

PRINT(N'Add row to [__mj].[AIModel]')
SET IDENTITY_INSERT [__mj].[AIModel] ON
INSERT INTO [__mj].[AIModel] ([ID], [Name], [Vendor], [AIModelTypeID], [IsActive], [Description], [DriverClass], [DriverImportPath], [APIName], [PowerRank], [CreatedAt], [UpdatedAt]) VALUES (17, N'Llama 3 70b', N'Groq', 1, 1, NULL, N'GroqLLM', NULL, N'llama3-70b-8192', 4, '2024-06-08 21:45:18.010', '2024-06-08 21:47:02.073')
SET IDENTITY_INSERT [__mj].[AIModel] OFF

PRINT(N'Add rows to [__mj].[Entity]')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (236, NULL, N'Templates', NULL, N'Templates are used for dynamic expansion of a static template with data from a given context. Templates can be used to create documents, messages and anything else that requires dynamic document creation merging together static text, data and lightweight logic', 1, N'Template', N'vwTemplates', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-08 01:00:50.063', '2024-06-08 15:40:28.443', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (237, NULL, N'Template Categories', NULL, N'Template categories for organizing templates', 1, N'TemplateCategory', N'vwTemplateCategories', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-08 01:00:50.650', '2024-06-08 01:00:50.650', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (238, NULL, N'Template Contents', NULL, N'Template content for different versions of a template for purposes like HTML/Text/etc', 1, N'TemplateContent', N'vwTemplateContents', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-08 15:39:21.967', '2024-06-08 15:39:21.967', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (239, NULL, N'Template Params', NULL, N'Parameters allowed for use inside the template', 1, N'TemplateParam', N'vwTemplateParams', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-08 15:39:22.550', '2024-06-08 15:39:22.550', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (240, NULL, N'Template Content Types', NULL, N'Template content types for categorizing content within templates', 1, N'TemplateContentType', N'vwTemplateContentTypes', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-08 15:39:23.140', '2024-06-08 15:39:23.140', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (241, NULL, N'Recommendations', NULL, N'Recommendation headers that store the left side of the recommendation which we track in the SourceEntityID/SourceEntityRecordID', 1, N'Recommendation', N'vwRecommendations', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 00:15:50.860', '2024-06-10 00:15:50.860', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (242, NULL, N'Recommendation Providers', NULL, N'Recommendation providers details', 1, N'RecommendationProvider', N'vwRecommendationProviders', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 00:15:52.373', '2024-06-10 00:15:52.373', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (243, NULL, N'Recommendation Runs', NULL, N'Recommendation runs log each time a provider is requested to provide recommendations', 1, N'RecommendationRun', N'vwRecommendationRuns', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 00:15:53.830', '2024-06-10 00:15:53.830', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (244, NULL, N'Recommendation Items', NULL, N'Table to store individual recommendation items that are the right side of the recommendation which we track in the DestinationEntityID/DestinationEntityRecordID', 1, N'RecommendationItem', N'vwRecommendationItems', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 00:15:55.553', '2024-06-10 00:15:55.553', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (245, NULL, N'Entity Communication Message Types', NULL, N'Mapping between entities and communication base message types', 1, N'EntityCommunicationMessageType', N'vwEntityCommunicationMessageTypes', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 19:05:19.940', '2024-06-10 20:16:48.557', NULL)
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt], [PreferredCommunicationField]) VALUES (246, NULL, N'Entity Communication Fields', NULL, N'Mapping between entity fields and communication base message types with priority', 1, N'EntityCommunicationField', N'vwEntityCommunicationFields', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-06-10 20:13:38.517', '2024-06-10 20:13:38.517', NULL)
PRINT(N'Operation applied to 11 rows out of 11')

PRINT(N'Add row to [__mj].[VersionInstallation]')
SET IDENTITY_INSERT [__mj].[VersionInstallation] ON
INSERT INTO [__mj].[VersionInstallation] ([ID], [MajorVersion], [MinorVersion], [PatchVersion], [Type], [InstalledAt], [Status], [InstallLog], [Comments], [CreatedAt], [UpdatedAt]) VALUES (12, 1, 6, 0, N'New', '2024-06-11 00:04:03.650', N'Pending', NULL, NULL, '2024-06-11 00:04:03.650', '2024-06-11 00:04:03.650')
SET IDENTITY_INSERT [__mj].[VersionInstallation] OFF

PRINT(N'Add rows to [__mj].[ApplicationEntity]')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] ON
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (177, N'Admin', 236, 1034, 0, '2024-06-08 01:00:50.193', '2024-06-08 01:00:50.193')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (178, N'Admin', 237, 1035, 0, '2024-06-08 01:00:50.783', '2024-06-08 01:00:50.783')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (179, N'Admin', 238, 1036, 0, '2024-06-08 15:39:22.097', '2024-06-08 15:39:22.097')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (180, N'Admin', 239, 1037, 0, '2024-06-08 15:39:22.683', '2024-06-08 15:39:22.683')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (181, N'Admin', 240, 1038, 0, '2024-06-08 15:39:23.277', '2024-06-08 15:39:23.277')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (182, N'Admin', 241, 1039, 0, '2024-06-10 00:15:51.203', '2024-06-10 00:15:51.203')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (183, N'Admin', 242, 1040, 0, '2024-06-10 00:15:52.680', '2024-06-10 00:15:52.680')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (184, N'Admin', 243, 1041, 0, '2024-06-10 00:15:54.353', '2024-06-10 00:15:54.353')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (185, N'Admin', 244, 1042, 0, '2024-06-10 00:15:55.873', '2024-06-10 00:15:55.873')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (186, N'Admin', 245, 1043, 0, '2024-06-10 19:05:20.240', '2024-06-10 19:05:20.240')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (187, N'Admin', 246, 1044, 0, '2024-06-10 20:13:38.817', '2024-06-10 20:13:38.817')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] OFF
PRINT(N'Operation applied to 11 rows out of 11')

PRINT(N'Add rows to [__mj].[EntityField]')
SET IDENTITY_INSERT [__mj].[EntityField] ON
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8080, 236, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:12.633', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8081, 236, 2, N'Name', N'Name', N'Name of the template', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-06-08 01:02:12.693', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8082, 236, 3, N'Description', N'Description', N'Description of the template', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:12.753', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8083, 236, 5, N'CategoryID', N'Category ID', N'Optional, Category that this template is part of', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 237, N'ID', 1, N'Category', '2024-06-08 01:02:12.817', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8084, 236, 6, N'UserID', N'User ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 39, N'ID', 1, N'User', '2024-06-08 01:02:12.880', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8085, 236, 10, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:12.940', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8086, 236, 11, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.003', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8087, 237, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.063', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8088, 237, 2, N'Name', N'Name', N'Name of the template category', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.133', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8089, 237, 3, N'Description', N'Description', N'Description of the template category', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.193', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8090, 237, 4, N'ParentID', N'Parent ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 237, N'ID', 1, N'Parent', '2024-06-08 01:02:13.277', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8091, 237, 5, N'UserID', N'User ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 39, N'ID', 1, N'User', '2024-06-08 01:02:13.347', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8092, 237, 6, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.407', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8093, 237, 7, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 01:02:13.487', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8094, 236, 12, N'Category', N'Category', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 01:03:59.563', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8095, 236, 13, N'User', N'User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 01:03:59.630', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8096, 237, 8, N'Parent', N'Parent', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 01:03:59.697', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8097, 237, 9, N'User', N'User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 01:03:59.760', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8099, 236, 4, N'UserPrompt', N'User Prompt', N'This prompt will be used by the AI to generate template content as requested by the user.', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:44.617', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8100, 236, 7, N'ActiveAt', N'Active At', N'Optional, if provided, this template will not be available for use until the specified date. Requires IsActive to be set to 1', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:44.680', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8101, 236, 8, N'DisabledAt', N'Disabled At', N'Optional, if provided, this template will not be available for use after the specified date. If IsActive=0, this has no effect.', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:44.740', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8102, 236, 9, N'IsActive', N'Is Active', N'If set to 0, the template will be disabled regardless of the values in ActiveAt/DisabledAt. ', 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((1))', 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:44.803', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8103, 238, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:44.870', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8104, 238, 2, N'TemplateID', N'Template ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 236, N'ID', 1, N'Template', '2024-06-08 15:40:44.937', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8105, 238, 3, N'TypeID', N'Type ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 240, N'ID', 1, N'Type', '2024-06-08 15:40:45.000', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8106, 238, 5, N'Priority', N'Priority', N'Priority of the content version, higher priority versions will be used ahead of lower priority versions for a given Type', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.070', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8107, 238, 6, N'IsActive', N'Is Active', N'Indicates whether the content is active or not. Use this to disable a particular Template Content item without having to remove it', 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((1))', 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.133', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8108, 238, 7, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.197', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8109, 238, 8, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.260', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8110, 239, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.320', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8111, 239, 2, N'TemplateID', N'Template ID', N'ID of the template this parameter belongs to', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 236, N'ID', 1, N'Template', '2024-06-08 15:40:45.397', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8112, 239, 3, N'Name', N'Name', N'Name of the parameter', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.457', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8113, 239, 4, N'Description', N'Description', N'Description of the parameter', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.527', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8114, 239, 5, N'Type', N'Type', N'Type of the parameter', 1, 0, 0, NULL, N'nvarchar', 40, 0, 0, 0, N'(''Scalar'')', 0, N'List', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.590', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8115, 239, 6, N'DefaultValue', N'Default Value', N'Default value of the parameter', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.653', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8116, 239, 8, N'EntityID', N'Entity ID', N'Entity ID, used only when Type is Record', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 37, N'ID', 1, N'Entity', '2024-06-08 15:40:45.713', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8117, 239, 9, N'RecordID', N'Record ID', N'Record ID, used only when Type is Record', 1, 0, 0, NULL, N'nvarchar', 4000, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.777', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8118, 239, 10, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.840', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8119, 239, 11, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.907', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8120, 240, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:45.973', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8121, 240, 2, N'Name', N'Name', N'Name of the template content type', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-06-08 15:40:46.033', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8122, 240, 3, N'Description', N'Description', N'Description of the template content type', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:46.100', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8123, 240, 4, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:46.160', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8124, 240, 5, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 15:40:46.223', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8125, 238, 9, N'Template', N'Template', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 15:42:34.913', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8126, 238, 10, N'Type', N'Type', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 15:42:34.977', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8127, 239, 12, N'Template', N'Template', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 15:42:35.040', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8128, 239, 13, N'Entity', N'Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-08 15:42:35.100', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8129, 238, 4, N'TemplateText', N'Template Text', N'The actual text content for the template', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 16:04:19.873', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8130, 239, 7, N'IsRequired', N'Is Required', NULL, 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((0))', 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-08 18:34:56.657', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8131, 241, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:29.577', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8132, 241, 2, N'RecommendationRunID', N'Recommendation Run ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 243, N'ID', 1, NULL, '2024-06-10 00:19:29.730', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8133, 241, 3, N'SourceEntityID', N'Source Entity ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 37, N'ID', 1, N'SourceEntity', '2024-06-10 00:19:29.877', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8134, 241, 4, N'SourceEntityRecordID', N'Source Entity Record ID', N'The record ID of the source entity', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.037', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8135, 241, 5, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.187', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8136, 241, 6, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.347', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8137, 242, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.487', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8138, 242, 2, N'Name', N'Name', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.637', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8139, 242, 3, N'Description', N'Description', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:30.797', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8140, 242, 4, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:31.240', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8141, 242, 5, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:31.390', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8142, 243, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:31.547', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8143, 243, 2, N'RecommendationProviderID', N'Recommendation Provider ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 242, N'ID', 1, N'RecommendationProvider', '2024-06-10 00:19:31.703', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8144, 243, 3, N'StartDate', N'Start Date', N'The start date of the recommendation run', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:31.863', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8145, 243, 4, N'EndDate', N'End Date', N'The end date of the recommendation run', 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.023', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8146, 243, 5, N'Status', N'Status', N'The status of the recommendation run', 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, NULL, 0, N'List', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.177', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8147, 243, 6, N'Description', N'Description', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.333', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8148, 243, 7, N'RunByUserID', N'Run By User ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 39, N'ID', 1, N'RunByUser', '2024-06-10 00:19:32.470', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8149, 243, 8, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.620', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8150, 243, 9, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.763', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8151, 244, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:32.933', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8152, 244, 2, N'RecommendationID', N'Recommendation ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 241, N'ID', 1, NULL, '2024-06-10 00:19:33.090', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8153, 244, 3, N'DestinationEntityID', N'Destination Entity ID', N'The ID of the destination entity', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 37, N'ID', 1, N'DestinationEntity', '2024-06-10 00:19:33.253', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8154, 244, 4, N'DestinationEntityRecordID', N'Destination Entity Record ID', N'The record ID of the destination entity', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:33.410', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8155, 244, 5, N'MatchProbability', N'Match Probability', N'A value between 0 and 1 indicating the probability of the match, higher numbers indicating a more certain match/recommendation.', 1, 0, 0, NULL, N'decimal', 9, 18, 15, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:33.583', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8156, 244, 6, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:33.743', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8157, 244, 7, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 00:19:33.900', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8158, 241, 7, N'SourceEntity', N'Source Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 00:26:40.873', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8159, 243, 10, N'RecommendationProvider', N'Recommendation Provider', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 00:26:41.163', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8160, 243, 11, N'RunByUser', N'Run By User', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 00:26:41.320', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8161, 244, 8, N'DestinationEntity', N'Destination Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 00:26:41.487', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8162, 232, 5, N'StartedAt', N'Started At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 17:12:19.573', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8163, 232, 6, N'EndedAt', N'Ended At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 17:12:19.723', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8164, 245, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 19:08:05.417', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8165, 245, 2, N'EntityID', N'Entity ID', N'ID of the entity', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 37, N'ID', 1, N'Entity', '2024-06-10 19:08:05.570', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8166, 245, 3, N'BaseMessageTypeID', N'Base Message Type ID', N'ID of the communication base message type', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 235, N'ID', 1, N'BaseMessageType', '2024-06-10 19:08:05.723', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8167, 245, 4, N'IsActive', N'Is Active', N'Indicates whether the message type is active', 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((1))', 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 19:08:05.880', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8169, 245, 5, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 19:08:06.180', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8170, 245, 6, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 19:08:06.330', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8171, 245, 7, N'Entity', N'Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 19:11:33.610', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8172, 245, 8, N'BaseMessageType', N'Base Message Type', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-10 19:11:33.747', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8173, 37, 43, N'PreferredCommunicationField', N'Preferred Communication Field', N'Used to specify a field within the entity that in turn contains the field name that will be used for record-level communication preferences. For example in a hypothetical entity called Contacts, say there is a field called PreferredComm and that field had possible values of Email1, SMS, and Phone, and those value in turn corresponded to field names in the entity. Each record in the Contacts entity could have a specific preference for which field would be used for communication. The MJ Communication Framework will use this information when available, as a priority ahead of the data in the Entity Communication Fields entity which is entity-level and not record-level.', 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:05.083', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8174, 246, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:05.240', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8175, 246, 2, N'EntityCommunicationMessageTypeID', N'Entity Communication Message Type ID', N'ID of the entity communication message type', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 245, N'ID', 1, NULL, '2024-06-10 20:17:05.397', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8176, 246, 3, N'FieldName', N'Field Name', N'Name of the field in the entity that maps to the communication base message type', 1, 0, 0, NULL, N'nvarchar', 1000, 0, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:05.550', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8177, 246, 4, N'Priority', N'Priority', N'Priority of the field for the communication base message type', 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:05.700', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8178, 246, 5, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:05.850', '2024-06-10 20:20:36.880')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (8179, 246, 6, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-10 20:17:06.007', '2024-06-10 20:20:36.880')
SET IDENTITY_INSERT [__mj].[EntityField] OFF
PRINT(N'Operation applied to 98 rows out of 98')

PRINT(N'Add rows to [__mj].[EntityPermission]')
SET IDENTITY_INSERT [__mj].[EntityPermission] ON
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (683, 236, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.257', '2024-06-08 01:00:50.257')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (684, 236, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.330', '2024-06-08 01:00:50.330')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (685, 236, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.403', '2024-06-08 01:00:50.403')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (686, 237, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.847', '2024-06-08 01:00:50.847')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (687, 237, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.907', '2024-06-08 01:00:50.907')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (688, 237, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-08 01:00:50.970', '2024-06-08 01:00:50.970')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (689, 238, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.163', '2024-06-08 15:39:22.163')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (690, 238, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.227', '2024-06-08 15:39:22.227')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (691, 238, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.290', '2024-06-08 15:39:22.290')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (692, 239, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.750', '2024-06-08 15:39:22.750')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (693, 239, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.813', '2024-06-08 15:39:22.813')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (694, 239, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-08 15:39:22.880', '2024-06-08 15:39:22.880')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (695, 240, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:23.347', '2024-06-08 15:39:23.347')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (696, 240, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-08 15:39:23.410', '2024-06-08 15:39:23.410')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (697, 240, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-08 15:39:23.477', '2024-06-08 15:39:23.477')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (698, 241, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:51.390', '2024-06-10 00:15:51.390')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (699, 241, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:51.543', '2024-06-10 00:15:51.543')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (700, 241, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 00:15:51.697', '2024-06-10 00:15:51.697')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (701, 242, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:52.840', '2024-06-10 00:15:52.840')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (702, 242, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:53.010', '2024-06-10 00:15:53.010')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (703, 242, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 00:15:53.170', '2024-06-10 00:15:53.170')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (704, 243, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:54.513', '2024-06-10 00:15:54.513')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (705, 243, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:54.697', '2024-06-10 00:15:54.697')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (706, 243, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 00:15:54.877', '2024-06-10 00:15:54.877')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (707, 244, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:56.047', '2024-06-10 00:15:56.047')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (708, 244, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 00:15:56.210', '2024-06-10 00:15:56.210')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (709, 244, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 00:15:56.390', '2024-06-10 00:15:56.390')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (710, 245, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 19:05:20.390', '2024-06-10 19:05:20.390')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (711, 245, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 19:05:20.543', '2024-06-10 19:05:20.543')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (712, 245, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 19:05:20.693', '2024-06-10 19:05:20.693')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (713, 246, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-06-10 20:13:38.967', '2024-06-10 20:13:38.967')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (714, 246, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-06-10 20:13:39.110', '2024-06-10 20:13:39.110')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (715, 246, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-06-10 20:13:39.260', '2024-06-10 20:13:39.260')
SET IDENTITY_INSERT [__mj].[EntityPermission] OFF
PRINT(N'Operation applied to 33 rows out of 33')

PRINT(N'Add rows to [__mj].[EntityRelationship]')
SET IDENTITY_INSERT [__mj].[EntityRelationship] ON
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (276, 39, 0, 236, 1, 0, N'One To Many         ', NULL, N'UserID', NULL, NULL, NULL, 1, N'Templates', NULL, '2024-06-08 01:02:41.113', '2024-06-08 01:02:41.113')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (277, 39, 0, 237, 1, 0, N'One To Many         ', NULL, N'UserID', NULL, NULL, NULL, 1, N'Template Categories', NULL, '2024-06-08 01:02:41.237', '2024-06-08 01:02:41.237')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (278, 237, 0, 236, 1, 0, N'One To Many         ', NULL, N'CategoryID', NULL, NULL, NULL, 1, N'Templates', NULL, '2024-06-08 01:02:49.250', '2024-06-08 01:02:49.250')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (279, 237, 0, 237, 1, 0, N'One To Many         ', NULL, N'ParentID', NULL, NULL, NULL, 1, N'Template Categories', NULL, '2024-06-08 01:02:49.383', '2024-06-08 01:02:49.383')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (280, 37, 0, 239, 1, 0, N'One To Many         ', NULL, N'EntityID', NULL, NULL, NULL, 1, N'Template Params', NULL, '2024-06-08 15:41:13.293', '2024-06-08 15:41:13.293')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (281, 236, 0, 239, 1, 0, N'One To Many         ', NULL, N'TemplateID', NULL, NULL, NULL, 1, N'Template Params', NULL, '2024-06-08 15:41:21.493', '2024-06-08 15:41:21.493')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (282, 236, 0, 238, 1, 0, N'One To Many         ', NULL, N'TemplateID', NULL, NULL, NULL, 1, N'Template Contents', NULL, '2024-06-08 15:41:21.617', '2024-06-08 15:41:21.617')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (283, 240, 0, 238, 1, 0, N'One To Many         ', NULL, N'TypeID', NULL, NULL, NULL, 1, N'Template Contents', NULL, '2024-06-08 15:41:21.860', '2024-06-08 15:41:21.860')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (284, 37, 0, 241, 1, 0, N'One To Many         ', NULL, N'SourceEntityID', NULL, NULL, NULL, 1, N'Recommendations', NULL, '2024-06-10 00:20:56.930', '2024-06-10 00:20:56.930')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (285, 37, 0, 244, 1, 0, N'One To Many         ', NULL, N'DestinationEntityID', NULL, NULL, NULL, 1, N'Recommendation Items', NULL, '2024-06-10 00:20:57.537', '2024-06-10 00:20:57.537')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (286, 39, 0, 243, 1, 0, N'One To Many         ', NULL, N'RunByUserID', NULL, NULL, NULL, 1, N'Recommendation Runs', NULL, '2024-06-10 00:20:59.867', '2024-06-10 00:20:59.867')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (287, 241, 0, 244, 1, 0, N'One To Many         ', NULL, N'RecommendationID', NULL, NULL, NULL, 1, N'Recommendation Items', NULL, '2024-06-10 00:21:26.040', '2024-06-10 00:21:26.040')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (288, 242, 0, 243, 1, 0, N'One To Many         ', NULL, N'RecommendationProviderID', NULL, NULL, NULL, 1, N'Recommendation Runs', NULL, '2024-06-10 00:21:26.690', '2024-06-10 00:21:26.690')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (289, 243, 0, 241, 1, 0, N'One To Many         ', NULL, N'RecommendationRunID', NULL, NULL, NULL, 1, N'Recommendations', NULL, '2024-06-10 00:21:27.030', '2024-06-10 00:21:27.030')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (290, 37, 0, 245, 1, 0, N'One To Many         ', NULL, N'EntityID', NULL, NULL, NULL, 1, N'Entity Communication Message Types', NULL, '2024-06-10 19:09:08.267', '2024-06-10 19:09:08.267')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (291, 235, 0, 245, 1, 0, N'One To Many         ', NULL, N'BaseMessageTypeID', NULL, NULL, NULL, 1, N'Entity Communication Message Types', NULL, '2024-06-10 19:09:25.830', '2024-06-10 19:09:25.830')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (292, 245, 0, 246, 1, 0, N'One To Many         ', NULL, N'EntityCommunicationMessageTypeID', NULL, NULL, NULL, 1, N'Entity Communication Fields', NULL, '2024-06-10 20:18:28.083', '2024-06-10 20:18:28.083')
SET IDENTITY_INSERT [__mj].[EntityRelationship] OFF
PRINT(N'Operation applied to 17 rows out of 17')

PRINT(N'Add rows to [__mj].[EntityFieldValue]')
SET IDENTITY_INSERT [__mj].[EntityFieldValue] ON
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (165, 239, N'Type', 1, N'Scalar', N'Scalar', NULL, '2024-06-08 15:41:08.803', '2024-06-08 15:41:08.803')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (166, 239, N'Type', 2, N'Array', N'Array', NULL, '2024-06-08 15:41:08.863', '2024-06-08 15:41:08.863')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (167, 239, N'Type', 3, N'Object', N'Object', NULL, '2024-06-08 15:41:08.930', '2024-06-08 15:41:08.930')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (168, 239, N'Type', 4, N'Record', N'Record', NULL, '2024-06-08 15:41:08.993', '2024-06-08 15:41:08.993')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (169, 243, N'Status', 1, N'Pending', N'Pending', NULL, '2024-06-10 00:20:40.917', '2024-06-10 00:20:40.917')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (170, 243, N'Status', 2, N'In Progress', N'In Progress', NULL, '2024-06-10 00:20:41.060', '2024-06-10 00:20:41.060')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (171, 243, N'Status', 3, N'Completed', N'Completed', NULL, '2024-06-10 00:20:41.240', '2024-06-10 00:20:41.240')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (172, 243, N'Status', 4, N'Canceled', N'Canceled', NULL, '2024-06-10 00:20:41.397', '2024-06-10 00:20:41.397')
INSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityID], [EntityFieldName], [Sequence], [Value], [Code], [Description], [CreatedAt], [UpdatedAt]) VALUES (173, 243, N'Status', 5, N'Error', N'Error', NULL, '2024-06-10 00:20:41.540', '2024-06-10 00:20:41.540')
SET IDENTITY_INSERT [__mj].[EntityFieldValue] OFF
PRINT(N'Operation applied to 9 rows out of 9')

PRINT(N'Add constraints to [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

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

PRINT(N'Add constraints to [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_Entity]

PRINT(N'Add constraints to [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] WITH CHECK CHECK CONSTRAINT [FK_Entity_Entity]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity]
ALTER TABLE [__mj].[Conversation] WITH CHECK CHECK CONSTRAINT [FK_Conversation_Entity]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_Entity]
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_Entity]
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
ALTER TABLE [__mj].[RecordChange] WITH CHECK CHECK CONSTRAINT [FK_RecordChange_Entity]
ALTER TABLE [__mj].[RecordMergeLog] WITH CHECK CHECK CONSTRAINT [FK_RecordMergeLog_Entity]
ALTER TABLE [__mj].[ResourceType] WITH CHECK CHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]
ALTER TABLE [__mj].[SystemEvent] WITH CHECK CHECK CONSTRAINT [FK_SystemEvent_Entity]
ALTER TABLE [__mj].[TaggedItem] WITH CHECK CHECK CONSTRAINT [FK_TaggedItem_Entity]
ALTER TABLE [__mj].[TemplateParam] WITH CHECK CHECK CONSTRAINT [FK__TemplateP__Entit__4F30B8D9]
ALTER TABLE [__mj].[User] WITH CHECK CHECK CONSTRAINT [FK_User_LinkedEntity]
ALTER TABLE [__mj].[UserApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_UserApplicationEntity_Entity]
ALTER TABLE [__mj].[UserFavorite] WITH CHECK CHECK CONSTRAINT [FK_UserFavorite_Entity]
ALTER TABLE [__mj].[UserRecordLog] WITH CHECK CHECK CONSTRAINT [FK_UserRecordLog_Entity]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_Entity]
ALTER TABLE [__mj].[UserViewCategory] WITH CHECK CHECK CONSTRAINT [FK_UserViewCategory_Entity]

PRINT(N'Add constraints to [__mj].[AIModel]')
ALTER TABLE [__mj].[AIModel] WITH CHECK CHECK CONSTRAINT [FK_AIModel_AIModelType]
ALTER TABLE [__mj].[AIAction] WITH CHECK CHECK CONSTRAINT [FK_AIAction_AIModel]
ALTER TABLE [__mj].[AIModelAction] WITH CHECK CHECK CONSTRAINT [FK_AIModelAction_AIModel]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_AIModel]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_AIModel]
ALTER TABLE [__mj].[VectorIndex] WITH CHECK CHECK CONSTRAINT [FK_VectorIndex_AIModel]
COMMIT TRANSACTION
GO
