---
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": minor
"@memberjunction/integration-actions": minor
"@memberjunction/codegen-lib": minor
---

feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh

- Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration)
- Add Integration Sync scheduled job type metadata
- Pass contextUser through HubSpot credential loading for proper server-side data isolation
- Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
- CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
- BaseIntegrationPointAction scaffold for future write-back actions
