-- Migration to add TypeID column to mj.AIModelVendor table
-- This allows tracking of vendor roles (model developer, inference provider, etc.)

-- Add the TypeID column and foreign key constraint
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor]
ADD [TypeID] uniqueidentifier NULL
    CONSTRAINT [FK_AIModelVendor_AIVendorTypeDefinition]
    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[AIVendorTypeDefinition] ([ID]);

-- Add extended property documentation for the new column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the type/role of the vendor for this model (e.g., model developer, inference provider)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelVendor',
    @level2type = N'COLUMN', @level2name = N'TypeID';

-- Remove existing UQ constraint as we need to add TypeID to it
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] DROP CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID]
GO

/****** Object:  Index [UQ_AIModelVendor_ModelID_VendorID]    Script Date: 5/30/2025 2:02:35 PM ******/
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD  CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID_TypeID] UNIQUE NONCLUSTERED 
(
	[ModelID] ASC,
	[VendorID] ASC,
	[TypeID] ASC
) 


-- Update all existing rows to be Inference Provider type
UPDATE [${flyway:defaultSchema}].[AIModelVendor] 
SET [TypeID] = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3'
WHERE [TypeID] IS NULL;

-- Duplicate all rows as Model Developer type - EXCEPT Groq as they are inference only
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor] (
    [ID],
    [ModelID], 
    [VendorID], 
    [TypeID]
)
SELECT 
    NEWID(),
    [ModelID],
    [VendorID],
    '10DB468E-F2CE-475D-9F39-2DF2DE75D257' -- Model Developer type ID
FROM [${flyway:defaultSchema}].[AIModelVendor]
WHERE 
	[TypeID] = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3' AND 
	VendorID NOT IN (SELECT ID FROM ${flyway:defaultSchema}.AIVendor WHERE Name='Groq');
 