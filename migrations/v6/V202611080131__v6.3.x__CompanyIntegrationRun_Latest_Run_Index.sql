-- #4825 — reading MJ: Company Integrations must not wait on a running sync.
--
-- vwCompanyIntegrations found each connection's latest run with a correlated TOP 1 ... ORDER BY StartedAt DESC over
-- CompanyIntegrationRun. The only index on that table was the foreign-key index on CompanyIntegrationID, so the
-- optimizer scanned the run table and waited on any run row a sync held locked: loading an unrelated connection timed
-- out while syncs ran. A covering index on (CompanyIntegrationID, StartedAt DESC) lets the lookup seek straight to one
-- connection's newest run, and OUTER APPLY reads exactly that row. The output columns are unchanged.

CREATE NONCLUSTERED INDEX IX_CompanyIntegrationRun_CompanyIntegrationID_StartedAt
    ON ${flyway:defaultSchema}.CompanyIntegrationRun (CompanyIntegrationID, StartedAt DESC)
    INCLUDE (EndedAt);
GO

CREATE OR ALTER VIEW ${flyway:defaultSchema}.vwCompanyIntegrations
AS
SELECT
  ci.*,
  c.Name Company,
  i.Name Integration,
  i.ClassName DriverClassName,
  i.ImportPath DriverImportPath,
  cir.ID LastRunID,
  cir.StartedAt LastRunStartedAt,
  cir.EndedAt LastRunEndedAt
FROM
  ${flyway:defaultSchema}.CompanyIntegration ci
INNER JOIN
  ${flyway:defaultSchema}.Company c ON ci.CompanyID = c.ID
INNER JOIN
  ${flyway:defaultSchema}.Integration i ON ci.IntegrationID = i.ID
OUTER APPLY (
  SELECT TOP 1 cirInner.ID, cirInner.StartedAt, cirInner.EndedAt
  FROM ${flyway:defaultSchema}.CompanyIntegrationRun cirInner
  WHERE cirInner.CompanyIntegrationID = ci.ID
  ORDER BY cirInner.StartedAt DESC
) cir
GO
