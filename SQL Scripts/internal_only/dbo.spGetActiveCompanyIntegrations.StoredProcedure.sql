/****** Object:  StoredProcedure [dbo].[spGetActiveCompanyIntegrations]    Script Date: 2/8/2023 9:52:07 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO




CREATE PROCEDURE [dbo].[spGetActiveCompanyIntegrations] 
    @IntegrationName NVARCHAR(255) = NULL,
	@CompanyIntegrationID INT = NULL,
	@IntegrationID INT = NULL,
	@CompanyID INT = NULL,
	@CompanyName NVARCHAR(255) = NULL

AS

SELECT 
	ci.ID,
	ci.CompanyID,
	c.Name 'CompanyName',
	ci.IntegrationID,
	i.Name 'IntegrationName',
	ci.ExternalSystemID,
	ci.AccessToken,
	ci.RefreshToken,
	ci.TokenExpirationDate,
	ci.APIKey,
	i.NavigationBaseURL,
	i.ClassName 'DriverClassName',
	i.ImportPath 'DriverImportPath',
	r.ID 'LastRunID',
	r.StartedAt 'LastRunStartedAt',
	r.EndedAt 'LastRunEndedAt'

FROM 
	admin.CompanyIntegration ci
JOIN admin.Integration i
	ON i.ID = ci.IntegrationID
JOIN admin.Company c
	ON c.ID = ci.CompanyID
LEFT JOIN dbo.vwCompanyIntegrationRunsRanked r
	ON r.CompanyIntegrationID = ci.ID AND r.RunOrder = 1
WHERE
	((i.Name = @IntegrationName) OR (@IntegrationName IS NULL))
	AND
	((ci.ID = @CompanyIntegrationID) OR (@CompanyIntegrationID IS NULL))
	AND
	((ci.CompanyID = @CompanyID) OR (@CompanyID IS NULL))
	AND
	((c.Name = @CompanyName) OR (@CompanyName IS NULL))
	AND
	((i.ID = @IntegrationID) OR (@IntegrationID IS NULL))
	AND 
	(ci.IsActive = 1)
ORDER BY 
	ci.ID
GO


