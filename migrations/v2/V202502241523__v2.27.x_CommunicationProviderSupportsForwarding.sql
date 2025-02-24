ALTER TABLE __mj.CommunicationProvider
ADD SupportsForwarding bit NOT NULL DEFAULT 0
GO 

UPDATE __mj.CommunicationProvider
SET SupportsForwarding = 1
WHERE ID = '3EEE423E-F36B-1410-8874-005D02743E8C'

EXEC sys.sp_addextendedproperty 
@name=N'MS_Description', 
@value=N'Whether or not the provider supports forwarding messages to another client' , 
@level0type=N'SCHEMA',
@level0name=N'__mj', 
@level1type=N'TABLE',
@level1name=N'CommunicationProvider', 
@level2type=N'COLUMN',
@level2name=N'SupportsForwarding'