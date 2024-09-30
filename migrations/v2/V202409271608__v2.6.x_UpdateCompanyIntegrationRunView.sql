UPDATE ${flyway:defaultSchema}.Entity
SET BaseViewGenerated = 0
WHERE ID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6'
GO

DROP VIEW IF EXISTS [${flyway:defaultSchema}].vwCompanyIntegrationRuns
GO
CREATE VIEW [${flyway:defaultSchema}].vwCompanyIntegrationRuns
AS
SELECT
    [cir].*,
	[i].Name Integration,
	[c].Name Company,
    [u].[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationRun] AS [cir]
INNER JOIN
	[${flyway:defaultSchema}].[CompanyIntegration] AS [ci]
  ON
	[cir].[CompanyIntegrationID] = [ci].[ID]
INNER JOIN 
	[${flyway:defaultSchema}].[Company] AS [c]
  ON
	[ci].CompanyID = [c].ID
INNER JOIN
    [${flyway:defaultSchema}].[User] AS [u]
  ON
    [cir].[RunByUserID] = [u].[ID]
INNER JOIN
	[${flyway:defaultSchema}].[Integration] AS [i]
  ON
	[ci].[IntegrationID] = [i].[ID]
GO