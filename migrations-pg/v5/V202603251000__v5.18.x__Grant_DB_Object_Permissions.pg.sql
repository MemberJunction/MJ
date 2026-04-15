
-- ===================== Grants =====================

-- SKIPPED (function not created): GRANT EXECUTE ON __mj.spCreateCompanyIntegrationRun TO "cdp_Integration","cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj.spUpdateCompanyIntegrationRun TO "cdp_Integration","cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj.spCreateCompanyIntegration TO "cdp_Integration","cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj.spUpdateCompanyIntegration TO "cdp_Integration","cdp_Developer";

-- SKIPPED (view not created): GRANT SELECT ON __mj.vwFlywayVersionHistoryParsed TO "cdp_Integration","cdp_Developer";


-- ===================== Other =====================

-- Grant permissions on Company Integration stored procedures and Flyway version history view
-- to cdp_Integration and cdp_Developer roles, enabling these roles to create/update
-- Company Integration and Company Integration Run records, and read Flyway migration history.
