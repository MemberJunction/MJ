/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.3.x
   TO:   1.4.x
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

PRINT(N'Drop constraints from [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] NOCHECK CONSTRAINT [FK_EntityRelationship_EntityID]
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

PRINT(N'Drop constraints from [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_DatasetName]
ALTER TABLE [__mj].[DatasetItem] NOCHECK CONSTRAINT [FK_DatasetItem_Entity]

PRINT(N'Drop constraints from [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_Entity]

PRINT(N'Drop constraint FK_EntityBehavior_EntityBehaviorType from [__mj].[EntityBehavior]')
ALTER TABLE [__mj].[EntityBehavior] NOCHECK CONSTRAINT [FK_EntityBehavior_EntityBehaviorType]

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

PRINT(N'Drop constraint FK_EntityAIAction_Entity from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity]

PRINT(N'Drop constraint FK_EntityAIAction_Entity1 from [__mj].[EntityAIAction]')
ALTER TABLE [__mj].[EntityAIAction] NOCHECK CONSTRAINT [FK_EntityAIAction_Entity1]

PRINT(N'Drop constraint FK_EntityBehavior_Entity from [__mj].[EntityBehavior]')
ALTER TABLE [__mj].[EntityBehavior] NOCHECK CONSTRAINT [FK_EntityBehavior_Entity]

PRINT(N'Drop constraint FK_EntityDocument_Entity from [__mj].[EntityDocument]')
ALTER TABLE [__mj].[EntityDocument] NOCHECK CONSTRAINT [FK_EntityDocument_Entity]

PRINT(N'Drop constraint FK_EntityFieldValue_Entity from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_Entity]

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

PRINT(N'Drop constraint FK_User_LinkedEntity from [__mj].[User]')
ALTER TABLE [__mj].[User] NOCHECK CONSTRAINT [FK_User_LinkedEntity]

PRINT(N'Drop constraint FK_UserApplicationEntity_Entity from [__mj].[UserApplicationEntity]')
ALTER TABLE [__mj].[UserApplicationEntity] NOCHECK CONSTRAINT [FK_UserApplicationEntity_Entity]

PRINT(N'Drop constraint FK_UserFavorite_Entity from [__mj].[UserFavorite]')
ALTER TABLE [__mj].[UserFavorite] NOCHECK CONSTRAINT [FK_UserFavorite_Entity]

PRINT(N'Drop constraint FK_UserRecordLog_Entity from [__mj].[UserRecordLog]')
ALTER TABLE [__mj].[UserRecordLog] NOCHECK CONSTRAINT [FK_UserRecordLog_Entity]

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

PRINT(N'Delete row from [__mj].[UserView]')
DELETE FROM [__mj].[UserView] WHERE [ID] = 109

PRINT(N'Delete row from [__mj].[VersionInstallation]')
DELETE FROM [__mj].[VersionInstallation] WHERE [ID] = 9

PRINT(N'Update rows in [__mj].[EntityField]')
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 336
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 341
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 344
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 345
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 406
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 407
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 408
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 409
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 410
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 411
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 412
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 413
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 414
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 415
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 416
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 417
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 418
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 426
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 427
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 428
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 429
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 542
UPDATE [__mj].[EntityField] SET [AllowUpdateInView]=0, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 657
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 658
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 659
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 660
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 662
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 663
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 764
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 801
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 829
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 830
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 831
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 832
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 843
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 844
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 845
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 846
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 847
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1220
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1227
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1244
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1247
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1248
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1271
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1277
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1278
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1279
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1280
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1281
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1282
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1293
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1297
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1324
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1325
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1326
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1327
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1328
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1329
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1330
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1331
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1332
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1333
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1334
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1335
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1347
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1349
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1350
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1351
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1355
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1356
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1359
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1362
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1363
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1364
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1365
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1366
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1367
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1368
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1369
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1370
UPDATE [__mj].[EntityField] SET [Length]=-1, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1371
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1435
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1438
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1439
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1440
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1441
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1442
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1443
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1444
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1445
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1446
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1447
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1448
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1449
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1450
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1451
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1452
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1453
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1454
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1455
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1532
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1533
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1534
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1577
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1578
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1579
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1580
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1742
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1743
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1744
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1780
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1942
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1943
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1944
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1945
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1946
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1947
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1948
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1949
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1950
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1951
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1952
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1953
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1954
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1955
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1956
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1957
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1958
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1959
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1960
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1963
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1964
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1965
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1966
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1967
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1968
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1969
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1970
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1971
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1972
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1973
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1974
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1975
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1983
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1984
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1985
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1986
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1987
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1988
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1989
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 1990
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2003
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2004
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2005
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2006
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2007
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2008
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2009
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2010
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2011
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2012
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2013
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2014
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2015
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2016
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2017
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2018
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2019
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2020
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2024
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2026
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2028
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2029
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2030
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2031
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2032
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2033
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2034
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2035
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2036
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2037
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2038
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2039
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2040
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2041
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2042
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2043
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2044
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2143
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2144
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2145
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2146
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2147
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2149
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2150
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2151
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2156
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2157
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2158
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2159
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2160
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2161
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2162
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2164
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2166
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2170
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2172
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2176
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2177
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2178
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2187
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2188
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2189
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2202
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2207
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2208
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2209
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2210
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2213
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2214
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2215
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2267
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2276
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2283
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2580
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2623
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2624
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2625
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2626
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2627
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2628
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2747
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2748
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2749
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2750
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2751
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2752
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2753
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2754
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2756
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2767
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2769
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2770
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2771
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2772
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2773
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2774
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2775
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2776
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2785
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2787
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2790
UPDATE [__mj].[EntityField] SET [AllowUpdateAPI]=0, [AllowUpdateInView]=0, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2791
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2792
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2793
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2794
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2795
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2809
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2810
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2813
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2814
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2815
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2816
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2817
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2818
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2819
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2820
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2821
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2822
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2823
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2824
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 2825
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3079
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3080
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3082
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3083
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3085
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3086
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3087
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3088
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3089
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3090
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3091
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3093
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3094
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3096
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3097
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3098
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3099
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3100
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3101
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3102
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3103
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3104
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3105
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3106
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3107
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3108
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3109
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3110
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3111
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3112
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3113
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3114
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3116
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3117
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3118
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3119
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3120
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3121
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3122
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3126
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3127
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3128
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3129
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3130
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3131
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3132
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3133
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3223
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3224
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3225
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3227
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3229
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3230
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3231
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3232
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3233
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3234
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3235
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3236
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3237
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3238
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3239
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3240
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3241
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3242
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3243
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3244
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3245
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3248
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3250
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3259
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3260
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3261
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3265
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3462
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3463
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3464
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3465
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3466
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3467
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3468
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3469
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3470
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3471
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3472
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3473
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3477
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3478
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3491
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3496
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3497
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3498
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3499
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3500
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3501
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3502
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3507
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3508
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3510
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3511
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3512
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3513
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3514
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3515
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3516
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3517
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3518
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3525
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3526
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3532
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3533
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3534
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3542
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3554
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3555
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3556
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3557
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3558
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3559
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3560
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3561
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3562
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3563
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3564
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3565
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3566
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3567
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3568
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3569
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3570
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3571
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3572
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3573
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3574
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3575
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3596
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3597
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3598
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3599
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3600
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3601
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3602
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3603
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3605
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3606
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3607
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3608
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3609
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3610
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3611
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3612
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3613
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3614
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3615
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3616
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3617
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3618
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3631
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3632
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3633
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3637
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3671
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3672
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3673
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3674
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3675
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3676
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3677
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3678
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3682
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3683
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3689
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3691
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3692
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3704
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3705
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3735
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3736
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3737
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3738
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3739
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3740
UPDATE [__mj].[EntityField] SET [DefaultValue]=NULL, [UpdatedAt]='2024-05-24 19:19:21.843' WHERE [ID] = 3743
PRINT(N'Operation applied to 1024 rows out of 1024')

PRINT(N'Update rows in [__mj].[DatasetItem]')
UPDATE [__mj].[DatasetItem] SET [Sequence]=2, [UpdatedAt]='2024-05-23 14:26:51.843' WHERE [ID] = 4
UPDATE [__mj].[DatasetItem] SET [Sequence]=1, [UpdatedAt]='2024-05-23 14:26:46.060' WHERE [ID] = 5
UPDATE [__mj].[DatasetItem] SET [Sequence]=4, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 6
UPDATE [__mj].[DatasetItem] SET [Sequence]=7, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 7
UPDATE [__mj].[DatasetItem] SET [Sequence]=8, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 8
UPDATE [__mj].[DatasetItem] SET [Sequence]=9, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 9
UPDATE [__mj].[DatasetItem] SET [Sequence]=10, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 10
UPDATE [__mj].[DatasetItem] SET [Sequence]=13, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 11
UPDATE [__mj].[DatasetItem] SET [Sequence]=14, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 13
UPDATE [__mj].[DatasetItem] SET [Sequence]=15, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 14
UPDATE [__mj].[DatasetItem] SET [Sequence]=16, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 18
UPDATE [__mj].[DatasetItem] SET [Sequence]=17, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 19
UPDATE [__mj].[DatasetItem] SET [Sequence]=18, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 20
UPDATE [__mj].[DatasetItem] SET [Sequence]=19, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 21
UPDATE [__mj].[DatasetItem] SET [Sequence]=20, [UpdatedAt]='2024-05-23 14:27:05.170' WHERE [ID] = 22
PRINT(N'Operation applied to 15 rows out of 15')

PRINT(N'Add row to [__mj].[AIModel]')
SET IDENTITY_INSERT [__mj].[AIModel] ON
INSERT INTO [__mj].[AIModel] ([ID], [Name], [Vendor], [AIModelTypeID], [IsActive], [Description], [DriverClass], [DriverImportPath], [APIName], [PowerRank], [CreatedAt], [UpdatedAt]) VALUES (16, N'GPT 4o', N'OpenAI', 1, 1, N'GPT 4 Omni', N'OpenAILLM', NULL, N'gpt-4o', 6, '2024-05-23 01:08:25.113', '2024-05-23 01:08:25.113')
SET IDENTITY_INSERT [__mj].[AIModel] OFF

PRINT(N'Add rows to [__mj].[Entity]')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt]) VALUES (209, NULL, N'Entity Behaviors', NULL, N'Stores the behaviors for each entity and is used for code generation and injection of behavior code into various areas of the system.', 1, N'EntityBehavior', N'vwEntityBehaviors', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-05-22 20:47:07.937', '2024-05-22 20:47:07.937')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt]) VALUES (210, NULL, N'Entity Behavior Types', NULL, N'This table stores the list of possible behavior types to use in the Entity Behavior Types entity. ', 1, N'EntityBehaviorType', N'vwEntityBehaviorTypes', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-05-22 20:47:08.500', '2024-05-22 22:33:16.900')
INSERT INTO [__mj].[Entity] ([ID], [ParentID], [Name], [NameSuffix], [Description], [AutoUpdateDescription], [BaseTable], [BaseView], [BaseViewGenerated], [SchemaName], [VirtualEntity], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [IncludeInAPI], [AllowAllRowsAPI], [AllowUpdateAPI], [AllowCreateAPI], [AllowDeleteAPI], [CustomResolverAPI], [AllowUserSearchAPI], [FullTextSearchEnabled], [FullTextCatalog], [FullTextCatalogGenerated], [FullTextIndex], [FullTextIndexGenerated], [FullTextSearchFunction], [FullTextSearchFunctionGenerated], [UserViewMaxRows], [spCreate], [spUpdate], [spDelete], [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [CascadeDeletes], [spMatch], [UserFormGenerated], [EntityObjectSubclassName], [EntityObjectSubclassImport], [CreatedAt], [UpdatedAt]) VALUES (211, NULL, N'Application Settings', NULL, NULL, 1, N'ApplicationSetting', N'vwApplicationSettings', 1, N'__mj', 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0, NULL, 1, NULL, NULL, '2024-05-22 20:47:09.060', '2024-05-23 15:12:46.390')
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Add row to [__mj].[EntityBehaviorType]')
SET IDENTITY_INSERT [__mj].[EntityBehaviorType] ON
INSERT INTO [__mj].[EntityBehaviorType] ([ID], [Name], [Description], [CreatedAt], [UpdatedAt]) VALUES (1, N'Validation', N'Behavior to apply to the entity in question whenever it is saved', '2024-05-22 23:03:27.700', '2024-05-22 23:03:27.700')
SET IDENTITY_INSERT [__mj].[EntityBehaviorType] OFF

PRINT(N'Add row to [__mj].[VersionInstallation]')
SET IDENTITY_INSERT [__mj].[VersionInstallation] ON
INSERT INTO [__mj].[VersionInstallation] ([ID], [MajorVersion], [MinorVersion], [PatchVersion], [Type], [InstalledAt], [Status], [InstallLog], [Comments], [CreatedAt], [UpdatedAt]) VALUES (10, 1, 4, 0, N'New', '2024-05-25 13:17:49.663', N'Pending', NULL, NULL, '2024-05-25 13:17:49.663', '2024-05-25 13:17:49.663')
SET IDENTITY_INSERT [__mj].[VersionInstallation] OFF

PRINT(N'Add rows to [__mj].[ApplicationEntity]')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] ON
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (121, N'Admin', 209, 1007, 0, '2024-05-22 20:47:08.067', '2024-05-22 20:47:08.067')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (122, N'Admin', 210, 1008, 0, '2024-05-22 20:47:08.627', '2024-05-22 20:47:08.627')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (123, N'Admin', 211, 1009, 0, '2024-05-22 20:47:09.190', '2024-05-22 20:47:09.190')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (125, N'Admin', 209, 50, 0, '2024-05-22 23:12:57.880', '2024-05-22 23:12:57.880')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (126, N'Admin', 210, 50, 0, '2024-05-22 23:13:03.410', '2024-05-22 23:13:03.410')
INSERT INTO [__mj].[ApplicationEntity] ([ID], [ApplicationName], [EntityID], [Sequence], [DefaultForNewUser], [CreatedAt], [UpdatedAt]) VALUES (127, N'Admin', 211, 50, 0, '2024-05-22 23:13:06.410', '2024-05-22 23:13:06.410')
SET IDENTITY_INSERT [__mj].[ApplicationEntity] OFF
PRINT(N'Operation applied to 6 rows out of 6')

PRINT(N'Add rows to [__mj].[DatasetItem]')
SET IDENTITY_INSERT [__mj].[DatasetItem] ON
INSERT INTO [__mj].[DatasetItem] ([ID], [Code], [DatasetName], [Sequence], [EntityID], [WhereClause], [DateFieldToCheck], [Description], [CreatedAt], [UpdatedAt]) VALUES (23, N'EntityBehaviorTypes', N'MJ_Metadata', 5, 210, NULL, N'UpdatedAt', NULL, '2024-05-23 14:21:44.800', '2024-05-23 14:27:05.170')
INSERT INTO [__mj].[DatasetItem] ([ID], [Code], [DatasetName], [Sequence], [EntityID], [WhereClause], [DateFieldToCheck], [Description], [CreatedAt], [UpdatedAt]) VALUES (24, N'EntityBehaviors', N'MJ_Metadata', 11, 209, NULL, N'UpdatedAt', NULL, '2024-05-23 14:22:52.203', '2024-05-23 14:27:05.170')
INSERT INTO [__mj].[DatasetItem] ([ID], [Code], [DatasetName], [Sequence], [EntityID], [WhereClause], [DateFieldToCheck], [Description], [CreatedAt], [UpdatedAt]) VALUES (25, N'EntitySettings', N'MJ_Metadata', 12, 206, NULL, N'UpdatedAt', NULL, '2024-05-23 14:24:22.957', '2024-05-23 14:27:05.170')
INSERT INTO [__mj].[DatasetItem] ([ID], [Code], [DatasetName], [Sequence], [EntityID], [WhereClause], [DateFieldToCheck], [Description], [CreatedAt], [UpdatedAt]) VALUES (26, N'EntityDocumentTypes', N'MJ_Metadata', 6, 189, NULL, N'UpdatedAt', NULL, '2024-05-23 14:25:53.960', '2024-05-23 14:27:05.170')
INSERT INTO [__mj].[DatasetItem] ([ID], [Code], [DatasetName], [Sequence], [EntityID], [WhereClause], [DateFieldToCheck], [Description], [CreatedAt], [UpdatedAt]) VALUES (27, N'ApplicationSettings', N'MJ_Metadata', 3, 211, NULL, N'UpdatedAt', NULL, '2024-05-23 14:27:22.507', '2024-05-23 14:27:22.507')
SET IDENTITY_INSERT [__mj].[DatasetItem] OFF
PRINT(N'Operation applied to 5 rows out of 5')

PRINT(N'Add rows to [__mj].[EntityField]')
SET IDENTITY_INSERT [__mj].[EntityField] ON
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3744, 209, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 1, NULL, '2024-05-22 20:48:00.530', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3745, 209, 2, N'EntityID', N'Entity ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 37, N'ID', 1, N'Entity', '2024-05-22 20:48:00.597', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3746, 209, 3, N'BehaviorTypeID', N'Behavior Type ID', NULL, 1, 0, 0, NULL, N'int', 4, 10, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 210, N'ID', 0, NULL, '2024-05-22 20:48:00.667', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3747, 209, 4, N'Description', N'Description', N'This field will be used by the AI system to generate code that corresponds to the requested behavior and inject the code into the appropriate part(s) of the system.', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:00.737', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3748, 209, 6, N'Code', N'Code', N'This is the code that implements the desired behavior. If the CodeGenerated bit is set to 1, each time CodeGen runs, it will use the Code specified here in the appropriate place(s). To override the generated code and prevent it from being changed in the future, set CodeGenerated = 0', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:00.803', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3749, 209, 8, N'CodeGenerated', N'Code Generated', NULL, 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((1))', 0, N'None', NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:00.870', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3750, 209, 9, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:00.930', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3751, 209, 10, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:00.993', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3752, 210, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.057', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3753, 210, 2, N'Name', N'Name', N'The name of the behavior, a unique column for the table. ', 1, 0, 1, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.120', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3754, 210, 3, N'Description', N'Description', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.180', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3755, 210, 4, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.247', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3756, 210, 5, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, 1, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.310', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3757, 211, 1, N'ID', N'ID', NULL, 1, 1, 1, NULL, N'int', 4, 10, 0, 0, NULL, 1, N'None', NULL, 1, NULL, 50, 0, 1, 1, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.373', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3759, 211, 3, N'Name', N'Name', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, N'Details', 0, 1, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.500', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3760, 211, 4, N'Value', N'Value', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.563', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3761, 211, 5, N'Comments', N'Comments', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.630', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3762, 211, 6, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.693', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3763, 211, 7, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 20:48:01.757', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3764, 209, 11, N'Entity', N'Entity', NULL, 1, 0, 0, NULL, N'nvarchar', 510, 0, 0, 0, NULL, 0, N'None', NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-05-22 20:49:10.293', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3766, 209, 7, N'CodeExplanation', N'Code Explanation', N'When an AI model generates code this will be populated with the AI''s explanation of how the code works to meet the requirements of the behavior. For a non-generated piece of code a developer could manually place an explanation in this field.', 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-22 21:13:38.800', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3768, 209, 5, N'RegenerateCode', N'Regenerate Code', N'This bit field is automatically turned on whenever the Description field is changed so that a future server process will pick it up and regenerate the code. This might happen asynchronously or synchronously depending on system setup.', 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((0))', 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-05-23 00:49:03.503', '2024-05-24 19:19:21.843')
INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (3769, 211, 2, N'ApplicationName', N'Application Name', NULL, 1, 0, 0, NULL, N'nvarchar', 100, 0, 0, 0, NULL, 0, N'None', NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 71, N'Name', 0, NULL, '2024-05-23 15:04:16.327', '2024-05-24 19:19:21.843')
SET IDENTITY_INSERT [__mj].[EntityField] OFF
PRINT(N'Operation applied to 23 rows out of 23')

PRINT(N'Add rows to [__mj].[EntityPermission]')
SET IDENTITY_INSERT [__mj].[EntityPermission] ON
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (539, 209, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.130', '2024-05-22 20:47:08.130')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (540, 209, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.193', '2024-05-22 20:47:08.193')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (541, 209, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.253', '2024-05-22 20:47:08.253')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (542, 210, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.690', '2024-05-22 20:47:08.690')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (543, 210, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.753', '2024-05-22 20:47:08.753')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (544, 210, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-05-22 20:47:08.813', '2024-05-22 20:47:08.813')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (545, 211, N'UI', 0, 1, 0, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:09.257', '2024-05-22 20:47:09.257')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (546, 211, N'Developer', 1, 1, 1, 0, NULL, NULL, NULL, NULL, '2024-05-22 20:47:09.320', '2024-05-22 20:47:09.320')
INSERT INTO [__mj].[EntityPermission] ([ID], [EntityID], [RoleName], [CanCreate], [CanRead], [CanUpdate], [CanDelete], [ReadRLSFilterID], [CreateRLSFilterID], [UpdateRLSFilterID], [DeleteRLSFilterID], [CreatedAt], [UpdatedAt]) VALUES (547, 211, N'Integration', 1, 1, 1, 1, NULL, NULL, NULL, NULL, '2024-05-22 20:47:09.383', '2024-05-22 20:47:09.383')
SET IDENTITY_INSERT [__mj].[EntityPermission] OFF
PRINT(N'Operation applied to 9 rows out of 9')

PRINT(N'Add rows to [__mj].[EntityRelationship]')
SET IDENTITY_INSERT [__mj].[EntityRelationship] ON
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (204, 37, 0, 209, 1, 0, N'One To Many         ', NULL, N'EntityID', NULL, NULL, NULL, 1, N'Entity Behaviors', NULL, '2024-05-22 20:48:18.480', '2024-05-22 20:48:18.480')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (205, 71, 0, 211, 1, 0, N'One To Many         ', NULL, N'ApplicationID', NULL, NULL, NULL, 1, N'Application Settings', NULL, '2024-05-22 20:48:20.573', '2024-05-22 20:48:20.573')
INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (207, 210, 0, 209, 1, 0, N'One To Many         ', NULL, N'BehaviorTypeID', NULL, NULL, NULL, 1, N'Entity Behaviors', NULL, '2024-05-23 00:38:46.153', '2024-05-23 00:38:46.153')
SET IDENTITY_INSERT [__mj].[EntityRelationship] OFF
PRINT(N'Operation applied to 3 rows out of 3')

PRINT(N'Add constraints to [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Add constraints to [__mj].[UserView]')
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_Entity]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_User]
ALTER TABLE [__mj].[UserView] WITH CHECK CHECK CONSTRAINT [FK_UserView_UserViewCategory]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_UserView]
ALTER TABLE [__mj].[UserViewRun] WITH CHECK CHECK CONSTRAINT [FK_UserViewRun_UserView]

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

PRINT(N'Add constraints to [__mj].[DatasetItem]')
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_DatasetName]
ALTER TABLE [__mj].[DatasetItem] WITH CHECK CHECK CONSTRAINT [FK_DatasetItem_Entity]

PRINT(N'Add constraints to [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_Entity]
ALTER TABLE [__mj].[EntityBehavior] WITH CHECK CHECK CONSTRAINT [FK_EntityBehavior_EntityBehaviorType]

PRINT(N'Add constraints to [__mj].[Entity]')
ALTER TABLE [__mj].[Entity] WITH CHECK CHECK CONSTRAINT [FK_Entity_Entity]
ALTER TABLE [__mj].[AuditLog] WITH CHECK CHECK CONSTRAINT [FK_AuditLog_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity]
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] WITH CHECK CHECK CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity]
ALTER TABLE [__mj].[Conversation] WITH CHECK CHECK CONSTRAINT [FK_Conversation_Entity]
ALTER TABLE [__mj].[DataContextItem] WITH CHECK CHECK CONSTRAINT [FK_DataContextItem_Entity]
ALTER TABLE [__mj].[DuplicateRun] WITH CHECK CHECK CONSTRAINT [FK_DuplicateRun_Entity]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity]
ALTER TABLE [__mj].[EntityAIAction] WITH CHECK CHECK CONSTRAINT [FK_EntityAIAction_Entity1]
ALTER TABLE [__mj].[EntityBehavior] WITH CHECK CHECK CONSTRAINT [FK_EntityBehavior_Entity]
ALTER TABLE [__mj].[EntityDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityDocument_Entity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityRecordDocument] WITH CHECK CHECK CONSTRAINT [FK_EntityRecordDocument_Entity]
ALTER TABLE [__mj].[EntitySetting] WITH CHECK CHECK CONSTRAINT [FK_EntitySetting_Entity]
ALTER TABLE [__mj].[FileEntityRecordLink] WITH CHECK CHECK CONSTRAINT [FK_FileEntityRecordLink_Entity]
ALTER TABLE [__mj].[IntegrationURLFormat] WITH CHECK CHECK CONSTRAINT [FK_IntegrationURLFormat_Entity]
ALTER TABLE [__mj].[List] WITH CHECK CHECK CONSTRAINT [FK_List_Entity]
ALTER TABLE [__mj].[QueryField] WITH CHECK CHECK CONSTRAINT [FK_QueryField_SourceEntity]
ALTER TABLE [__mj].[RecordChange] WITH CHECK CHECK CONSTRAINT [FK_RecordChange_Entity]
ALTER TABLE [__mj].[RecordMergeLog] WITH CHECK CHECK CONSTRAINT [FK_RecordMergeLog_Entity]
ALTER TABLE [__mj].[ResourceType] WITH CHECK CHECK CONSTRAINT [FK__ResourceT__Entit__6D777912]
ALTER TABLE [__mj].[SystemEvent] WITH CHECK CHECK CONSTRAINT [FK_SystemEvent_Entity]
ALTER TABLE [__mj].[TaggedItem] WITH CHECK CHECK CONSTRAINT [FK_TaggedItem_Entity]
ALTER TABLE [__mj].[User] WITH CHECK CHECK CONSTRAINT [FK_User_LinkedEntity]
ALTER TABLE [__mj].[UserApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_UserApplicationEntity_Entity]
ALTER TABLE [__mj].[UserFavorite] WITH CHECK CHECK CONSTRAINT [FK_UserFavorite_Entity]
ALTER TABLE [__mj].[UserRecordLog] WITH CHECK CHECK CONSTRAINT [FK_UserRecordLog_Entity]
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
