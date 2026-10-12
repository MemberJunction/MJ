---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

Add PostgreSQL support to the MemberJunction installer. Users can now select between SQL Server and PostgreSQL during installation. The installer generates platform-appropriate setup and validation scripts, configures correct environment variables (PG_* for PostgreSQL, DB_* for SQL Server), and sets the `dbPlatform` field in `mj.config.cjs`.

New features:
- Platform selection during configure phase (SQL Server is default)
- Platform-appropriate default ports (5432 for PostgreSQL, 1433 for SQL Server)
- PostgreSQL setup script generation with role/schema/permission management
- Correct environment variable naming per platform for CodeGen and MJAPI
- PostgreSQL adapter with connectivity checking and script execution
- Updated documentation with PostgreSQL-specific setup instructions
