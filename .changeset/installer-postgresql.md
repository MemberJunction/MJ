---
"@memberjunction/installer": patch
---

`mj install` now installs MemberJunction on PostgreSQL (`MJ_INSTALL_DB_PLATFORM=postgresql`, or pick it at the first prompt). As on SQL Server, the database phase sets everything up itself when given an administrator login: it creates the database, the CodeGen and API login roles (no `CREATEDB` / `CREATEROLE`), MJ's `cdp_*` group roles, the `pgcrypto` / `uuid-ossp` extensions, the `__mj` schema owned by the CodeGen role, and the API role's grants and default privileges. The statements run one at a time through the `pg` driver and are also written to `mj-db-setup.sql` as a `psql` script. `.env` gets `DB_PLATFORM='postgresql'` with the usual `DB_*` and `CODEGEN_DB_*` keys, keeping the CodeGen and API logins separate. SQL Server installs are unchanged.
