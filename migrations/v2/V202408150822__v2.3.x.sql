--In the Entities table, Set AllowCreateAPI to 1 for a few integration related Entities
UPDATE [${flyway:defaultSchema}].[Entity]
SET AllowCreateAPI = 1
WHERE ID IN (
--Company Integration Runs
'ED238F34-2837-EF11-86D4-6045BDEE16E6',
--Company Integration Run Details
'E6238F34-2837-EF11-86D4-6045BDEE16E6',
--Company Integration Run API Logs
'E5238F34-2837-EF11-86D4-6045BDEE16E6',
--Error Logs
'E7238F34-2837-EF11-86D4-6045BDEE16E6'
)
