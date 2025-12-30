
-- CORRECT Gemini Flash 3 to support effort levels
UPDATE ${flyway:defaultSchema}.AIModelVendor SET SupportsEffortLevel = 1 WHERE ID IN (
	'5B832E03-B2EB-4196-80A0-D90794400F04',
	'3E5C69EA-B6CE-4526-ADD5-A0FD95B5188A'
)