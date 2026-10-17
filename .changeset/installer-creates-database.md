---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

`mj install` now sets up the database itself instead of leaving `mj-db-setup.sql` for the user to run by hand. The database phase signs in as the CodeGen and API logins; when they can't sign in yet, it runs the setup script with an administrator login (asked for interactively, or `MJ_INSTALL_DB_ADMIN_USER` / `MJ_INSTALL_DB_ADMIN_PASSWORD` / `DatabaseAdminUser` / `DatabaseAdminPassword`), then signs in as both logins again to confirm. The administrator login is never saved. Interactive installs can still choose to run the script themselves. `--yes` installs with no administrator login and no database now stop with instructions instead of continuing to a failing migrate. Names and passwords in the generated scripts are now properly quoted. Long database commands (`install`, `app install`, `app upgrade`, `migrate`) also start with a warning not to let the machine sleep until they finish.
