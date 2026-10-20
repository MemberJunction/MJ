---
"@memberjunction/actions-bizapps-accounting": minor
---

The seven accounting verbs now have `MJ: Actions` rows, so `ActionEngine.GetActionByName('CreateJournalEntry')` and the other verb names find an action to run. The verb classes were registered (`@RegisterClass(BaseAction, 'GetGLEntries')` and so on), but no action row pointed at them, so a caller that looks a verb up by name got nothing and could not reach the ERP.

- **New rows** in `metadata/actions/.bizapps-accounting-verbs.json`, category Business Apps > Accounting: `CreateJournalEntry`, `GetAccountBalances`, `GetChartOfAccounts`, `GetCustomers`, `GetDimensions`, `GetGLEntries`, `GetSalesInvoices`. Each `Name` and `DriverClass` is the verb's `ACCOUNTING_VERBS` key, which is the class's `RegisterClass` key. `Type` is `Custom`, `Status` is `Active`.
- **Params.** Each row declares the dispatcher's own inputs: `CompanyID` (required), `CompanyIntegrationID` and `IntegrationName`. The engine does not filter undeclared params, so the plugin-specific inputs (`EntryDate`, `Lines`, `StartDate`, `MaxResults`, ...) and the plugin's outputs still pass through unchanged.
- The existing provider rows (`QuickBooks - ...`, `Business Central - ...`) are unchanged.
