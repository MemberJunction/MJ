ALTER TABLE [${flyway:defaultSchema}].CommunicationProvider
ADD SupportsScheduledSending BIT DEFAULT 0 NOT NULL
GO

ALTER TABLE [${flyway:defaultSchema}].CommunicationProvider ADD
CONSTRAINT CK_SupportsScheduledSending    
CHECK (SupportsScheduledSending <= SupportsSending); 
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', @value = 'Whether or not the provider supports sending messages at a specific time',
    @level0type = N'Schema',   @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',    @level1name = 'CommunicationProvider',
    @level2type = N'Column',   @level2name = 'SupportsScheduledSending';
GO

--Mark SendGrid as supporting scheduled sends
UPDATE [${flyway:defaultSchema}].[CommunicationProvider]
SET SupportsScheduledSending = 1
WHERE ID = 'FCA5CCEC-6A37-EF11-86D4-000D3A4E707E'
GO
