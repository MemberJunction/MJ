---
"@memberjunction/sqlserver-dataprovider": patch
---

**SQLServerDataProvider Changes:**

- SQLServerTransactionGroup now immediately rolls back and stops processing on first operation failure
- Enhanced error handling to prevent double rollback attempts
- Improved error messages to clearly indicate when transactions are rolled back
