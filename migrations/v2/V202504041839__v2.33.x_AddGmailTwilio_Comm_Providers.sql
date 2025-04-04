
-- Add Gmail provider
INSERT INTO [${flyway:defaultSchema}].[CommunicationProvider]
       ( 
        ID,
       [Name],
       [Description],
       [Status],
       [SupportsSending],
       [SupportsReceiving],
       [SupportsScheduledSending],
       SupportsForwarding, 
       SupportsReplying,
       ${flyway:defaultSchema}_CreatedAt,
       ${flyway:defaultSchema}_UpdatedAt
		)
 VALUES
       ( 
       'E3B9433E-F36B-1410-8DA0-00021F8B792E',
        'Gmail',
        'Provider for Gmail/Google Suite',
        'Active',
        1,
        1,
        0,
        1,
       1,
       '2025-04-04 23:44:01.5266667 +00:00',
       '2025-04-04 23:44:01.5266667 +00:00'
       ) 

-- Add Twilio provider
INSERT INTO [${flyway:defaultSchema}].[CommunicationProvider]
       ( 
       ID,
       [Name],
       [Description],
       [Status],
       [SupportsSending],
       [SupportsReceiving],
       [SupportsScheduledSending],
       SupportsForwarding, 
       SupportsReplying,
       ${flyway:defaultSchema}_CreatedAt,
       ${flyway:defaultSchema}_UpdatedAt
		)
 VALUES
       (
        'E7B9433E-F36B-1410-8DA0-00021F8B792E',
       'Twilio',
        'Provider for SMS, WhatsApp, and Facebook Messenger via Twilio',
        'Active',
        1,
        1,
        0,
        1,
       1,
       '2025-04-04 23:44:01.5300000 +00:00',
       '2025-04-04 23:44:01.5300000 +00:00'
       )
