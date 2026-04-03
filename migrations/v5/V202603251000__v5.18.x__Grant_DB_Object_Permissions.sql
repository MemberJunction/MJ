-- Grant permissions on Company Integration stored procedures and Flyway version history view
-- to cdp_Integration and cdp_Developer roles, enabling these roles to create/update
-- Company Integration and Company Integration Run records, and read Flyway migration history.

GRANT EXECUTE ON ${flyway:defaultSchema}.spCreateCompanyIntegrationRun TO [cdp_Integration],[cdp_Developer];
GRANT EXECUTE ON ${flyway:defaultSchema}.spUpdateCompanyIntegrationRun TO [cdp_Integration],[cdp_Developer];
GRANT EXECUTE ON ${flyway:defaultSchema}.spCreateCompanyIntegration TO [cdp_Integration],[cdp_Developer];
GRANT EXECUTE ON ${flyway:defaultSchema}.spUpdateCompanyIntegration TO [cdp_Integration],[cdp_Developer];

GRANT SELECT ON ${flyway:defaultSchema}.vwFlywayVersionHistoryParsed TO [cdp_Integration],[cdp_Developer];
