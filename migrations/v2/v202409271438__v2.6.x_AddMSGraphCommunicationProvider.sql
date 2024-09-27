--Add a record into the CommunicationProvider table for Microsoft Graph
INSERT INTO [${flyway:defaultSchema}].[CommunicationProvider]
           ([ID],
			[Name]
           ,[Description]
           ,[Status]
           ,[SupportsSending]
           ,[SupportsReceiving]
           ,[SupportsScheduledSending])
     VALUES
           (
		   '3EEE423E-F36B-1410-8874-005D02743E8C',
		   'Microsoft Graph',
           'Provider for Microsoft Graph',
           'Active',
           1,
           1,
           1)
GO
