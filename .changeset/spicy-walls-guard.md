---
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/codegen-lib": patch
---

Security hardening across the data layer: escape/validate composite-key values before SQL interpolation, enforce CanRead on subquery/ad-hoc query entity targets, SELECT-only validation on GetData, bracket-safe SQL Server identifier quoting, and JSON-safe codegen description emission.
