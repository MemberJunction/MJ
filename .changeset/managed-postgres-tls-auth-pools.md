---
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ai-vectors-pgvector": patch
---

PostgreSQL on managed hosts: one TLS setting for every client, token logins, and one API pool instead of two.

- **TLS.** MJAPI's pools, the PostgreSQL provider, CodeGen, `mj migrate` (and its connection check), MetadataSync and the pgvector provider all take TLS from one resolver, `BuildPgSslConfig`. It reads `PG_SSL_MODE` (`disable` | `require` | `verify-ca` | `verify-full`), `PG_SSL_CA_FILE` and `PG_SSL_SERVERNAME`; MJAPI also reads `databaseSettings.postgres.ssl` in `mj.config.cjs`. **Behavior change:** with no setting, a host on this machine or a bare service name (`localhost`, `postgres`, `db`) uses plain TCP and any other host uses `verify-full`. Before, MJAPI's own pools never used TLS and CodeGen never did; a remote server without TLS now needs `PG_SSL_MODE=disable`. `PG_VECTOR_SSL=true` now verifies the server certificate (it used to skip the check); `PG_SSL_MODE=require` restores the old behavior.
- **Token logins.** `PG_AUTH_MODE` (or `databaseSettings.postgres.authMode`) selects a `BasePgCredentialProvider` registered under that key, which supplies a token for each new connection. Token modes require a verified TLS connection. `PGConnectionConfig.PasswordSource` carries the callback.
- **Connections.** MJAPI and MetadataSync configure the PostgreSQL provider on the pool they already opened (`ConfigWithSharedPool`) instead of letting it open a second one, which removes up to `connectionPool.max` connections per MJAPI. At startup MJAPI warns when its pools could open more than 80% of the server's usable `max_connections`; `connectionPool.expectedInstances` multiplies the estimate for a fleet.
- `mj migrate`'s connection check explains a PostgreSQL certificate it cannot verify (point `PG_SSL_CA_FILE` at the CA) and a server that only accepts TLS.
