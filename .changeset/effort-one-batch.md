---
'@memberjunction/ng-dashboards': patch
'@memberjunction/ng-conversations': patch
'@memberjunction/codegen-lib': patch
'@memberjunction/server': patch
'@memberjunction/storage': patch
'@memberjunction/metadata-sync': patch
'@memberjunction/sql-converter': patch
---

Ten small fixes:

- Vector indexing treats field names with `pin`, `otp`, `passcode` or `biometric` as sensitive (#5670).
- `DropboxFileStorage.ListObjects` no longer makes an extra account call or logs the account email on every listing (#4440).
- The folder dialog's "Everyone" hint says a shared folder can't be made private again (#4817), and a stray indent is fixed (#4818).
- The entity save inconsistency warning is saved to the error log with a code that fits the column, and a failed save logs why (#6024).
- The SQL converter's jsonb guard compares an unquoted schema name in lower case, matching how PostgreSQL stores it (#5864).
- CodeGen's built-in feature defaults enable form-layout generation under the name the code checks (#5827), and the validator count no longer counts duplicates (#4376).
- `mj sync push` honors `sqlLogging.variableBatchThreshold`, default 200, as watch already did (#5556).
