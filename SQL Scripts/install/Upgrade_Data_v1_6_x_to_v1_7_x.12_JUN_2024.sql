/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.6.x
   TO:   1.7.x
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

PRINT(N'Drop constraints from [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_RelatedEntity]

PRINT(N'Drop constraint FK_EntityFieldValue_EntityField from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Drop constraints from [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] NOCHECK CONSTRAINT [FK_ApplicationEntity_Entity]

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

PRINT(N'Drop constraint FK_EntityFieldValue_Entity from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_Entity]

PRINT(N'Drop constraint FK_EntityPermission_Entity from [__mj].[EntityPermission]')
ALTER TABLE [__mj].[EntityPermission] NOCHECK CONSTRAINT [FK_EntityPermission_Entity]

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

PRINT(N'Drop constraint FK_ApplicationSetting_Application from [__mj].[ApplicationSetting]')
ALTER TABLE [__mj].[ApplicationSetting] NOCHECK CONSTRAINT [FK_ApplicationSetting_Application]

PRINT(N'Drop constraint FK_UserApplication_Application from [__mj].[UserApplication]')
ALTER TABLE [__mj].[UserApplication] NOCHECK CONSTRAINT [FK_UserApplication_Application]

PRINT(N'Delete row from [__mj].[VersionInstallation]')
DELETE FROM [__mj].[VersionInstallation] WHERE [ID] = 12

PRINT(N'Update rows in [__mj].[EntityField]')
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 336
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:24.510' WHERE [ID] = 338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 341
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 344
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 345
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 406
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 407
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 408
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 409
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 410
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 411
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 412
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 413
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 414
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 415
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 416
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 417
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 418
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 426
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 427
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 428
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 429
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:23.713' WHERE [ID] = 432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 542
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 657
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 658
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 659
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 660
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 662
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 663
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:25.277' WHERE [ID] = 711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 715
UPDATE [__mj].[EntityField] SET [Sequence]=48, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 716
UPDATE [__mj].[EntityField] SET [Sequence]=49, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 717
UPDATE [__mj].[EntityField] SET [Sequence]=50, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 764
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 801
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 829
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 830
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 831
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 832
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 843
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 844
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 845
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 846
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 847
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1220
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1227
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1244
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1247
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1248
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1271
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1277
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1278
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1279
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1280
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1281
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1282
UPDATE [__mj].[EntityField] SET [Description]=N'When set to 1, the entity will be included by default for a new user when they first access the application in question', [DefaultValue]=N'((1))', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1293
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1297
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1324
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1325
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1326
UPDATE [__mj].[EntityField] SET [Sequence]=45, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1327
UPDATE [__mj].[EntityField] SET [Sequence]=46, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1328
UPDATE [__mj].[EntityField] SET [Sequence]=47, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1329
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1330
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1331
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1332
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1333
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1334
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1335
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1337
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1338
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1339
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1340
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1342
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1343
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1347
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1349
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1350
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1351
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1355
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1356
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1359
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1362
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1363
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1364
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1365
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1366
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1367
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1368
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1369
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1370
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1371
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1419
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1420
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1421
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1422
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1423
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:26.870' WHERE [ID] = 1424
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1425
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1430
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1431
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1432
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1433
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1434
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1435
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1438
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1439
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1440
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1441
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1442
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1443
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1444
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1445
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1446
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1447
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1448
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1449
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1450
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1451
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1452
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1453
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1454
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1455
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:28.010' WHERE [ID] = 1493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1521
UPDATE [__mj].[EntityField] SET [Sequence]=8, [Description]=N'The date/time that the change occured.', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1529
UPDATE [__mj].[EntityField] SET [Length]=1500, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1530
UPDATE [__mj].[EntityField] SET [Sequence]=12, [Description]=N'For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error', [Type]=N'nvarchar', [Length]=100, [UpdatedAt]='2024-06-12 05:17:30.337' WHERE [ID] = 1531
UPDATE [__mj].[EntityField] SET [Sequence]=9, [Description]=N'JSON structure that describes what was changed in a structured format.', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1532
UPDATE [__mj].[EntityField] SET [Sequence]=10, [Description]=N'A generated, human-readable description of what was changed.', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1533
UPDATE [__mj].[EntityField] SET [Sequence]=11, [Description]=N'A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1534
UPDATE [__mj].[EntityField] SET [Sequence]=14, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1577
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1578
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1579
UPDATE [__mj].[EntityField] SET [Sequence]=6, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1580
UPDATE [__mj].[EntityField] SET [Sequence]=7, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:31.153' WHERE [ID] = 1693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:31.980' WHERE [ID] = 1706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:20.330' WHERE [ID] = 1725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1742
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1743
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1744
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:21.280' WHERE [ID] = 1746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1780
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1942
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1943
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1944
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1945
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1946
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1947
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1948
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1949
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1950
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1951
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1952
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1953
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1954
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1955
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1956
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1957
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1958
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1959
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1960
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1963
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1964
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1965
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1966
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1967
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:32.830' WHERE [ID] = 1968
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1969
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:33.647' WHERE [ID] = 1970
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1971
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1972
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1973
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1974
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1975
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1983
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1984
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1985
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1986
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1987
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1988
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1989
UPDATE [__mj].[EntityField] SET [Description]=N'The user that made the change', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 1990
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2003
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2004
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2005
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2006
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2007
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2008
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2009
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2010
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2011
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2012
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2013
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2014
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:34.677' WHERE [ID] = 2015
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2016
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2017
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2018
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2019
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2020
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2024
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2026
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2028
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2029
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2030
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2031
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2032
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2033
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2034
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2035
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2036
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2037
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2038
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2039
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2040
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2041
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2042
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2043
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2044
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2143
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2144
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2145
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2146
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2147
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2149
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2150
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2151
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2156
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2157
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2158
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2159
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2160
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2161
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2162
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2164
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2166
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:35.633' WHERE [ID] = 2170
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2172
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2176
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2177
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2178
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2187
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2188
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2189
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2191
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2192
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2193
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2194
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2195
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2196
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2197
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2198
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2199
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2200
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2201
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2202
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2203
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2204
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2205
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2206
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2207
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2208
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2209
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2210
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2211
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2212
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2213
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2214
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2215
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2267
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2268
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2269
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2270
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2272
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2273
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2274
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2275
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2276
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2283
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:36.600' WHERE [ID] = 2535
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2580
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2581
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2582
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2623
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2624
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2625
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2626
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2627
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2628
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2664
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2747
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2748
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2749
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2750
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2751
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2752
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2753
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2754
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2756
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2758
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2765
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2767
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2769
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2770
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2771
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2772
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2773
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2774
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2775
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2776
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2777
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2778
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2779
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2781
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2785
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2787
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2790
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2791
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2792
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2793
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2794
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2795
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2796
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2797
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2798
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2799
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2800
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2802
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2803
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2804
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2805
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2806
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2807
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2808
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2809
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:38.563' WHERE [ID] = 2810
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2811
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:37.587' WHERE [ID] = 2812
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2813
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2814
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2815
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2816
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2817
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2818
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2819
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2820
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2821
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:39.503' WHERE [ID] = 2822
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2823
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2824
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 2825
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3079
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3080
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3082
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3083
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3085
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3086
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3087
UPDATE [__mj].[EntityField] SET [Sequence]=17, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3088
UPDATE [__mj].[EntityField] SET [Sequence]=18, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3089
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3090
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3091
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3093
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3094
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3096
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3097
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3098
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3099
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3100
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3101
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3102
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3103
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3104
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3105
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3106
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3107
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3108
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3109
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3110
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3111
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3112
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3113
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3114
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3116
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3117
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3118
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3119
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3120
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3121
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3122
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3126
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3127
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3128
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3129
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3130
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3131
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3132
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3133
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3221
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3222
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3223
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3224
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3225
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3226
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3227
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3228
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3229
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3230
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3231
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3232
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3233
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3234
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3235
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3236
UPDATE [__mj].[EntityField] SET [Sequence]=4, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3237
UPDATE [__mj].[EntityField] SET [Sequence]=5, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3238
UPDATE [__mj].[EntityField] SET [Sequence]=6, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3239
UPDATE [__mj].[EntityField] SET [Sequence]=8, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3240
UPDATE [__mj].[EntityField] SET [Sequence]=9, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3241
UPDATE [__mj].[EntityField] SET [Sequence]=10, [UpdatedAt]='2024-06-12 05:17:40.600' WHERE [ID] = 3242
UPDATE [__mj].[EntityField] SET [Sequence]=11, [Description]=N'Value indicating the quality of the query, higher values mean a better quality', [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3243
UPDATE [__mj].[EntityField] SET [Sequence]=13, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3244
UPDATE [__mj].[EntityField] SET [Sequence]=14, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3245
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3246
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3248
UPDATE [__mj].[EntityField] SET [Sequence]=15, [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3249
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3250
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3251
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3252
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3253
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3254
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3255
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3256
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3257
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3258
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3259
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3260
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3261
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3262
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3263
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3264
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3265
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3462
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3463
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3464
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3465
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3466
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3467
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3468
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3469
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3470
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3471
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3472
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3473
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3474
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3475
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3476
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3477
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:41.563' WHERE [ID] = 3478
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3479
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3480
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3481
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3482
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3483
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3484
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3485
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3486
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3487
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3488
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3489
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3490
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3491
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3492
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3493
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3494
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3495
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3496
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3497
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3498
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3499
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3500
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3501
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:42.370' WHERE [ID] = 3502
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3503
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3504
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3505
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3506
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3507
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3508
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3510
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3511
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3512
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3513
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:43.580' WHERE [ID] = 3514
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3515
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3516
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3517
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3518
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3519
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3520
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3521
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3522
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3523
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3524
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3525
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3526
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3527
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3528
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3529
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3530
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3531
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3532
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3533
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3534
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3536
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3537
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3538
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3539
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3540
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3541
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3542
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3543
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3544
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3545
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3546
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3547
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3548
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3549
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3550
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3551
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3552
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3553
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3554
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3555
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3556
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3557
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3558
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3559
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3560
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3561
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3562
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3563
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3564
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3565
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3566
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3567
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3568
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3569
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3570
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3571
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3572
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3573
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3574
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3575
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3576
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3583
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3584
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3585
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3586
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3587
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3588
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3589
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3590
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3591
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3592
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3593
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3594
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3595
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3596
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3597
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3598
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3599
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3600
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3601
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3602
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3603
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3604
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3605
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3606
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3607
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3608
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3609
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3610
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3611
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3612
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3613
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3614
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3615
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3616
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3617
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3618
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3631
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3632
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3633
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3634
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:29.453' WHERE [ID] = 3635
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3636
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3637
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3638
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3639
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3640
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3641
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:44.380' WHERE [ID] = 3642
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3643
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:45.583' WHERE [ID] = 3644
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3645
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3646
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3647
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3648
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3649
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3650
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3651
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3652
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3653
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3654
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3655
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3665
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3666
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3667
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3668
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3669
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3670
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3671
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3672
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3673
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3674
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3675
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3676
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3677
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3678
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3682
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3683
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3684
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3685
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3686
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3687
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3688
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3689
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:46.550' WHERE [ID] = 3690
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:47.480' WHERE [ID] = 3691
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3692
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3693
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3694
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3695
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3696
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3697
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3698
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3699
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3700
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3701
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3702
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3703
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3704
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3705
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3706
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3707
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3708
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3709
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3710
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3711
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3712
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3713
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3714
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:49.247' WHERE [ID] = 3715
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3716
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3717
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:50.337' WHERE [ID] = 3718
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3719
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3720
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3721
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3722
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3723
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3724
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3725
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:51.460' WHERE [ID] = 3726
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3727
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3728
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:52.613' WHERE [ID] = 3729
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3730
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3731
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3732
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3733
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3734
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3735
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3736
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3737
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3738
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3739
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:48.290' WHERE [ID] = 3740
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3743
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3744
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3745
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3746
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3747
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3748
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3749
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3750
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3751
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3752
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3753
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3754
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3755
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3756
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3757
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3759
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3760
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3761
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3762
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3763
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3764
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3766
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3768
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 3769
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7858
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7859
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7860
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7861
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:53.593' WHERE [ID] = 7862
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7863
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7864
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7873
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7874
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7875
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:54.573' WHERE [ID] = 7876
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7877
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7878
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7879
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7880
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7881
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:55.517' WHERE [ID] = 7882
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7883
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7884
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7885
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7886
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7888
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7889
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7890
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7891
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7892
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7893
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7894
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7895
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7896
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7897
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7898
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7899
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7900
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7901
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:56.503' WHERE [ID] = 7902
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7903
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7904
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7905
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7906
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:57.510' WHERE [ID] = 7907
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7908
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7909
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7910
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7911
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7912
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7913
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:58.447' WHERE [ID] = 7914
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7915
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7916
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7925
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7926
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7927
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7928
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7929
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7930
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7931
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7932
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7933
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7934
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7935
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7936
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7937
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7938
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7939
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7940
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7941
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7942
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7943
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7944
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7945
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:59.390' WHERE [ID] = 7946
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7947
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7948
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7949
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7950
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7951
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7952
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7955
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7956
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7957
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7958
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7959
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7960
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7961
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7962
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7964
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7965
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7966
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7967
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7968
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7969
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7971
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7974
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7975
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7976
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7977
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7978
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7979
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7980
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:00.340' WHERE [ID] = 7981
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:02.583' WHERE [ID] = 7982
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7983
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7984
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7985
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7986
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7987
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7988
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7989
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7990
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7991
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7992
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7993
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7994
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7995
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7996
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7997
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7998
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 7999
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:03.527' WHERE [ID] = 8000
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8001
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8002
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8003
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8004
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8005
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8006
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8007
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8009
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8010
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8011
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8012
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8013
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8014
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8015
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8016
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8017
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8018
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:19.353' WHERE [ID] = 8019
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8020
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8021
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8022
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8023
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8031
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8032
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8033
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:04.303' WHERE [ID] = 8034
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8035
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8036
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8037
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8038
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8039
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8040
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:05.083' WHERE [ID] = 8041
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:06.190' WHERE [ID] = 8042
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8043
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8044
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8045
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8046
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8047
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8048
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8049
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:06.997' WHERE [ID] = 8050
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8051
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8052
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8053
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8054
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8055
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8056
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8057
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:07.817' WHERE [ID] = 8058
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8059
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:08.920' WHERE [ID] = 8060
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8061
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8062
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8063
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8064
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8065
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8066
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8067
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8068
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8069
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8070
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8071
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8072
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8074
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8075
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8076
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8077
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8078
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8079
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8080
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8081
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8082
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8083
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8084
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8085
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8086
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8087
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8088
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8089
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8090
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8091
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8092
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8093
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8094
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8095
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8096
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8097
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8099
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8100
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8101
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8102
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8103
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8104
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8105
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8106
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8107
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8108
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8109
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8110
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8111
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8112
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8113
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:10.063' WHERE [ID] = 8114
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8115
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8116
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8117
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8118
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8119
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8120
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8121
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8122
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8123
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8124
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8125
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8126
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8127
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8128
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8129
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8130
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8131
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8132
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8133
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8134
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8135
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8136
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8137
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8138
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8139
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8140
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8141
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8142
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8143
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8144
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8145
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:18:11.357' WHERE [ID] = 8146
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8147
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8148
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8149
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8150
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8151
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8152
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8153
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8154
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8155
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8156
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8157
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8158
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8159
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8160
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8161
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8162
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8163
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8164
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8165
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8166
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8167
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8169
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8170
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8171
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8172
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8173
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8174
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8175
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8176
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8177
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8178
UPDATE [__mj].[EntityField] SET [UpdatedAt]='2024-06-12 05:17:08.703' WHERE [ID] = 8179
PRINT(N'Operation applied to 1335 rows out of 1335')

PRINT(N'Update rows in [__mj].[ApplicationEntity]')
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 9
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 10
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 14
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 15
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 21
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 31
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 32
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=0, [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 33
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 34
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 52
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 53
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 54
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 55
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 70
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 71
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 72
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 73
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 75
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 76
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 77
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 78
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 79
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 92
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 93
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=1 WHERE [ID] = 94
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 95
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 96
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 97
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 98
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 99
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 100
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 101
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 102
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 103
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 108
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 110
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 111
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 112
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 113
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 116
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 117
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 118
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 119
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 120
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 121
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 122
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 123
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 125
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 126
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 127
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 149
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 151
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 152
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 153
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 154
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=1 WHERE [ID] = 155
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 156
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 158
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 159
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 160
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 161
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 162
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 163
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 164
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=1 WHERE [ID] = 165
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 166
UPDATE [__mj].[ApplicationEntity] SET [DefaultForNewUser]=1 WHERE [ID] = 168
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 169
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 170
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 171
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 172
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 177
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 178
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 179
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 180
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 181
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 182
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 183
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 184
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 185
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 186
UPDATE [__mj].[ApplicationEntity] SET [UpdatedAt]='2024-06-11 20:20:03.780' WHERE [ID] = 187
PRINT(N'Operation applied to 82 rows out of 82')

PRINT(N'Update rows in [__mj].[Entity]')
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:19:19.143', [Icon]=N'fa-solid fa-sitemap' WHERE [ID] = 5
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:12:24.837', [Icon]=N'fa-solid fa-users' WHERE [ID] = 6
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:19:46.120', [Icon]=N'fa-solid fa-route' WHERE [ID] = 34
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:27:44.263', [Icon]=N'fa-solid fa-database' WHERE [ID] = 37
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:30:26.390', [Icon]=N'fa-solid fa-user' WHERE [ID] = 39
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:31:58.420', [Icon]=N'fa-solid fa-object-group' WHERE [ID] = 71
UPDATE [__mj].[Entity] SET [AllowCreateAPI]=1 WHERE [ID] = 80
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:17:14.937', [Icon]=N'fa-solid fa-fingerprint' WHERE [ID] = 126
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:18:00.823', [Icon]=N'fa-solid fa-shield-halved' WHERE [ID] = 127
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:11:42.763', [Icon]=N'fa-solid fa-folder-tree' WHERE [ID] = 143
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:32:30.610', [Icon]=N'fa-solid fa-table-columns' WHERE [ID] = 153
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:09:01.857', [Icon]=N'fa-solid fa-chart-line' WHERE [ID] = 157
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:12:48.693', [Icon]=N'fa-regular fa-comments' WHERE [ID] = 173
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:13:36.493', [Icon]=N'fa-solid fa-clipboard-question' WHERE [ID] = 186
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:11:56.837', [Icon]=N'fa-solid fa-bezier-curve' WHERE [ID] = 191
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:30:13.593', [Icon]=N'fa-solid fa-bolt' WHERE [ID] = 218
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 20:30:50.330', [Icon]=N'fa-solid fa-book' WHERE [ID] = 228
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:14:59.713', [Icon]=N'fa-solid fa-envelope-open-text' WHERE [ID] = 231
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:16:30.900', [Icon]=N'fa-regular fa-rectangle-list' WHERE [ID] = 236
UPDATE [__mj].[Entity] SET [UpdatedAt]='2024-06-11 22:14:29.057', [Icon]=N'fa-solid fa-circle-nodes' WHERE [ID] = 241
PRINT(N'Operation applied to 20 rows out of 20')

PRINT(N'Update row in [__mj].[Application]')
UPDATE [__mj].[Application] SET [UpdatedAt]='2024-06-11 20:35:08.220', [Icon]=N'fa-solid fa-sliders' WHERE [ID] = 3

DECLARE @DataCheck AS INT = -1
SELECT TOP 1 @DataCheck=ID FROM __mj.EntityActionInvocationType
IF @DataCheck < 0
BEGIN
PRINT(N'Add rows to [__mj].[EntityActionInvocationType]')
SET IDENTITY_INSERT [__mj].[EntityActionInvocationType] ON
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (1, N'BeforeCreate', N'Invokes before a new record is created', 1, '2024-05-29 16:23:12.020', '2024-05-29 16:23:12.020')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (2, N'Read', N'Invokes when a record is read/accessed', 7, '2024-05-29 16:23:37.840', '2024-05-29 16:23:37.840')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (3, N'BeforeUpdate', N'Invokes before an existing record is updated', 3, '2024-05-29 16:23:45.990', '2024-05-29 16:23:45.990')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (4, N'BeforeDelete', N'Invokes before a record is deleted', 5, '2024-05-29 16:23:56.100', '2024-05-29 16:23:56.100')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (5, N'Validate', N'Invokes when a record is being validated', 8, '2024-05-29 16:24:07.670', '2024-05-29 16:24:07.670')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (6, N'List', N'Invokes on demand in the context of all records that are part of a list', 9, '2024-05-29 16:24:37.803', '2024-05-29 16:24:37.803')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (7, N'View', N'Invokes on demand in the context of all records that are part of a view at the time the action is invoked', 10, '2024-05-29 16:24:50.473', '2024-05-29 16:24:50.473')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (8, N'AfterCreate', N'Invokes after a new record is created', 2, '2024-05-30 00:23:10.990', '2024-05-30 00:23:10.990')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (9, N'AfterUpdate', N'Invokes after an existing record is updated', 4, '2024-05-30 00:23:25.363', '2024-05-30 00:23:25.363')
INSERT INTO [__mj].[EntityActionInvocationType] ([ID], [Name], [Description], [DisplaySequence], [CreatedAt], [UpdatedAt]) VALUES (10, N'AfterDelete', N'Invokes after a record is deleted', 6, '2024-05-30 00:23:54.230', '2024-05-30 00:23:54.230')
SET IDENTITY_INSERT [__mj].[EntityActionInvocationType] OFF
PRINT(N'Operation applied to 10 rows out of 10')
END


PRINT(N'Add row to [__mj].[VersionInstallation]')
SET IDENTITY_INSERT [__mj].[VersionInstallation] ON
INSERT INTO [__mj].[VersionInstallation] ([ID], [MajorVersion], [MinorVersion], [PatchVersion], [Type], [InstalledAt], [Status], [InstallLog], [Comments], [CreatedAt], [UpdatedAt]) VALUES (13, 1, 7, 0, N'New', '2024-06-12 04:06:08.547', N'Pending', NULL, NULL, '2024-06-12 04:06:08.547', '2024-06-12 04:06:08.547')
SET IDENTITY_INSERT [__mj].[VersionInstallation] OFF

PRINT(N'Add rows to [__mj].[EntityField]')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (37, 44, N'Icon', N'Icon', N'Optional, specify an icon (CSS Class) for each entity for display in the UI', 1, 0, 0, NULL, N'nvarchar', 1000, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:26.777', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (71, 4, N'Icon', N'Icon', N'Specify the CSS class information for the display icon for each application.', 1, 0, 0, NULL, N'nvarchar', 1000, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:26.930', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (71, 5, N'DefaultForNewUser', N'Default For New User', N'If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.', 1, 0, 0, NULL, N'bit', 1, 1, 0, 0, N'((1))', 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:27.093', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (186, 3, N'UserQuestion', N'User Question', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:27.247', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (186, 7, N'TechnicalDescription', N'Technical Description', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:27.403', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (186, 12, N'ExecutionCostRank', N'Execution Cost Rank', N'Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-11 16:26:27.547', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 5, N'Type', N'Type', N'Create, Update, or Delete', 1, 0, 0, NULL, N'nvarchar', 40, 0, 0, 0, N'(N''Create'')', 0, N'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-12 04:00:33.937', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 6, N'Source', N'Source', N'Internal or External', 1, 0, 0, NULL, N'nvarchar', 40, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-12 04:00:34.080', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 7, N'IntegrationID', N'Integration ID', N'If Source=External, this field can optionally specify which integration created the change, if known', 1, 0, 0, NULL, N'int', 4, 10, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 50, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, 34, N'ID', 1, N'Integration', '2024-06-12 04:00:34.230', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 13, N'ErrorLog', N'Error Log', NULL, 1, 0, 0, NULL, N'nvarchar', -1, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-12 04:00:34.377', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 15, N'CreatedAt', N'Created At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-12 04:00:34.523', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 16, N'UpdatedAt', N'Updated At', NULL, 1, 0, 0, NULL, N'datetime', 8, 23, 3, 0, N'(getdate())', 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 0, 0, NULL, NULL, 0, NULL, '2024-06-12 04:00:34.663', '2024-06-12 05:17:08.703')
INSERT INTO [__mj].[EntityField] ([EntityID], [Sequence], [Name], [DisplayName], [Description], [AutoUpdateDescription], [IsPrimaryKey], [IsUnique], [Category], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [ValueListType], [ExtendedType], [CodeType], [DefaultInView], [ViewCellTemplate], [DefaultColumnWidth], [AllowUpdateAPI], [AllowUpdateInView], [IncludeInUserSearchAPI], [FullTextSearchEnabled], [UserSearchParamFormatAPI], [IncludeInGeneratedForm], [GeneratedFormSection], [IsVirtual], [IsNameField], [RelatedEntityID], [RelatedEntityFieldName], [IncludeRelatedEntityNameFieldInBaseView], [RelatedEntityNameFieldMap], [CreatedAt], [UpdatedAt]) VALUES (97, 19, N'Integration', N'Integration', NULL, 1, 0, 0, NULL, N'nvarchar', 200, 0, 0, 1, NULL, 0, N'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, N'Details', 1, 0, NULL, NULL, 0, NULL, '2024-06-12 04:31:15.640', '2024-06-12 05:17:08.703')
PRINT(N'Operation applied to 13 rows out of 13')

PRINT(N'Add row to [__mj].[EntityRelationship]')
INSERT INTO [__mj].[EntityRelationship] ([EntityID], [Sequence], [RelatedEntityID], [BundleInAPI], [IncludeInParentAllQuery], [Type], [EntityKeyField], [RelatedEntityJoinField], [JoinView], [JoinEntityJoinField], [JoinEntityInverseJoinField], [DisplayInForm], [DisplayName], [DisplayUserViewGUID], [CreatedAt], [UpdatedAt]) VALUES (34, 0, 97, 1, 0, N'One To Many         ', NULL, N'IntegrationID', NULL, NULL, NULL, 1, N'Record Changes', NULL, '2024-06-12 04:01:29.817', '2024-06-12 04:01:29.817')


PRINT(N'Add constraints to [__mj].[EntityRelationship]')
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_EntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_RelatedEntityID]
ALTER TABLE [__mj].[EntityRelationship] WITH CHECK CHECK CONSTRAINT [FK_EntityRelationship_UserView1]

PRINT(N'Add constraints to [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_RelatedEntity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Add constraints to [__mj].[ApplicationEntity]')
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_ApplicationName]
ALTER TABLE [__mj].[ApplicationEntity] WITH CHECK CHECK CONSTRAINT [FK_ApplicationEntity_Entity]
ALTER TABLE [__mj].[EntityActionInvocation] WITH CHECK CHECK CONSTRAINT [FK__EntityAct__Invoc__36211B3A]

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
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_Entity]
ALTER TABLE [__mj].[EntityPermission] WITH CHECK CHECK CONSTRAINT [FK_EntityPermission_Entity]
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
ALTER TABLE [__mj].[ApplicationSetting] WITH CHECK CHECK CONSTRAINT [FK_ApplicationSetting_Application]
ALTER TABLE [__mj].[UserApplication] WITH CHECK CHECK CONSTRAINT [FK_UserApplication_Application]
COMMIT TRANSACTION
GO
