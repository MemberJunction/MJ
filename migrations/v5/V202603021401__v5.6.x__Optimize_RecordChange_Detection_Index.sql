-- Optimize external change detection performance by adding a composite index
-- This index speeds up the MAX(ChangedAt) lookups used to detect updates
PRINT N'Creating index [IX_RecordChange_Detection_Optimized] on [${flyway:defaultSchema}].[RecordChange]'
CREATE NONCLUSTERED INDEX [IX_RecordChange_Detection_Optimized] 
ON [${flyway:defaultSchema}].[RecordChange] ([EntityID], [RecordID], [Type], [ChangedAt])
INCLUDE ([FullRecordJSON]);
GO
