---
"@memberjunction/actions-bizapps-accounting": minor
---

Adds an Action row for each of the seven accounting verbs (`CreateJournalEntry`, `GetChartOfAccounts`, `GetAccountBalances`, `GetDimensions`, `GetGLEntries`, `GetCustomers`, `GetSalesInvoices`) to `metadata/actions/.bizapps-actions.json`, so `ActionEngineServer.GetActionByName(verb)` finds them (#5019). Each row has `Name` and `DriverClass` equal to the verb, sits in the `Accounting` category, and declares `CompanyID`, `CompanyIntegrationID`, `IntegrationName`, the inputs and outputs of the Business Central and QuickBooks Online plugins it dispatches to, and the dispatcher's result codes. The release's metadata migration carries the rows to installs.
