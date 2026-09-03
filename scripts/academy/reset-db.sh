#!/usr/bin/env bash
# MJ Academy — reset the course database to empty, ready for a fresh `mj migrate`.
#
# WHY YOU NEED THIS: each module branch carries its own migrations. Moving between modules
# means replaying them from zero, and Flyway will not re-run a migration it has already
# recorded. So you wipe, then migrate.
#
# WHAT IT DOES: drops and recreates the database, then recreates the two database users the
# setup guide had you make. It does NOT add the cdp_UI / cdp_Developer / cdp_Integration role
# memberships -- MJ's own baseline migration does that for you on the next `mj migrate`.
#
# USAGE:  ./scripts/academy/reset-db.sh            (reads DB_DATABASE from .env)
#         ./scripts/academy/reset-db.sh MyOtherDb
set -euo pipefail

CONTAINER="${MJ_SQL_CONTAINER:-mj-sqlserver}"
SA_PASSWORD="${MJ_SA_PASSWORD:-YourStrong@Password1}"
SQLCMD=/opt/mssql-tools18/bin/sqlcmd

DB="${1:-$(grep -E '^DB_DATABASE=' .env | cut -d= -f2- | tr -d "\"'" )}"
APP_USER="$(grep -E '^DB_USERNAME=' .env | cut -d= -f2- | tr -d "\"'" )"
CG_USER="$(grep -E '^CODEGEN_DB_USERNAME=' .env | cut -d= -f2- | tr -d "\"'" )"

if [ -z "$DB" ]; then echo "Could not determine DB_DATABASE from .env" >&2; exit 1; fi

echo "Resetting database '$DB' in container '$CONTAINER' (users: $CG_USER, $APP_USER)"
read -r -p "This DESTROYS all data in '$DB'. Type the database name to confirm: " CONFIRM
if [ "$CONFIRM" != "$DB" ]; then echo "Aborted."; exit 1; fi

# Drop + recreate. Separate batch from the USE below: SQL Server resolves USE at compile
# time, so a combined batch fails with "database does not exist" on a fresh create.
docker exec -i "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASSWORD" -C -b -Q "
SET NOCOUNT ON;
USE master;
IF DB_ID('$DB') IS NOT NULL
BEGIN
    ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$DB];
END
CREATE DATABASE [$DB];"

docker exec -i "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASSWORD" -d "$DB" -C -b -Q "
SET NOCOUNT ON;
CREATE USER [$CG_USER] FOR LOGIN [$CG_USER];
ALTER ROLE db_owner ADD MEMBER [$CG_USER];
CREATE USER [$APP_USER] FOR LOGIN [$APP_USER];
ALTER ROLE db_datareader ADD MEMBER [$APP_USER];
ALTER ROLE db_datawriter ADD MEMBER [$APP_USER];"

echo
echo "'$DB' is empty with users restored. Next:"
echo "  node packages/MJCLI/bin/run.js migrate --dir ./migrations"
echo "  pnpm run build      # required after a branch switch or a codegen run"
