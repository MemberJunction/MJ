#!/bin/bash
# Copy YourMembership data from remote MRAA DB to local Test51 DB
# Uses sqlcmd to generate INSERT statements from remote and execute locally

REMOTE_SERVER="mraa-mraa--dev-sql.database.windows.net"
REMOTE_DB="mraa-mraa_-dev-db"
REMOTE_USER="mjadmin"
REMOTE_PASS="BlueCypress2026@MRAA"

LOCAL_SERVER="localhost"
LOCAL_DB="Test51"
LOCAL_USER="MJ_CodeGen"
LOCAL_PASS="BlueCypress2026@"

SCHEMA="YourMembership"

TABLES=(
  "Members:Member"
  "Events:Event"
  "Certifications:Certification"
  "Countries:Country"
  "DonationFunds:DonationFund"
  "DuesTransactions:DuesTransaction"
  "EventAttendeeTypes:EventAttendeeType"
  "EventRegistrationForms:EventRegistrationForm"
  "EventRegistrations:EventRegistration"
  "EventTickets:EventTicket"
  "GLCodes:GLCode"
  "Groups:[Group]"
  "GroupTypes:GroupType"
  "InvoiceItems:InvoiceItem"
  "Locations:Location"
  "Memberships:Membership"
  "PaymentProcessors:PaymentProcessor"
  "ProductCategories:ProductCategory"
  "SponsorRotators:SponsorRotator"
  "TimeZones:TimeZone"
)

for mapping in "${TABLES[@]}"; do
  REMOTE_TABLE="${mapping%%:*}"
  LOCAL_TABLE="${mapping##*:}"
  LOCAL_TABLE_CLEAN="${LOCAL_TABLE//\[/}"
  LOCAL_TABLE_CLEAN="${LOCAL_TABLE_CLEAN//\]/}"

  echo "=== $SCHEMA.$REMOTE_TABLE -> $SCHEMA.$LOCAL_TABLE_CLEAN ==="

  # Get columns (excluding __mj system columns)
  COLUMNS=$(sqlcmd -S "$REMOTE_SERVER" -d "$REMOTE_DB" -U "$REMOTE_USER" -P "$REMOTE_PASS" -N -C -h -1 -W -Q "
    SET NOCOUNT ON;
    SELECT STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY c.column_id)
    FROM sys.columns c
    JOIN sys.tables t ON c.object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '$SCHEMA' AND t.name = '$REMOTE_TABLE'
    AND c.name NOT LIKE '__mj%';
  " 2>/dev/null | head -1 | tr -d '\r')

  if [ -z "$COLUMNS" ]; then
    echo "  SKIP — no columns"
    continue
  fi

  # Build bracketed column list for INSERT
  BRACKETED_COLS=$(echo "$COLUMNS" | sed 's/,/],[/g; s/^/[/; s/$/]/')

  # Clear local table
  sqlcmd -S "$LOCAL_SERVER" -d "$LOCAL_DB" -U "$LOCAL_USER" -P "$LOCAL_PASS" -N -C -Q "
    DELETE FROM [$SCHEMA].[$LOCAL_TABLE_CLEAN];
  " 2>/dev/null

  # Generate INSERT SQL from remote data and pipe to local
  # Use FOR XML PATH to build INSERT VALUES on the server side
  TMPFILE="/tmp/ym_inserts_${REMOTE_TABLE}.sql"

  sqlcmd -S "$REMOTE_SERVER" -d "$REMOTE_DB" -U "$REMOTE_USER" -P "$REMOTE_PASS" -N -C -h -1 -W -y0 -Q "
    SET NOCOUNT ON;
    DECLARE @sql NVARCHAR(MAX) = '';
    DECLARE @cols NVARCHAR(MAX) = '$COLUMNS';

    SELECT 'INSERT INTO [$SCHEMA].[$LOCAL_TABLE_CLEAN] ($BRACKETED_COLS) SELECT ' +
      $(
        # Build the column select expressions
        IFS=',' read -ra COLS <<< "$COLUMNS"
        FIRST=1
        for col in "${COLS[@]}"; do
          if [ $FIRST -eq 1 ]; then
            FIRST=0
          else
            printf "'+' + "
          fi
          printf "'CASE WHEN [%s] IS NULL THEN ''NULL'' ELSE '''''''' + REPLACE(CAST([%s] AS NVARCHAR(MAX)), '''''''', '''''''''''') + '''''''' END' + " "$col" "$col"
        done
        printf "';'"
      )
    FROM [$SCHEMA].[$REMOTE_TABLE];
  " 2>/dev/null > "$TMPFILE"

  # That approach is too complex. Use simpler: export as tab-delimited, then bulk insert via sqlcmd
  # Let's use a different approach: generate a SQL file with INSERT...SELECT from OPENROWSET

  # Simplest approach: use sqlcmd to pipe data
  echo "SET NOCOUNT ON;" > "$TMPFILE"

  sqlcmd -S "$REMOTE_SERVER" -d "$REMOTE_DB" -U "$REMOTE_USER" -P "$REMOTE_PASS" -N -C -h -1 -W -y0 -Q "
    SET NOCOUNT ON;
    SELECT 'INSERT INTO [$SCHEMA].[$LOCAL_TABLE_CLEAN] ($BRACKETED_COLS) VALUES (' +
    $(
      IFS=',' read -ra COLS <<< "$COLUMNS"
      FIRST=1
      for col in "${COLS[@]}"; do
        if [ $FIRST -eq 1 ]; then
          FIRST=0
        else
          printf " + ',' + "
        fi
        printf "CASE WHEN [$col] IS NULL THEN 'NULL' ELSE '''' + REPLACE(CAST([$col] AS NVARCHAR(MAX)), '''', '''''') + '''' END"
      done
    ) + ');'
    FROM [$SCHEMA].[$REMOTE_TABLE];
  " 2>/dev/null >> "$TMPFILE"

  ROWCOUNT=$(grep -c "^INSERT" "$TMPFILE" 2>/dev/null || echo 0)
  echo "  Generated $ROWCOUNT INSERT statements"

  if [ "$ROWCOUNT" -gt 0 ]; then
    sqlcmd -S "$LOCAL_SERVER" -d "$LOCAL_DB" -U "$LOCAL_USER" -P "$LOCAL_PASS" -N -C -i "$TMPFILE" 2>&1 | tail -3
  fi

  rm -f "$TMPFILE"
  echo ""
done

echo "Done!"
