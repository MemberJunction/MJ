INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID],
		   [Name]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[IsActive]
           ,[DriverClass]
           ,[APIName])
     VALUES
           (
		   '27C0423E-F36B-1410-8876-005D02743E8C',
           'Betty Bot',
           'Tasio Labs',
           'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
            1,
           'BettyBotLLM',
           'bettybot')
GO