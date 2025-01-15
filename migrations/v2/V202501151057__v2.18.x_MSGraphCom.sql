-- Add a record into the CommunicationProviderMessageType table
-- for the MS Graph Communication Provider
INSERT INTO [${flyway:defaultSchema}].[CommunicationProviderMessageType]
(
	ID,
	CommunicationProviderID,
	CommunicationBaseMessageTypeID,
	Name,
	Status,
	AdditionalAttributes
)
VALUES
(
	'2731433E-F36B-1410-8621-0059503D2EDD',
	'3EEE423E-F36B-1410-8874-005D02743E8C',
	'F9A5CCEC-6A37-EF11-86D4-000D3A4E707E',
	'Email',
	'Active',
	'{"field":"val"}'
);
