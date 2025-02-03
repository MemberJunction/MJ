-- On 1-24-25, Groq deprecated the Llama 3.1 70 billion parameters model 
-- in favor of the Llama 3.3 70 billion parameters model. 
-- This migration deactivates the Llama 3.1 model and adds the Llama 3.3 model to the AIModel table.

INSERT INTO [${flyway:defaultSchema}].[AIModel]
(
	[Name],
	[Description],
	[Vendor],
	[AIModelTypeID],
	[PowerRank],
	[IsActive],
	[DriverClass],
	[DriverImportPath],
	[APIName],
	[InputTokenLimit],
	[SpeedRank],
	[CostRank]
)
VALUES
(
	'Llama 3.3 70b versatile',
    'Llama 3.3 70 billion parameters',
    'Groq',
    'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '4',
    1,
    'GroqLLM',
    null,
    'llama-3.3-70b-versatile',
    128000,
	null,
	null
)

GO 

UPDATE [${flyway:defaultSchema}].[AIModel]
SET IsActive = 0
where ID = 'F126ED5B-97B3-49E7-BD3B-E796B2099231'

GO

