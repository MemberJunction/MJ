--In the Entities table, Set AllowCreateAPI to 1 for a few integration related Entities
UPDATE __mj.Entity
SET AllowCreateAPI = 1
WHERE ID IN (
	Select ID from __mj.vwEntities
	WHERE Name = 'Company Integration Runs'
	OR Name = 'Company Integration Run Details'
	OR Name = 'Company Integration Run API Logs'
	OR Name = 'Error Logs'
	)