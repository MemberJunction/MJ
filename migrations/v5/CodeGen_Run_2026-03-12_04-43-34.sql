/* SQL text to add special date field __mj_CreatedAt to entity dbo.RSU_TestGadget */
ALTER TABLE [dbo].[RSU_TestGadget] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.RSU_TestGadget */
ALTER TABLE [dbo].[RSU_TestGadget] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

