-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIPromptModel @ID = '2390cfeb-a855-4545-ad8f-ac08af119298',
@PromptID = '58658DAE-C1CE-4621-9540-0735FE98414E',
@ModelID = 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D',
@VendorID = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 6,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = N'Active',
@ParallelizationMode = N'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL;