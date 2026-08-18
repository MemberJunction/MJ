---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/ai-mcp-server": patch
---

security: validate and escape user-supplied values in SQL text-building paths, pin JWT algorithms, and compare the system API key in constant time

Two upstream security commits landed without changesets; this records them for the release notes. All changes are additive/defensive and preserve existing behavior for legitimate inputs.

**SQL filter validation (`@memberjunction/global`, `@memberjunction/core`, `@memberjunction/generic-database-provider`).**

- `RunView`'s `ExcludeUserViewRunID` — a GraphQL string input — was interpolated raw into the view `WHERE` clause with no validation, unlike every sibling clause (`ExtraFilter`, `UserSearchString`, `OverrideExcludeFilter` all pass through `ValidateUserProvidedSQLClause`). The value is only ever a `UserViewRun` GUID, so it is now rejected unless it is a well-formed GUID, closing an authenticated injection sink that bypassed entity permissions and row-level security.
- `DatabaseProviderBase.ValidateUserProvidedSQLClause` now denies `WAITFOR`, the time-based blind-injection vector. No legitimate filter or order-by clause uses it, and the intended subquery capability of `ExtraFilter` is unaffected.
- `SQLExpressionValidator` now denies references to database system catalogs and metadata objects (`sys.*`, `INFORMATION_SCHEMA`, `syslogins`, `pg_catalog.*`, `pg_authid`/`pg_shadow`/`pg_user`/`pg_roles`) in **all** validation contexts, including `full_query`. These objects sit outside MemberJunction's entity-permission model, so permitting them turned a validated `SELECT` into a schema-enumeration and credential-exfiltration primitive. String literals are stripped before the check runs, so a literal value such as `'sys.x'` is still allowed.

**Value escaping and parameterization (`@memberjunction/server`, `@memberjunction/core`, `@memberjunction/generic-database-provider`).**

- `ReportResolver.CreateReportFromConversationDetailID` now binds `ConversationDetailID` through a parameterized `mssql` request as a `UniqueIdentifier` instead of interpolating it into the query string.
- `GenericDatabaseProvider.CheckRecordRLS` now escapes embedded single quotes in primary-key values before building its `WHERE` clause, mirroring the escaping already present in the `Load()` path.
- `RowLevelSecurityFilterInfo.MarkupFilterText` now escapes embedded single quotes in substituted user-property values, and treats `undefined` the same as `null`/object — leaving the token unresolved instead of substituting the literal string `"undefined"`.

**Authentication hardening (`@memberjunction/server`, `@memberjunction/ai-mcp-server`).**

- The superadmin `MJ_API_KEY` comparison in `getUserPayload` was a plain `===`, which short-circuits on the first differing byte and leaks a timing side channel. Both sides are now hashed to fixed-length SHA-256 digests and compared with `timingSafeEqual`.
- JWT verification now explicitly pins the accepted signature algorithms to the asymmetric family (`RS256`/`RS384`/`RS512`, `ES256`/`ES384`/`ES512`, `PS256`) on both MJServer's issuer path and MCPServer's JWKS path — defense in depth against `alg=none` and RS256-to-HS256 confusion.

Regression suites in each affected package pin the new behavior.
