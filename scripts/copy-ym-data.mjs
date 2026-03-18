#!/usr/bin/env node
/**
 * Copy YourMembership data from remote MRAA DB to local Test51 DB.
 * Remote tables are plural, local tables are singular.
 * Columns match exactly — only table names differ.
 */
import sql from "mssql";

const REMOTE_CONFIG = {
  server: "mraa-mraa--dev-sql.database.windows.net",
  database: "mraa-mraa_-dev-db",
  user: "mjadmin",
  password: "BlueCypress2026@MRAA",
  options: { encrypt: true, trustServerCertificate: false },
  requestTimeout: 120000,
  connectionTimeout: 30000,
};

const LOCAL_CONFIG = {
  server: "localhost",
  database: "Test51",
  user: "MJ_CodeGen",
  password: "BlueCypress2026@",
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 120000,
  connectionTimeout: 30000,
};

const SCHEMA = "YourMembership";

const TABLE_MAP = [
  ["Members", "Member"],
  ["Events", "Event"],
  ["Certifications", "Certification"],
  ["Countries", "Country"],
  ["DonationFunds", "DonationFund"],
  ["DuesTransactions", "DuesTransaction"],
  ["EventAttendeeTypes", "EventAttendeeType"],
  ["EventRegistrationForms", "EventRegistrationForm"],
  ["EventRegistrations", "EventRegistration"],
  ["EventTickets", "EventTicket"],
  ["GLCodes", "GLCode"],
  ["Groups", "Group"],
  ["GroupTypes", "GroupType"],
  ["InvoiceItems", "InvoiceItem"],
  ["Locations", "Location"],
  ["Memberships", "Membership"],
  ["PaymentProcessors", "PaymentProcessor"],
  ["ProductCategories", "ProductCategory"],
  ["SponsorRotators", "SponsorRotator"],
  ["TimeZones", "TimeZone"],
];

async function main() {
  console.log("Connecting to remote...");
  const remotePool = await sql.connect(REMOTE_CONFIG);

  console.log("Connecting to local...");
  const localPool = await new sql.ConnectionPool(LOCAL_CONFIG).connect();

  for (const [remoteTable, localTable] of TABLE_MAP) {
    console.log(`\n=== ${SCHEMA}.${remoteTable} -> ${SCHEMA}.${localTable} ===`);

    // Get columns (exclude __mj system columns)
    const colResult = await remotePool.request().query(`
      SELECT c.name
      FROM sys.columns c
      JOIN sys.tables t ON c.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = '${SCHEMA}' AND t.name = '${remoteTable}'
      AND c.name NOT LIKE '__mj%'
      ORDER BY c.column_id
    `);
    const columns = colResult.recordset.map((r) => r.name);

    if (columns.length === 0) {
      console.log("  SKIP — no columns");
      continue;
    }

    // Read all data from remote
    const colList = columns.map((c) => `[${c}]`).join(", ");
    const dataResult = await remotePool.request().query(
      `SELECT ${colList} FROM [${SCHEMA}].[${remoteTable}]`
    );
    const rows = dataResult.recordset;
    console.log(`  Read ${rows.length} rows from remote`);

    if (rows.length === 0) continue;

    // Clear local table
    await localPool.request().query(`DELETE FROM [${SCHEMA}].[${localTable}]`);

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const table = new sql.Table(`[${SCHEMA}].[${localTable}]`);
      table.create = false;

      // Define columns with types from the first row metadata
      for (const col of columns) {
        const sampleVal = rows.find((r) => r[col] != null)?.[col];
        if (sampleVal instanceof Date) {
          table.columns.add(col, sql.DateTimeOffset, { nullable: true });
        } else if (typeof sampleVal === "number" && Number.isInteger(sampleVal)) {
          table.columns.add(col, sql.Int, { nullable: true });
        } else if (typeof sampleVal === "number") {
          table.columns.add(col, sql.Decimal(18, 2), { nullable: true });
        } else if (typeof sampleVal === "boolean") {
          table.columns.add(col, sql.Bit, { nullable: true });
        } else {
          table.columns.add(col, sql.NVarChar(sql.MAX), { nullable: true });
        }
      }

      // Add rows
      for (const row of batch) {
        table.rows.add(...columns.map((c) => row[c] ?? null));
      }

      try {
        const bulkResult = await localPool.request().bulk(table);
        inserted += bulkResult.rowsAffected;
      } catch (err) {
        console.error(`  ERROR on batch starting at row ${i}: ${err.message}`);
        // Try row-by-row for this batch
        for (const row of batch) {
          try {
            const vals = columns.map((c) => {
              const v = row[c];
              if (v == null) return "NULL";
              if (v instanceof Date) return `'${v.toISOString()}'`;
              if (typeof v === "boolean") return v ? "1" : "0";
              if (typeof v === "number") return String(v);
              return `N'${String(v).replace(/'/g, "''")}'`;
            });
            await localPool.request().query(
              `INSERT INTO [${SCHEMA}].[${localTable}] (${colList}) VALUES (${vals.join(",")})`
            );
            inserted++;
          } catch (rowErr) {
            console.error(`  Row error: ${rowErr.message.substring(0, 100)}`);
          }
        }
      }
    }

    console.log(`  Inserted ${inserted} rows into local`);
  }

  await remotePool.close();
  await localPool.close();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
