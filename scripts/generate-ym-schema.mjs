#!/usr/bin/env node
/**
 * Calls SchemaBuilder directly (no API, no auth) to generate:
 *   1. Migration SQL for all 58 YourMembership tables
 *   2. Updated additionalSchemaInfo.json with soft PK/FK entries
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Import SchemaBuilder directly from the built package
const { SchemaBuilder } = require(resolve(ROOT, "packages/Integration/schema-builder/dist/SchemaBuilder.js"));
const { TypeMapper } = require(resolve(ROOT, "packages/Integration/schema-builder/dist/TypeMapper.js"));

const MIGRATION_PATH = resolve(ROOT, "migrations/v5/V202603170100__v5.12.x__YourMembership_CreateTables.sql");
const ADDITIONAL_SCHEMA_PATH = resolve(ROOT, "metadata/integrations/additionalSchemaInfo.json");
const SCHEMA = "YourMembership";
const PLATFORM = "sqlserver";

const singularMap = {
  Members: "Member", Events: "Event", MemberTypes: "MemberType", Memberships: "Membership",
  Groups: "Group", Products: "Product", DonationFunds: "DonationFund", Certifications: "Certification",
  InvoiceItems: "InvoiceItem", DuesTransactions: "DuesTransaction", EventRegistrations: "EventRegistration",
  EventSessions: "EventSession", EventTickets: "EventTicket", EventCategories: "EventCategory",
  MemberGroups: "MemberGroup", Connections: "Connection", DonationHistory: "DonationHistory",
  EngagementScores: "EngagementScore", GroupTypes: "GroupType", DonationTransactions: "DonationTransaction",
  StoreOrders: "StoreOrder", StoreOrderDetails: "StoreOrderDetail", CertificationsJournals: "CertificationJournal",
  CertificationCreditTypes: "CertificationCreditType", ProductCategories: "ProductCategory",
  CareerOpenings: "CareerOpening", Campaigns: "Campaign", GLCodes: "GLCode",
  MembersProfiles: "MemberProfile", PeopleIDs: "PersonID", MembersGroupsBulk: "MemberGroupBulk",
  FinanceBatches: "FinanceBatch", FinanceBatchDetails: "FinanceBatchDetail", AllCampaigns: "AllCampaign",
  CampaignEmailLists: "CampaignEmailList", EventAttendeeTypes: "EventAttendeeType",
  EventSessionGroups: "EventSessionGroup", EventCEUAwards: "EventCEUAward",
  EventRegistrationForms: "EventRegistrationForm", EventIDs: "EventID",
  GroupMembershipLogs: "GroupMembershipLog", DuesRules: "DuesRule", MemberReferrals: "MemberReferral",
  MemberSubAccounts: "MemberSubAccount", Countries: "Country", Locations: "Location",
  ShippingMethods: "ShippingMethod", PaymentProcessors: "PaymentProcessor",
  CustomTaxLocations: "CustomTaxLocation", QBClasses: "QBClass", MembershipModifiers: "MembershipModifier",
  MembershipPromoCodes: "MembershipPromoCode", Announcements: "Announcement",
  EmailSuppressionList: "EmailSuppressionList", SponsorRotators: "SponsorRotator",
  MemberNetworks: "MemberNetwork", MemberFavorites: "MemberFavorite", TimeZones: "TimeZone",
};

// Map integration field types to SourceFieldInfo.SourceType
function mapFieldType(field) {
  const t = (field.Type || "nvarchar").toLowerCase();
  if (t === "int" || t === "integer") return "integer";
  if (t === "bigint") return "bigint";
  if (t === "float" || t === "double" || t === "decimal" || t === "number") return "decimal";
  if (t === "bit" || t === "boolean" || t === "bool") return "boolean";
  if (t === "datetime" || t === "datetimeoffset" || t === "date") return "datetime";
  return "string";
}

// Read integration metadata
const metadata = JSON.parse(readFileSync(resolve(ROOT, "metadata/integrations/.your-membership.json"), "utf8"));
const integrationObjects = metadata[0].relatedEntities["MJ: Integration Objects"];

// Build SourceSchemaInfo from integration metadata
const sourceObjects = [];
const targetConfigs = [];
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

  // Build SourceObjectInfo
  sourceObjects.push({
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
  });

  // Build TargetTableConfig
  const columns = fields.map((fld) => {
    const sourceType = mapFieldType(fld);
    const sourceField = { Name: fld.Name, Label: fld.DisplayName || fld.Name, SourceType: sourceType, IsRequired: !!fld.IsRequired, MaxLength: fld.Length || null, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: !!fld.IsPrimaryKey, IsForeignKey: false, ForeignKeyTarget: null };
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

  targetConfigs.push({
    SourceObjectName: f.Name,
    SchemaName: SCHEMA,
    TableName: tableName,
    EntityName: `MRAA ${f.DisplayName}`,
    Description: f.Description || "",
    PrimaryKeyFields: pkFields,
    Columns: columns,
    SoftForeignKeys: [],
  });
}

console.log(`Built source schema: ${sourceObjects.length} objects`);
console.log(`Built target configs: ${targetConfigs.length} tables`);

// Call SchemaBuilder
const input = {
  SourceSchema: { Objects: sourceObjects },
  TargetConfigs: targetConfigs,
  Platform: PLATFORM,
  MJVersion: "5.12.0",
  SourceType: "YourMembership",
  AdditionalSchemaInfoPath: ADDITIONAL_SCHEMA_PATH,
  MigrationsDir: "migrations/v5",
  MetadataDir: "metadata",
  ExistingTables: [],
  EntitySettingsForTargets: {},
};

const builder = new SchemaBuilder();
const output = builder.BuildSchema(input);

if (output.Errors.length > 0) {
  console.error("Errors:", output.Errors);
  process.exit(1);
}

if (output.Warnings.length > 0) {
  output.Warnings.forEach((w) => console.log(`  Warning: ${w}`));
}

// Write migration files
const allSQL = output.MigrationFiles.map((f) => f.Content).join("\n\n");
if (allSQL) {
  writeFileSync(MIGRATION_PATH, allSQL, "utf8");
  console.log(`Wrote migration: ${MIGRATION_PATH}`);
}

// Write additionalSchemaInfo
if (output.AdditionalSchemaInfoUpdate) {
  let existing = {};
  if (existsSync(ADDITIONAL_SCHEMA_PATH)) {
    existing = JSON.parse(readFileSync(ADDITIONAL_SCHEMA_PATH, "utf8"));
  }
  const newInfo = JSON.parse(output.AdditionalSchemaInfoUpdate.Content);
  for (const [schema, tables] of Object.entries(newInfo)) {
    if (!existing[schema]) existing[schema] = [];
    for (const newTable of tables) {
      const idx = existing[schema].findIndex((t) => t.TableName === newTable.TableName);
      if (idx >= 0) existing[schema][idx] = newTable;
      else existing[schema].push(newTable);
    }
  }
  writeFileSync(ADDITIONAL_SCHEMA_PATH, JSON.stringify(existing, null, 2), "utf8");
  console.log(`Updated additionalSchemaInfo: ${ADDITIONAL_SCHEMA_PATH}`);
}

// Write metadata files
for (const mf of output.MetadataFiles) {
  const fullPath = resolve(ROOT, mf.FilePath);
  writeFileSync(fullPath, mf.Content, "utf8");
  console.log(`Wrote metadata: ${mf.FilePath}`);
}

console.log(`\nDone! ${targetConfigs.length} tables processed.`);
