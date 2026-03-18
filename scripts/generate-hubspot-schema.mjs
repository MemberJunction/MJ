#!/usr/bin/env node
/**
 * Calls SchemaBuilder directly (no API, no auth) to generate:
 *   1. Migration SQL for HubSpot base tables (frozen migration — only written if missing)
 *   2. Migration SQL for HubSpot association tables (separate migration file)
 *   3. Updated additionalSchemaInfo.json with soft PK/FK entries for all tables
 *
 * Association tables model HubSpot's many-to-many relationships between CRM
 * objects and activities (e.g., Contact ↔ Deal, Company ↔ Call). These are
 * junction tables with composite PKs and soft FKs to both sides.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const { SchemaBuilder } = require(resolve(ROOT, "packages/Integration/schema-builder/dist/SchemaBuilder.js"));
const { TypeMapper } = require(resolve(ROOT, "packages/Integration/schema-builder/dist/TypeMapper.js"));

// Base tables migration — FROZEN once run. Only regenerated if file doesn't exist.
const BASE_MIGRATION_PATH = resolve(ROOT, "migrations/v5/V202603170200__v5.12.x__HubSpot_CreateTables.sql");
// Association tables — separate migration file
const ASSOC_MIGRATION_PATH = resolve(ROOT, "migrations/v5/V202603171600__v5.12.x__HubSpot_AssociationTables.sql");
const ADDITIONAL_SCHEMA_PATH = resolve(ROOT, "metadata/integrations/additionalSchemaInfo.json");
const SCHEMA = "HubSpot";
const PLATFORM = "sqlserver";

const singularMap = {
  // Base CRM objects
  contacts: "Contact",
  companies: "Company",
  deals: "Deal",
  tickets: "Ticket",
  products: "Product",
  line_items: "LineItem",
  quotes: "Quote",
  calls: "Call",
  emails: "Email",
  notes: "Note",
  tasks: "Task",
  meetings: "Meeting",
  feedback_submissions: "FeedbackSubmission",
  // CRM-to-CRM associations
  assoc_contacts_companies: "ContactCompany",
  assoc_contacts_deals: "ContactDeal",
  assoc_contacts_tickets: "ContactTicket",
  assoc_companies_deals: "CompanyDeal",
  assoc_companies_tickets: "CompanyTicket",
  assoc_deals_line_items: "DealLineItem",
  assoc_deals_quotes: "DealQuote",
  assoc_quotes_contacts: "QuoteContact",
  assoc_quotes_line_items: "QuoteLineItem",
  // Contact activity associations
  assoc_contacts_calls: "ContactCall",
  assoc_contacts_emails: "ContactEmail",
  assoc_contacts_notes: "ContactNote",
  assoc_contacts_tasks: "ContactTask",
  assoc_contacts_meetings: "ContactMeeting",
  // Company activity associations
  assoc_companies_calls: "CompanyCall",
  assoc_companies_emails: "CompanyEmail",
  assoc_companies_notes: "CompanyNote",
  assoc_companies_tasks: "CompanyTask",
  assoc_companies_meetings: "CompanyMeeting",
  // Deal activity associations
  assoc_deals_calls: "DealCall",
  assoc_deals_emails: "DealEmail",
  assoc_deals_notes: "DealNote",
  assoc_deals_tasks: "DealTask",
  assoc_deals_meetings: "DealMeeting",
  // Ticket activity associations
  assoc_tickets_calls: "TicketCall",
  assoc_tickets_emails: "TicketEmail",
  assoc_tickets_notes: "TicketNote",
  assoc_tickets_tasks: "TicketTask",
  assoc_tickets_meetings: "TicketMeeting",
  // Feedback associations
  assoc_contacts_feedback_submissions: "ContactFeedbackSubmission",
  assoc_tickets_feedback_submissions: "TicketFeedbackSubmission",
};

function mapFieldType(field) {
  const t = (field.Type || "nvarchar").toLowerCase();
  if (t === "int" || t === "integer") return "integer";
  if (t === "bigint") return "bigint";
  if (t === "float" || t === "double" || t === "decimal" || t === "number") return "decimal";
  if (t === "bit" || t === "boolean" || t === "bool") return "boolean";
  if (t === "datetime" || t === "datetimeoffset" || t === "date") return "datetime";
  return "string";
}

/** Returns true if this integration object is an association (many-to-many). */
function isAssociationObject(name) {
  return name.startsWith("assoc_");
}

/**
 * For association objects, extract left/right API object names from the Name.
 * E.g., "assoc_contacts_deals" → ["contacts", "deals"]
 */
function parseAssociationName(name) {
  const parts = name.replace("assoc_", "").split("_");
  // Handle multi-word names like "line_items", "feedback_submissions"
  // We match greedily against known singularMap keys
  const knownObjects = Object.keys(singularMap).filter((k) => !k.startsWith("assoc_"));
  for (let i = 1; i < parts.length; i++) {
    const left = parts.slice(0, i).join("_");
    const right = parts.slice(i).join("_");
    if (knownObjects.includes(left) && knownObjects.includes(right)) {
      return [left, right];
    }
  }
  return null;
}

// ─── Read metadata and build configs ─────────────────────────────────

const metadata = JSON.parse(readFileSync(resolve(ROOT, "metadata/integrations/.hubspot.json"), "utf8"));
const integrationObjects = metadata[0].relatedEntities["MJ: Integration Objects"];

const baseSourceObjects = [];
const baseTargetConfigs = [];
const assocSourceObjects = [];
const assocTargetConfigs = [];
const typeMapper = new TypeMapper();

for (const obj of integrationObjects) {
  const f = obj.fields;
  const fields = (obj.relatedEntities?.["MJ: Integration Object Fields"] || []).map((fld) => fld.fields);
  const tableName = singularMap[f.Name] || f.Name;

  if (fields.length === 0) {
    console.log(`  Skipping ${f.Name} — no fields`);
    continue;
  }

  const pkFields = fields.filter((fld) => fld.IsPrimaryKey).map((fld) => fld.Name);
  const isAssoc = isAssociationObject(f.Name);

  // Build source object
  const sourceObj = {
    ExternalName: f.Name,
    Label: f.DisplayName,
    Description: f.Description || "",
    Fields: fields.map((fld) => ({
      Name: fld.Name,
      Label: fld.DisplayName || fld.Name,
      Description: fld.Description || "",
      SourceType: mapFieldType(fld),
      IsRequired: !!fld.IsRequired,
      MaxLength: fld.Length || null,
      Precision: null,
      Scale: null,
      DefaultValue: null,
      IsPrimaryKey: !!fld.IsPrimaryKey,
      IsForeignKey: false,
      ForeignKeyTarget: null,
    })),
    PrimaryKeyFields: pkFields,
    Relationships: [],
  };

  // Build target columns
  const columns = fields.map((fld) => {
    const sourceType = mapFieldType(fld);
    const sourceField = {
      Name: fld.Name, Label: fld.DisplayName || fld.Name, SourceType: sourceType,
      IsRequired: !!fld.IsRequired, MaxLength: fld.Length || null, Precision: null,
      Scale: null, DefaultValue: null, IsPrimaryKey: !!fld.IsPrimaryKey,
      IsForeignKey: false, ForeignKeyTarget: null,
    };
    const mapped = typeMapper.MapSourceType(sourceType, PLATFORM, sourceField);
    return {
      SourceFieldName: fld.Name,
      TargetColumnName: fld.Name,
      TargetSqlType: mapped,
      IsNullable: !fld.IsPrimaryKey && !fld.IsRequired,
      MaxLength: fld.Length || null,
      Precision: null,
      Scale: null,
      DefaultValue: null,
      Description: fld.Description || "",
    };
  });

  // Build soft FKs for association objects
  const softFKs = [];
  if (isAssoc) {
    const parsed = parseAssociationName(f.Name);
    if (parsed) {
      const [leftObj, rightObj] = parsed;
      const leftTable = singularMap[leftObj];
      const rightTable = singularMap[rightObj];
      // PK fields on associations are the FK columns
      if (pkFields.length === 2 && leftTable && rightTable) {
        softFKs.push(
          { SchemaName: SCHEMA, TableName: tableName, FieldName: pkFields[0], TargetSchemaName: SCHEMA, TargetTableName: leftTable,  TargetFieldName: "hs_object_id" },
          { SchemaName: SCHEMA, TableName: tableName, FieldName: pkFields[1], TargetSchemaName: SCHEMA, TargetTableName: rightTable, TargetFieldName: "hs_object_id" },
        );
      }
    }
  }

  const targetCfg = {
    SourceObjectName: f.Name,
    SchemaName: SCHEMA,
    TableName: tableName,
    EntityName: `HubSpot ${f.DisplayName}`,
    Description: f.Description || "",
    PrimaryKeyFields: pkFields,
    Columns: columns,
    SoftForeignKeys: softFKs,
  };

  if (isAssoc) {
    assocSourceObjects.push(sourceObj);
    assocTargetConfigs.push(targetCfg);
  } else {
    baseSourceObjects.push(sourceObj);
    baseTargetConfigs.push(targetCfg);
  }
}

console.log(`Base objects: ${baseSourceObjects.length}, Association objects: ${assocSourceObjects.length}`);

// ─── Run SchemaBuilder for base tables ───────────────────────────────
// Only write the base migration if the file doesn't exist (frozen once run).

const baseBuilder = new SchemaBuilder();
const baseOutput = baseBuilder.BuildSchema({
  SourceSchema: { Objects: baseSourceObjects },
  TargetConfigs: baseTargetConfigs,
  Platform: PLATFORM,
  MJVersion: "5.12.0",
  SourceType: "HubSpot",
  AdditionalSchemaInfoPath: ADDITIONAL_SCHEMA_PATH,
  MigrationsDir: "migrations/v5",
  MetadataDir: "metadata",
  ExistingTables: [],
  EntitySettingsForTargets: {},
});

if (baseOutput.Errors.length > 0) {
  console.error("Base table errors:", baseOutput.Errors);
  process.exit(1);
}

if (!existsSync(BASE_MIGRATION_PATH)) {
  const baseSQL = baseOutput.MigrationFiles.map((f) => f.Content).join("\n\n");
  if (baseSQL) {
    writeFileSync(BASE_MIGRATION_PATH, baseSQL, "utf8");
    console.log(`Wrote base migration: ${BASE_MIGRATION_PATH}`);
  }
} else {
  console.log(`Base migration already exists (frozen): ${BASE_MIGRATION_PATH}`);
}

// ─── Run SchemaBuilder for association tables ────────────────────────

const assocBuilder = new SchemaBuilder();
const assocOutput = assocBuilder.BuildSchema({
  SourceSchema: { Objects: assocSourceObjects },
  TargetConfigs: assocTargetConfigs,
  Platform: PLATFORM,
  MJVersion: "5.12.0",
  SourceType: "HubSpot",
  AdditionalSchemaInfoPath: ADDITIONAL_SCHEMA_PATH,
  MigrationsDir: "migrations/v5",
  MetadataDir: "metadata",
  ExistingTables: [],
  EntitySettingsForTargets: {},
});

if (assocOutput.Errors.length > 0) {
  console.error("Association table errors:", assocOutput.Errors);
  process.exit(1);
}

const assocSQL = assocOutput.MigrationFiles.map((f) => f.Content).join("\n\n");
if (assocSQL) {
  writeFileSync(ASSOC_MIGRATION_PATH, assocSQL, "utf8");
  console.log(`Wrote association migration: ${ASSOC_MIGRATION_PATH}`);
}

// ─── Merge additionalSchemaInfo from both runs ──────────────────────

let existing = {};
if (existsSync(ADDITIONAL_SCHEMA_PATH)) {
  existing = JSON.parse(readFileSync(ADDITIONAL_SCHEMA_PATH, "utf8"));
}

for (const schemaUpdate of [baseOutput.AdditionalSchemaInfoUpdate, assocOutput.AdditionalSchemaInfoUpdate]) {
  if (!schemaUpdate) continue;
  const newInfo = JSON.parse(schemaUpdate.Content);
  for (const [schema, tables] of Object.entries(newInfo)) {
    if (!existing[schema]) existing[schema] = [];
    for (const newTable of tables) {
      const idx = existing[schema].findIndex((t) => t.TableName === newTable.TableName);
      if (idx >= 0) existing[schema][idx] = newTable;
      else existing[schema].push(newTable);
    }
  }
}

writeFileSync(ADDITIONAL_SCHEMA_PATH, JSON.stringify(existing, null, 2), "utf8");
console.log(`Updated additionalSchemaInfo: ${ADDITIONAL_SCHEMA_PATH}`);

// ─── Write any metadata files ────────────────────────────────────────

for (const mf of [...baseOutput.MetadataFiles, ...assocOutput.MetadataFiles]) {
  const fullPath = resolve(ROOT, mf.FilePath);
  writeFileSync(fullPath, mf.Content, "utf8");
  console.log(`Wrote metadata: ${mf.FilePath}`);
}

console.log(`\nDone! ${baseTargetConfigs.length} base + ${assocTargetConfigs.length} association = ${baseTargetConfigs.length + assocTargetConfigs.length} tables processed.`);
