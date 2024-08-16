--In the Entities table, Set AllowCreateAPI to 1 for a few integration related Entities
UPDATE ${flyway:defaultSchema}.Entity
SET AllowCreateAPI = 1
WHERE ID IN (
	Select ID from ${flyway:defaultSchema}.vwEntities
	WHERE Name = 'Company Integration Runs'
	OR Name = 'Company Integration Run Details'
	OR Name = 'Company Integration Run API Logs'
	OR Name = 'Error Logs'
	)
