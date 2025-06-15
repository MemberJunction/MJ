-- Drop the existing constraint
ALTER TABLE [__mj].[DataContextItem]
DROP CONSTRAINT UK_DataContextItem_DataContextID_CodeName;

-- Create a filtered unique index that excludes NULLs
CREATE UNIQUE NONCLUSTERED INDEX IX_DataContextItem_DataContextID_CodeName 
ON [__mj].[DataContextItem] ([DataContextID], [CodeName])
WHERE [CodeName] IS NOT NULL;