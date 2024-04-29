/*

   MemberJunction Upgrade Script
   TYPE: DATA
   FROM: 1.1.3
   TO:   1.1.4
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

PRINT(N'Drop constraints from [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] NOCHECK CONSTRAINT [FK_EntityField_RelatedEntity]

PRINT(N'Drop constraint FK_EntityFieldValue_EntityField from [__mj].[EntityFieldValue]')
ALTER TABLE [__mj].[EntityFieldValue] NOCHECK CONSTRAINT [FK_EntityFieldValue_EntityField]

PRINT(N'Delete and re-insert rows in [__mj].[EntityField] due to identity row modification')
UPDATE [__mj].[EntityField] SET [Type]=N'nvarchar', [Length]=1000, [Precision]=0, [UpdatedAt]='2024-04-25 12:43:55.460' WHERE [EntityID] = 173 AND [Name] = N'LinkedRecordID'
PRINT(N'Operation applied to 1 rows out of 965')

PRINT(N'Add constraints to [__mj].[EntityField]')
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_Entity]
ALTER TABLE [__mj].[EntityField] WITH CHECK CHECK CONSTRAINT [FK_EntityField_RelatedEntity]
ALTER TABLE [__mj].[EntityFieldValue] WITH CHECK CHECK CONSTRAINT [FK_EntityFieldValue_EntityField]
COMMIT TRANSACTION
GO
