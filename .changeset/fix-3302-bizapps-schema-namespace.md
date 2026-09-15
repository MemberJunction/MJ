---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

Fix `mj app install` rejecting every first-party BizApp schema (#3302). The installer blocked any schema name starting with `__`, but MJ's own app convention is `__mj_<AppName>` — so installing `bizapps-common`, `-forms`, `-tasks`, `-caliber` or `-ats` required the hidden `--dangerously-ignore-dbl-underscore-schema-rule` flag. `__mj_<AppName>` is now the documented app namespace and installs with no flag; `__mj_UDT` joins the reserved set (MJ core owns it as the user-defined-table sandbox); reserved-name matching is now case-insensitive; and the schema name is validated before an app can adopt an already-existing schema, which previously bypassed the guard entirely.
