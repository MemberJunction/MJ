---
"@memberjunction/actions-bizapps-accounting": patch
"@memberjunction/sql-converter": patch
---

ERP accounting verbs: a provider-agnostic dispatcher per verb (`CreateJournalEntry`, `GetChartOfAccounts`, `GetAccountBalances`, `GetDimensions`, `GetGLEntries`, `GetCustomers`, `GetSalesInvoices`) plus QBO/BC plugins keyed as `${verb}:${Integration.Name}`. Adds Business Central CreateJournalEntry and GetAccountBalances, dimensions for both ERPs, and shared journal-line validation. Historical vendor RegisterClass keys still resolve.

SQLConverter: CREATE TABLE CHECK `ISJSON(col) = 1` now becomes `(col) IS JSON` after identifier quoting, so PostgreSQL no longer sees `"ISJSON"(col) = 1`.
