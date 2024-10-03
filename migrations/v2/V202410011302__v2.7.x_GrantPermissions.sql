-- Migration V202409271608__v2.6.x_UpdateCompanyIntegrationRunView
-- Re/created the view, so here we're adding back in permissions 
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
