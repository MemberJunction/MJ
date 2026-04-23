
-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationRun" TO "cdp_Integration","cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationRun" TO "cdp_Integration","cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegration" TO "cdp_Integration","cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegration" TO "cdp_Integration","cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj."vwFlywayVersionHistoryParsed" TO "cdp_Integration","cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Other =====================

-- Grant permissions on Company Integration stored procedures and Flyway version history view
-- to cdp_Integration and cdp_Developer roles, enabling these roles to create/update
-- Company Integration and Company Integration Run records, and read Flyway migration history.
