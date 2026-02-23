import { SQLDialect, SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { CodeGenConnection, CodeGenTransaction } from './codeGenDatabaseProvider';
import { configInfo, currentWorkingDirectory, dbType, getSettingValue, mj_core_schema, outputDir } from '../Config/config';
import { ApplicationInfo, CodeNameFromString, EntityFieldInfo, EntityInfo, ExtractActualDefaultValue, FieldCategoryInfo, LogError, LogStatus, Metadata, SeverityType, UserInfo } from "@memberjunction/core";
import { MJApplicationEntity } from "@memberjunction/core-entities";
import { logError, logMessage, logStatus } from "../Misc/status_logging";
import { SQLUtilityBase } from "./sql";
import { AdvancedGeneration, EntityDescriptionResult, EntityNameResult, SmartFieldIdentificationResult, FormLayoutResult, VirtualEntityDecorationResult } from "../Misc/advanced_generation";
import { SQLParser } from "@memberjunction/core-entities-server";
import { convertCamelCaseToHaveSpaces, generatePluralName, MJGlobal, RegisterClass, SafeJSONParse, stripTrailingChars } from "@memberjunction/global";
import { v4 as uuidv4 } from 'uuid';

import * as fs from 'fs';
import path from 'path';
import { SQLLogging } from "../Misc/sql_logging";
import { AIEngine } from "@memberjunction/aiengine";


export class ValidatorResult {
   public entityName: string = "";
   public fieldName?: string;
   public sourceCheckConstraint: string = "";
   public functionText: string = "";
   public functionName: string = "";
   public functionDescription: string = "";
   /**
    * The ID value in the Generated Codes entity that was created for this validator.
    */
   public generatedCodeId: string = "";
   /**
    * The ID for the AI Model that was used to generate the code
    */
   public aiModelID: string = "";
   public wasGenerated: boolean = true;
   public success: boolean = false;
}

/**
 * Configuration for a soft primary key field in the additionalSchemaInfo config file.
 * Uses PascalCase property names to match MemberJunction naming conventions.
 */
export interface SoftPKFieldConfig {
   FieldName: string;
   Description?: string;
}

/**
 * Configuration for a soft foreign key field in the additionalSchemaInfo config file.
 * Uses PascalCase property names to match MemberJunction naming conventions.
 */
export interface SoftFKFieldConfig {
   FieldName: string;
   SchemaName?: string;
   RelatedTable: string;
   RelatedField: string;
   Description?: string;
}

/**
 * Normalized table configuration extracted from the additionalSchemaInfo config file.
 * Uses PascalCase property names to match MemberJunction naming conventions.
 */
export interface SoftPKFKTableConfig {
   SchemaName: string;
   TableName: string;
   Description?: string;
   PrimaryKey: SoftPKFieldConfig[];
   ForeignKeys: SoftFKFieldConfig[];
}

/**
 * Configuration for a virtual entity in the additionalSchemaInfo config file.
 * Virtual entities are backed by SQL views with no physical table.
 */
export interface VirtualEntityConfig {
   /** The name of the SQL view backing this virtual entity */
   ViewName: string;
   /** The schema containing the view */
   SchemaName?: string;
   /** The display name for the entity. If not provided, derived from ViewName */
   EntityName?: string;
   /** Optional description for the entity */
   Description?: string;
   /** Primary key field name(s). If not provided, defaults to 'ID' */
   PrimaryKey?: string[];
   /** Optional soft foreign key definitions for the virtual entity */
   ForeignKeys?: SoftFKFieldConfig[];
}

/**
 * Configuration for an IS-A (Table-Per-Type) relationship in the additionalSchemaInfo config file.
 * Declares that a child entity inherits from a parent entity. CodeGen sets Entity.ParentID
 * automatically, then manages virtual field records and view JOINs for the inheritance chain.
 */
export interface ISARelationshipConfig {
   /** The entity name of the child (e.g., "AE Meetings"). Can also be the table name if entity names haven't been created yet. */
   ChildEntity: string;
   /** The entity name of the parent (e.g., "AE Products"). Can also be the table name. */
   ParentEntity: string;
   /** Optional schema name for table-name lookups (defaults to MJ core schema if not provided) */
   SchemaName?: string;
}

/**
 * Configuration for setting arbitrary Entity-table attributes on a specific entity,
 * identified by BaseTable + SchemaName. This is processed after entity discovery so
 * any column on the Entity table can be set declaratively from the config file.
 *
 * Example usage in database-metadata-config.json:
 * ```json
 * {
 *   "Entities": [
 *     { "BaseTable": "Person", "SchemaName": "MySchema", "AllowMultipleSubtypes": true },
 *     { "BaseTable": "AuditLog", "SchemaName": "MySchema", "TrackRecordChanges": false }
 *   ]
 * }
 * ```
 */
export interface EntityConfig {
   /** The base table name of the entity */
   BaseTable: string;
   /** The schema containing the base table */
   SchemaName: string;
   /** Any additional Entity-table columns to set, keyed by column name */
   [key: string]: unknown;
}

/**
 * Base class for managing metadata within the CodeGen system. This class can be sub-classed to extend/override base class functionality. Make sure to use the RegisterClass decorator from the @memberjunction/global package
 * to properly register your subclass with a priority of 1+ to ensure it gets instantiated.
 */
/**
 * Represents a SchemaInfo record loaded from the database, used for resolving
 * entity name prefix/suffix rules from database metadata.
 */
type SchemaInfoRecord = {
   SchemaName: string;
   EntityNamePrefix: string | null;
   EntityNameSuffix: string | null;
};

export class ManageMetadataBase {

   // ─── Database Dialect Infrastructure ──────────────────────────────
   // Provides platform-aware SQL generation for SQL Server and PostgreSQL.
   // The dialect is lazily initialized from the dbType() config on first access.

   private _dialect: SQLDialect | null = null;

   /**
    * Returns the SQLDialect for the current database platform.
    * Lazily initialized from dbType() configuration.
    */
   protected get dialect(): SQLDialect {
      if (!this._dialect) {
         const platform = dbType();
         this._dialect = platform === 'postgresql'
            ? new PostgreSQLDialect()
            : new SQLServerDialect();
      }
      return this._dialect;
   }

   /**
    * Returns true if the current platform is PostgreSQL.
    */
   protected get isPostgreSQL(): boolean {
      return this.dialect.PlatformKey === 'postgresql';
   }

   /**
    * Quotes a database identifier (column, table, etc.).
    * SQL Server: [name], PostgreSQL: "name"
    */
   protected qi(name: string): string {
      return this.dialect.QuoteIdentifier(name);
   }

   /**
    * Produces a schema-qualified object reference.
    * SQL Server: [schema].[object], PostgreSQL: schema."object"
    */
   protected qs(schema: string, object: string): string {
      return this.dialect.QuoteSchema(schema, object);
   }

   /**
    * Returns the current UTC timestamp expression.
    * SQL Server: GETUTCDATE(), PostgreSQL: NOW() AT TIME ZONE 'UTC'
    */
   protected utcNow(): string {
      return this.dialect.CurrentTimestampUTC();
   }

   /**
    * Returns a boolean literal for the platform.
    * SQL Server: 1/0, PostgreSQL: true/false
    */
   protected boolLit(value: boolean): string {
      return this.dialect.BooleanLiteral(value);
   }

   /**
    * Wraps a SELECT query with a row limit.
    * SQL Server: SELECT TOP N ... , PostgreSQL: SELECT ... LIMIT N
    */
   protected selectTop(n: number, selectBody: string, fromAndWhere: string, orderBy?: string): string {
      const limit = this.dialect.LimitClause(n);
      const orderClause = orderBy ? ` ORDER BY ${orderBy}` : '';
      if (limit.prefix) {
         // SQL Server: SELECT TOP N columns FROM ...
         return `SELECT ${limit.prefix} ${selectBody} ${fromAndWhere}${orderClause}`;
      }
      // PostgreSQL: SELECT columns FROM ... LIMIT N
      return `SELECT ${selectBody} ${fromAndWhere}${orderClause} ${limit.suffix}`;
   }

   /**
    * Returns ISNULL/COALESCE expression.
    * Both platforms support COALESCE, but SQL Server also has ISNULL.
    */
   protected coalesce(expr: string, fallback: string): string {
      return this.dialect.IsNull(expr, fallback);
   }

   /**
    * Returns an IIF/CASE expression.
    * SQL Server: IIF(cond, t, f), PostgreSQL: CASE WHEN cond THEN t ELSE f END
    */
   protected iif(condition: string, trueVal: string, falseVal: string): string {
      return this.dialect.IIF(condition, trueVal, falseVal);
   }

   /**
    * Returns the timestamp column type name for this platform.
    * SQL Server: DATETIMEOFFSET, PostgreSQL: TIMESTAMPTZ
    */
   protected get timestampType(): string {
      return this.isPostgreSQL ? 'TIMESTAMPTZ' : 'DATETIMEOFFSET';
   }

   /**
    * Generates a conditional existence check + DROP statement.
    * SQL Server: IF OBJECT_ID(...) IS NOT NULL DROP ...
    * PostgreSQL: DROP ... IF EXISTS ...
    */
   protected dropIfExists(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string {
      if (this.isPostgreSQL) {
         const typeStr = objectType === 'PROCEDURE' ? 'FUNCTION' : objectType; // PG uses FUNCTION for both
         return `DROP ${typeStr} IF EXISTS ${this.qs(schema, name)}${objectType === 'PROCEDURE' || objectType === 'FUNCTION' ? ' CASCADE' : ''}`;
      }
      // SQL Server
      const objectTypeCode = objectType === 'PROCEDURE' ? 'P' : objectType === 'VIEW' ? 'V' : 'FN';
      return `IF OBJECT_ID('${this.qs(schema, name)}', '${objectTypeCode}') IS NOT NULL\n    DROP ${objectType} ${this.qs(schema, name)}`;
   }

   /**
    * Generates SQL for conditional INSERT (IF NOT EXISTS pattern).
    * SQL Server: IF NOT EXISTS (SELECT 1 FROM ... WHERE ...) BEGIN INSERT ... END
    * PostgreSQL: INSERT ... ON CONFLICT DO NOTHING (or subquery approach)
    */
   protected conditionalInsert(checkQuery: string, insertSQL: string): string {
      if (this.isPostgreSQL) {
         // Use a NOT EXISTS subquery approach for PostgreSQL
         return `DO $$ BEGIN\n   IF NOT EXISTS (${checkQuery}) THEN\n      ${insertSQL};\n   END IF;\nEND $$`;
      }
      return `IF NOT EXISTS (\n      ${checkQuery}\n   )\n   BEGIN\n      ${insertSQL}\n   END`;
   }

   // ─── End Dialect Infrastructure ───────────────────────────────────

   protected _sqlUtilityObject: SQLUtilityBase = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase)!;
   public get SQLUtilityObject(): SQLUtilityBase {
       return this._sqlUtilityObject;
   }

   /**
    * Cached SchemaInfo records loaded from the database during metadata sync.
    * Used by getNewEntityNameRule() to resolve prefix/suffix from DB metadata.
    */
   private static _schemaInfoRecords: SchemaInfoRecord[] = [];

   private static _newEntityList: string[] = [];
   /**
    * Globally scoped list of entities that have been created during the metadata management process.
    */
   public static get newEntityList(): string[] {
      return this._newEntityList;
   }
   private static _modifiedEntityList: string[] = [];
   /**
    * Globally scoped list of entities that have been modified during the metadata management process.
    */
   public static get modifiedEntityList(): string[] {
      return this._modifiedEntityList;
   }
   private static _generatedValidators: ValidatorResult[] = [];
   /**
    * Globally scoped list of validators that have been generated during the metadata management process.
    */
   public static get generatedValidators(): ValidatorResult[] {
      return this._generatedValidators;
   }

   private static _softPKFKConfigCache: any = null;
   private static _softPKFKConfigPath: string = '';
   /**
    * Loads and caches the soft PK/FK configuration from the additionalSchemaInfo file.
    * The file is only loaded once per session to avoid repeated I/O.
    */
   private static getSoftPKFKConfig(): any {
      // Return cached config if path hasn't changed
      const configPath = configInfo.additionalSchemaInfo
         ? path.join(currentWorkingDirectory, configInfo.additionalSchemaInfo)
         : '';

      if (this._softPKFKConfigCache !== null && this._softPKFKConfigPath === configPath) {
         return this._softPKFKConfigCache;
      }

      // Cache miss or path changed - reload from disk
      if (!configPath || !fs.existsSync(configPath)) {
         this._softPKFKConfigCache = null;
         this._softPKFKConfigPath = configPath;
         return null;
      }

      try {
         const configContent = fs.readFileSync(configPath, 'utf-8');
         this._softPKFKConfigCache = JSON.parse(configContent);
         this._softPKFKConfigPath = configPath;
         return this._softPKFKConfigCache;
      } catch (e) {
         this._softPKFKConfigCache = null;
         this._softPKFKConfigPath = configPath;
         return null;
      }
   }

   /**
    * Extracts a flat array of table configs from the config file, handling both formats:
    *   1. Schema-as-key (template format): { "dbo": [{ "TableName": "Orders", ... }] }
    *   2. Flat tables array (legacy format): { "Tables": [{ "SchemaName": "dbo", "TableName": "Orders", ... }] }
    * Returns a normalized array where each entry has SchemaName, TableName, PrimaryKey[], and ForeignKeys[].
    */
   protected extractTablesFromConfig(config: Record<string, unknown>): SoftPKFKTableConfig[] {
      const results: SoftPKFKTableConfig[] = [];

      // Check for flat "Tables" array format first
      if (Array.isArray(config.Tables)) {
         for (const table of config.Tables) {
            const t = table as Record<string, unknown>;
            results.push({
               SchemaName: (t.SchemaName as string) || 'dbo',
               TableName: t.TableName as string,
               PrimaryKey: (t.PrimaryKey as SoftPKFieldConfig[]) || [],
               ForeignKeys: (t.ForeignKeys as SoftFKFieldConfig[]) || [],
            });
         }
         return results;
      }

      // Schema-as-key format: iterate over keys, skip metadata and special section keys
      const metadataKeys = new Set(['$schema', 'description', 'version', 'VirtualEntities', 'ISARelationships', 'Entities', 'Tables']);
      for (const key of Object.keys(config)) {
         if (metadataKeys.has(key)) continue;

         const schemaName = key;
         const tables = config[key];
         if (!Array.isArray(tables)) continue;

         for (const table of tables) {
            const t = table as Record<string, unknown>;
            results.push({
               SchemaName: schemaName,
               TableName: t.TableName as string,
               PrimaryKey: (t.PrimaryKey as SoftPKFieldConfig[]) || [],
               ForeignKeys: (t.ForeignKeys as SoftFKFieldConfig[]) || [],
            });
         }
      }

      return results;
   }

   /**
    * Extracts VirtualEntities array from the additionalSchemaInfo config file.
    * The config may contain a top-level "VirtualEntities" key with an array of
    * virtual entity definitions.
    */
   protected extractVirtualEntitiesFromConfig(config: Record<string, unknown>): VirtualEntityConfig[] {
      const virtualEntities = config.VirtualEntities;
      if (!Array.isArray(virtualEntities)) return [];

      return virtualEntities.map((ve: Record<string, unknown>) => ({
         ViewName: ve.ViewName as string,
         SchemaName: (ve.SchemaName as string) || undefined,
         EntityName: (ve.EntityName as string) || undefined,
         Description: (ve.Description as string) || undefined,
         PrimaryKey: Array.isArray(ve.PrimaryKey) ? (ve.PrimaryKey as string[]) : undefined,
         ForeignKeys: Array.isArray(ve.ForeignKeys) ? (ve.ForeignKeys as SoftFKFieldConfig[]) : undefined,
      }));
   }

   /**
    * Extracts ISARelationships array from the additionalSchemaInfo config file.
    * The config may contain a top-level "ISARelationships" key with an array of
    * parent-child relationship definitions.
    */
   protected extractISARelationshipsFromConfig(config: Record<string, unknown>): ISARelationshipConfig[] {
      const relationships = config.ISARelationships;
      if (!Array.isArray(relationships)) return [];

      return relationships.map((rel: Record<string, unknown>) => ({
         ChildEntity: rel.ChildEntity as string,
         ParentEntity: rel.ParentEntity as string,
         SchemaName: (rel.SchemaName as string) || undefined,
      }));
   }

   /**
    * Extracts the top-level "Entities" array from the additionalSchemaInfo config file.
    * Each entry identifies an entity by BaseTable + SchemaName and declares arbitrary
    * Entity-table attributes to set (e.g., AllowMultipleSubtypes, TrackRecordChanges).
    */
   protected extractEntitiesFromConfig(config: Record<string, unknown>): EntityConfig[] {
      const entities = config.Entities;
      if (!Array.isArray(entities)) return [];

      return entities
         .filter((e: Record<string, unknown>) => typeof e.BaseTable === 'string' && typeof e.SchemaName === 'string')
         .map((e: Record<string, unknown>) => ({ ...e, BaseTable: e.BaseTable as string, SchemaName: e.SchemaName as string }));
   }

   /**
    * Processes IS-A relationship configurations from the additionalSchemaInfo config.
    * For each configured relationship, looks up both entities by name (or by table name
    * within the given schema) and sets Entity.ParentID on the child entity.
    * Must run AFTER entities are created but BEFORE manageParentEntityFields().
    */
   protected async processISARelationshipConfig(pool: CodeGenConnection): Promise<{ success: boolean; updatedCount: number }> {
      const config = ManageMetadataBase.getSoftPKFKConfig();
      if (!config) return { success: true, updatedCount: 0 };

      const relationships = this.extractISARelationshipsFromConfig(config as Record<string, unknown>);
      if (relationships.length === 0) return { success: true, updatedCount: 0 };

      let updatedCount = 0;
      const schema = mj_core_schema();

      for (const rel of relationships) {
         try {
            // Look up the parent entity — try by Name first, then by BaseTable within the given schema
            const parentResult = await pool.queryWithParams(`
                  ${this.selectTop(1, 'ID, Name',
                     `FROM ${this.qs(schema, 'vwEntities')}
                  WHERE Name = @ParentName
                     OR (BaseTable = @ParentName AND (@SchemaName IS NULL OR SchemaName = @SchemaName))`,
                     'CASE WHEN Name = @ParentName THEN 0 ELSE 1 END')}
               `,
               { 'ParentName': rel.ParentEntity, 'SchemaName': rel.SchemaName || null }
               );

            if (parentResult.recordset.length === 0) {
               logError(`    > IS-A config: parent entity "${rel.ParentEntity}" not found — skipping`);
               continue;
            }

            const parentId = parentResult.recordset[0].ID;
            const parentName = parentResult.recordset[0].Name;

            // Look up the child entity — same strategy
            const childResult = await pool.queryWithParams(`
                  ${this.selectTop(1, 'ID, Name, ParentID',
                     `FROM ${this.qs(schema, 'vwEntities')}
                  WHERE Name = @ChildName
                     OR (BaseTable = @ChildName AND (@SchemaName IS NULL OR SchemaName = @SchemaName))`,
                     'CASE WHEN Name = @ChildName THEN 0 ELSE 1 END')}
               `,
               { 'ChildName': rel.ChildEntity, 'SchemaName': rel.SchemaName || null }
               );

            if (childResult.recordset.length === 0) {
               logError(`    > IS-A config: child entity "${rel.ChildEntity}" not found — skipping`);
               continue;
            }

            const childId = childResult.recordset[0].ID;
            const childName = childResult.recordset[0].Name;
            const existingParentId = childResult.recordset[0].ParentID;

            // Skip if already set correctly
            if (existingParentId === parentId) {
               logStatus(`    > IS-A: "${childName}" already has ParentID set to "${parentName}", skipping`);
            } else {
               // Set ParentID on the child entity
               await pool.queryWithParams(`UPDATE $\{this.qs(schema, \'Entity\')\} SET ParentID = @ParentID WHERE ID = @ChildID`,
               { 'ParentID': parentId, 'ChildID': childId }
               );

               if (existingParentId) {
                  logStatus(`    > IS-A: Updated "${childName}" ParentID from previous value to "${parentName}"`);
               } else {
                  logStatus(`    > IS-A: Set "${childName}" ParentID to "${parentName}"`);
               }
               updatedCount++;
            }
         } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            logError(`    > IS-A config: Failed to set ParentID for "${rel.ChildEntity}": ${errMessage}`);
         }
      }

      return { success: true, updatedCount };
   }

   /**
    * Processes Entity attribute configurations from the additionalSchemaInfo config.
    * For each entry in the top-level "Entities" array, looks up the entity by
    * BaseTable + SchemaName and applies any declared attribute updates to the Entity table.
    * Reserved keys (BaseTable, SchemaName) are excluded from the UPDATE statement.
    * Must run AFTER entities are created.
    */
   protected async processEntityConfigs(pool: CodeGenConnection): Promise<{ success: boolean; updatedCount: number }> {
      const config = ManageMetadataBase.getSoftPKFKConfig();
      if (!config) return { success: true, updatedCount: 0 };

      const entityConfigs = this.extractEntitiesFromConfig(config as Record<string, unknown>);
      if (entityConfigs.length === 0) return { success: true, updatedCount: 0 };

      let updatedCount = 0;
      const schema = mj_core_schema();
      const reservedKeys = new Set(['BaseTable', 'SchemaName']);

      for (const ec of entityConfigs) {
         try {
            // Collect the attribute columns to update (everything except BaseTable/SchemaName)
            const attrs = Object.entries(ec).filter(([key]) => !reservedKeys.has(key));
            if (attrs.length === 0) {
               logStatus(`    > Entities config: "${ec.SchemaName}.${ec.BaseTable}" has no attributes to set — skipping`);
               continue;
            }

            // Look up the entity by BaseTable + SchemaName
            const entityResult = await pool.queryWithParams(`
                  ${this.selectTop(1, 'ID, Name',
                     `FROM ${this.qs(schema, 'vwEntities')}
                  WHERE BaseTable = @BaseTable AND SchemaName = @SchemaName`)}
               `,
               { 'BaseTable': ec.BaseTable, 'SchemaName': ec.SchemaName }
               );

            if (entityResult.recordset.length === 0) {
               logError(`    > Entities config: entity for "${ec.SchemaName}.${ec.BaseTable}" not found — skipping`);
               continue;
            }

            const entityId = entityResult.recordset[0].ID;
            const entityName = entityResult.recordset[0].Name;

            // Build a parameterized UPDATE with one SET clause per attribute
            const queryParams: Record<string, unknown> = { 'EntityID': entityId };
            const setClauses: string[] = [];
            for (const [key, value] of attrs) {
               const paramName = `attr_${key}`;
               // Convert boolean values to SQL BIT (1/0)
               const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
               queryParams[paramName] = sqlValue;
               setClauses.push(`${this.qi(key)} = @${paramName}`);
            }

            await pool.queryWithParams(`UPDATE $\{this.qs(schema, \'Entity\')\} SET ${setClauses.join(', ')} WHERE ID = @EntityID`, queryParams);

            const attrSummary = attrs.map(([k, v]) => `${k}=${v}`).join(', ');
            logStatus(`    > Entities config: Set ${attrSummary} on "${entityName}"`);
            updatedCount++;
         } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            logError(`    > Entities config: Failed to update "${ec.SchemaName}.${ec.BaseTable}": ${errMessage}`);
         }
      }

      return { success: true, updatedCount };
   }

   /**
    * Processes virtual entity configurations from the additionalSchemaInfo config.
    * For each configured virtual entity, checks if it already exists and creates
    * it if not. Uses the spCreateVirtualEntity stored procedure.
    * Must run BEFORE manageVirtualEntities() so newly created entities get field-synced.
    */
   protected async processVirtualEntityConfig(pool: CodeGenConnection, currentUser: UserInfo): Promise<{ success: boolean; createdCount: number }> {
      const config = ManageMetadataBase.getSoftPKFKConfig();
      if (!config) return { success: true, createdCount: 0 };

      const virtualEntities = this.extractVirtualEntitiesFromConfig(config as Record<string, unknown>);
      if (virtualEntities.length === 0) return { success: true, createdCount: 0 };

      let createdCount = 0;
      const schema = mj_core_schema();

      for (const ve of virtualEntities) {
         const viewSchema = ve.SchemaName || schema;
         const viewName = ve.ViewName;
         const entityName = ve.EntityName || this.deriveEntityNameFromView(viewName);
         const pkField = ve.PrimaryKey?.[0] || 'ID';

         // Check if entity already exists for this view
         const existsResult = await pool.queryWithParams(`SELECT ID FROM $\{this.qs(schema, \'vwEntities\')\} WHERE BaseView = @ViewName AND SchemaName = @SchemaName`,
               { 'ViewName': viewName, 'SchemaName': viewSchema }
               );

         if (existsResult.recordset.length > 0) {
            logStatus(`    > Virtual entity "${entityName}" already exists for view [${viewSchema}].[${viewName}], skipping creation`);
            continue;
         }

         // Verify the view actually exists in the database
         const viewExistsResult = await pool.queryWithParams(
               this.isPostgreSQL
                  ? `SELECT 1 FROM information_schema.views WHERE table_name = @ViewName AND table_schema = @SchemaName`
                  : `SELECT 1 FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = @ViewName AND TABLE_SCHEMA = @SchemaName`,
               { 'ViewName': viewName, 'SchemaName': viewSchema }
               );

         if (viewExistsResult.recordset.length === 0) {
            logError(`    > View [${viewSchema}].[${viewName}] does not exist — skipping virtual entity creation for "${entityName}"`);
            continue;
         }

         // Create the virtual entity via the stored procedure
         try {
            const createResult = await pool.executeStoredProcedure(`$\{this.qs(schema, \'spCreateVirtualEntity\')\}`,
               { 'Name': entityName, 'BaseView': viewName, 'SchemaName': viewSchema, 'PrimaryKeyFieldName': pkField, 'Description': ve.Description || null }
               );

            const newEntityId = createResult.recordset?.[0]?.['']
               || createResult.recordset?.[0]?.ID
               || createResult.recordset?.[0]?.Column0;

            logStatus(`    > Created virtual entity "${entityName}" (ID: ${newEntityId}) for view [${viewSchema}].[${viewName}]`);
            createdCount++;

            // Add virtual entity to the application for its schema and set default permissions
            // (same logic as table-backed entities)
            if (newEntityId) {
               await this.addEntityToApplicationForSchema(pool, newEntityId, entityName, viewSchema, currentUser);
               await this.addDefaultPermissionsForEntity(pool, newEntityId, entityName);
            }
         } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            logError(`    > Failed to create virtual entity "${entityName}": ${errMessage}`);
         }
      }

      return { success: true, createdCount };
   }

   /**
    * Derives an entity name from a view name by removing common prefixes (vw, v_)
    * and converting to a human-friendly format.
    */
   protected deriveEntityNameFromView(viewName: string): string {
      let name = viewName;
      // Remove common view prefixes
      if (name.startsWith('vw')) name = name.substring(2);
      else if (name.startsWith('v_')) name = name.substring(2);
      // Add spaces before capital letters (PascalCase → "Pascal Case")
      name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
      return name.trim();
   }

   /**
    * Primary function to manage metadata within the CodeGen system. This function will call a series of sub-functions to manage the metadata.
    * @param pool - the ConnectionPool object to use for querying and updating the database
    * @returns
    */
   public async manageMetadata(pool: CodeGenConnection, currentUser: UserInfo): Promise<boolean> {
      const md = new Metadata();
      const excludeSchemas = configInfo.excludeSchemas ? configInfo.excludeSchemas : [];

      let bSuccess = true;
      let start = new Date();

      // Load SchemaInfo records early so that EntityNamePrefix/Suffix rules from the
      // database are available when createNewEntities() names new entities.
      logStatus('   Loading SchemaInfo records for entity name rules...');
      if (! await this.loadSchemaInfoRecords(pool)) {
         logError('   Error loading SchemaInfo records');
         bSuccess = false;
      }
      logStatus(`    > Loaded SchemaInfo records in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      start = new Date();
      logStatus('   Creating new entities...');
      if (! await this.createNewEntities(pool, currentUser)) {
         logError('   Error creating new entities');
         bSuccess = false;
      }
      logStatus(`    > Created new entities in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      start = new Date();
      logStatus('   Updating existing entities...');
      if (! await this.updateExistingEntitiesFromSchema(pool, excludeSchemas)) {
         logError('   Error updating existing entities');
         bSuccess = false;
      }
      logStatus(`    > Updated existing entities in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      start = new Date();
      logStatus('   Scanning for tables that were deleted where entity metadata still exists...');
      if (! await this.checkAndRemoveMetadataForDeletedTables(pool, excludeSchemas)) {
         logError('   Error removing metadata for tables that were removed');
         bSuccess = false;
      }
      logStatus(`    > Removed metadata for deleted tables in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      start = new Date();
      logStatus('   Recompiling base views...');
      const sqlUtility = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase)!;

      const adminSchema = getSettingValue('mj_core_schema', '__mj');
      const schemasToExclude = getSettingValue('recompile_mj_views', true)
        ? excludeSchemas.filter((s) => s !== adminSchema)
        : excludeSchemas;
      if (! await sqlUtility.recompileAllBaseViews(pool, schemasToExclude, true, ManageMetadataBase._newEntityList/*exclude the newly created entities from the above step the first time we run as those views don't exist yet*/)) {
         logMessage('   Warning: Non-Fatal error recompiling base views', SeverityType.Warning, false);
         // many times the former versions of base views will NOT succesfully recompile, so don't consider that scenario to be a
         // failure for this entire function
      }
      logStatus(`    > Recompiled base views in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);
      start = new Date();
      logStatus('   Managing entity fields...');
      // note that we skip Advanced Generation here because we do it again later when the manageSQLScriptsAndExecution occurs in SQLCodeGen class
      // Also skip deleting unneeded fields on this first pass — base views haven't been regenerated yet,
      // so virtual fields (which come from view JOINs) would be incorrectly identified as orphaned and deleted.
      // Deletion runs on the second pass (in sql_codegen.ts) after views are current.
      if (! await this.manageEntityFields(pool, excludeSchemas, false, false, currentUser, true, true)) {
         logError('   Error managing entity fields');
         bSuccess = false;
      }
      logStatus(`    > Managed entity fields in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);
      start = new Date();
      logStatus('   Managing entity relationships...');
      if (! await this.manageEntityRelationships(pool, excludeSchemas, md)) {
         logError('   Error managing entity relationships');
         bSuccess = false;
      }
      logStatus(`    > Managed entity relationships in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      if (ManageMetadataBase.newEntityList.length > 0) {
         await this.generateNewEntityDescriptions(pool, md, currentUser); // don't pass excludeSchemas becuase by definition this is the NEW entities we created
      }

      // Config-driven virtual entity creation — run BEFORE manageVirtualEntities
      // so newly created entities get their fields synced in the next step
      const vecResult = await this.processVirtualEntityConfig(pool, currentUser);
      if (vecResult.createdCount > 0) {
         logStatus(`    > Created ${vecResult.createdCount} virtual entit${vecResult.createdCount === 1 ? 'y' : 'ies'} from config`);
         // Refresh metadata so manageVirtualEntities can find the newly-created entities
         // in the cache — otherwise EntityByName() returns null and field sync is silently skipped
         const md = new Metadata();
         await md.Refresh();
      }

      const veResult = await this.manageVirtualEntities(pool)
      if (! veResult.success) {
         logError('   Error managing virtual entities');
         bSuccess = false;
      }

      // LLM-assisted virtual entity field decoration — identify PKs, FKs, and descriptions
      await this.decorateVirtualEntitiesWithLLM(pool, currentUser);

      // Config-driven IS-A relationship setup — set ParentID on child entities
      // Must run AFTER entities exist but BEFORE manageEntityFields() which calls manageParentEntityFields()
      const isaConfigResult = await this.processISARelationshipConfig(pool);
      if (isaConfigResult.updatedCount > 0) {
         logStatus(`    > Set ParentID on ${isaConfigResult.updatedCount} IS-A child entit${isaConfigResult.updatedCount === 1 ? 'y' : 'ies'} from config`);
      }

      // Config-driven Entity attribute updates (e.g., AllowMultipleSubtypes, TrackRecordChanges)
      // Must run AFTER entities exist
      const entityConfigResult = await this.processEntityConfigs(pool);
      if (entityConfigResult.updatedCount > 0) {
         logStatus(`    > Updated attributes on ${entityConfigResult.updatedCount} entit${entityConfigResult.updatedCount === 1 ? 'y' : 'ies'} from config`);
      }

      start = new Date();
      logStatus('   Syncing schema info from database...');
      if (! await this.updateSchemaInfoFromDatabase(pool, excludeSchemas)) {
         logError('   Error syncing schema info');
         bSuccess = false;
      }
      logStatus(`    > Synced schema info in ${(new Date().getTime() - start.getTime()) / 1000} seconds`);

      return bSuccess;
   }

   protected async manageVirtualEntities(pool: CodeGenConnection): Promise<{success: boolean, anyUpdates: boolean}> {
      let bSuccess = true;
      // virtual entities are records defined in the entity metadata and do NOT define a distinct base table
      // but they do specify a base view. We DO NOT generate a base view for a virtual entity, we simply use it to figure
      // out the fields that should be in the entity definition and add/update/delete the entity definition to match what's in the view when this runs
      const sql = `SELECT * FROM $\{this.qs(mj_core_schema(), \'vwEntities\')\} WHERE VirtualEntity = 1`;
      const virtualEntitiesResult = await pool.query(sql);
      const virtualEntities = virtualEntitiesResult.recordset;
      let anyUpdates: boolean = false;
      if (virtualEntities && virtualEntities.length > 0) {
         // we have 1+ virtual entities, now loop through them and process each one
         for (const ve of virtualEntities) {
            const {success, updatedEntity} = await this.manageSingleVirtualEntity(pool, ve);
            anyUpdates = anyUpdates || updatedEntity;
            if (! success) {
               logError(`   Error managing virtual entity ${ve.Name}`);
               bSuccess = false;
            }
         }
      }
      return {success: bSuccess, anyUpdates: anyUpdates};
   }

   protected async manageSingleVirtualEntity(pool: CodeGenConnection, virtualEntity: EntityInfo): Promise<{success: boolean, updatedEntity: boolean}> {
      let bSuccess = true;
      let bUpdated = false;
      try {
         // for a given virtual entity, we need to loop through the fields that exist in the current SQL definition for the view
         // and add/update/delete the entity fields to match what's in the view
         const sql = this.isPostgreSQL
            ? `SELECT
                  c.column_name AS "FieldName",
                  UPPER(c.data_type) AS "Type",
                  COALESCE(c.character_maximum_length, 0) AS "Length",
                  COALESCE(c.numeric_precision, 0) AS "Precision",
                  COALESCE(c.numeric_scale, 0) AS "Scale",
                  CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END AS "AllowsNull"
               FROM
                  information_schema.columns c
               WHERE
                  c.table_name = '${virtualEntity.BaseView}' AND
                  c.table_schema = '${virtualEntity.SchemaName}'
               ORDER BY
                  c.ordinal_position`
            : `SELECT
                  c.name AS FieldName, t.name AS Type, c.max_length AS Length, c.precision Precision, c.scale Scale, c.is_nullable AllowsNull
               FROM
                  sys.columns c
               INNER JOIN
                  sys.types t ON c.user_type_id = t.user_type_id
               INNER JOIN
                  sys.views v ON c.object_id = v.object_id
               WHERE
                  v.name = '${virtualEntity.BaseView}' AND
                  SCHEMA_NAME(v.schema_id) = '${virtualEntity.SchemaName}'
               ORDER BY
                  c.column_id`;
         const veFieldsResult = await pool.query(sql);
      const veFields = veFieldsResult.recordset;
         if (veFields && veFields.length > 0) {
            // we have 1+ fields, now loop through them and process each one
            // first though, remove any fields that are no longer in the view
            const md = new Metadata();
            const entity = md.EntityByName(virtualEntity.Name)
            if (entity) {
               const removeList = [];
               const fieldsToRemove = entity.Fields.filter(f => !veFields.find((vf: any) => vf.FieldName === f.Name));
               for (const f of fieldsToRemove) {
                  removeList.push(f.ID);
               }

               if (removeList.length > 0) {
                  const sqlRemove = `DELETE FROM $\{this.qs(mj_core_schema(), \'EntityField\')\} WHERE ID IN (${removeList.map(removeId => `'${removeId}'`).join(',')})`;
                  // this removes the fields that shouldn't be there anymore
                  await this.LogSQLAndExecute(pool, sqlRemove, `SQL text to remove fields from entity ${virtualEntity.Name}`);
                  bUpdated = true;
               }

               // check to see if any of the fields in the virtual entity have Pkey attribute set. If not, we will default to the first field
               // as pkey and user can change this.
               const hasPkey = entity.Fields.find(f => f.IsPrimaryKey) !== undefined;

               // now create/update the fields that are in the view
               for (let i = 0; i < veFields.length; i++) {
                  const vef = veFields[i];
                  const {success, updatedField} = await this.manageSingleVirtualEntityField(pool, virtualEntity, vef, i + 1, !hasPkey && i === 0);
                  bUpdated = bUpdated || updatedField;
                  if (!success) {
                     logError(`Error managing virtual entity field ${vef.FieldName} for virtual entity ${virtualEntity.Name}`);
                     bSuccess = false;
                  }
               }
            }
         }

         if (bUpdated) {
            // finally make sure we update the UpdatedAt field for the entity if we made changes to its fields
            const sqlUpdate = `UPDATE $\{this.qs(mj_core_schema(), \'Entity\')\} SET ${this.qi(EntityInfo.UpdatedAtFieldName)}=${this.utcNow()} WHERE ID='${virtualEntity.ID}'`;
            await this.LogSQLAndExecute(pool, sqlUpdate, `SQL text to update virtual entity updated date for ${virtualEntity.Name}`);
         }

         return {success: bSuccess, updatedEntity: bUpdated};
      }
      catch (e: any) {
         logError(e);
         return {success: false, updatedEntity: bUpdated};
      }
   }

   protected async manageSingleVirtualEntityField(pool: CodeGenConnection, virtualEntity: any, veField: any, fieldSequence: number, makePrimaryKey: boolean): Promise<{success: boolean, updatedField: boolean, newFieldID: string | null}> {
      // this protected checks to see if the field exists in the entity definition, and if not, adds it
      // if it exist it updates the entity field to match the view's data type and nullability attributes

      // first, get the entity definition
      const md = new Metadata();
      const entity = md.EntityByName(virtualEntity.Name);
      let newEntityFieldUUID = null;
      let didUpdate: boolean = false;
      if (entity) {
         const field = entity.Fields.find(f => f.Name.trim().toLowerCase() === veField.FieldName.trim().toLowerCase());
         if (field) {
            // have a match, so the field exists in the entity definition, now check to see if it needs to be updated
            if (makePrimaryKey ||
                field.Type.trim().toLowerCase() !== veField.Type.trim().toLowerCase() ||
                field.Length !== veField.Length ||
                field.AllowsNull !== veField.AllowsNull ||
                field.Scale !== veField.Scale ||
                field.Precision !== veField.Precision ||
                field.Sequence !== fieldSequence) {
               // the field needs to be updated, so update it
               const sqlUpdate = `UPDATE
                                    $\{this.qs(mj_core_schema(), \'EntityField\')\}
                                  SET
                                    Sequence=${fieldSequence},
                                    Type='${veField.Type}',
                                    AllowsNull=${veField.AllowsNull ? 1 : 0},
                                    ${makePrimaryKey ? 'IsPrimaryKey=1,IsUnique=1,' : ''}
                                    Length=${veField.Length},
                                    Precision=${veField.Precision},
                                    Scale=${veField.Scale}
                                  WHERE
                                    ID = '${field.ID}'`; // don't need to update the __mj_UpdatedAt field here, that happens automatically via the trigger

               await this.LogSQLAndExecute(pool, sqlUpdate, `SQL text to update virtual entity field ${veField.FieldName} for entity ${virtualEntity.Name}`);
               didUpdate = true;
            }
         }
         else {
            // this means that we do NOT have a match so the field does not exist in the entity definition, so we need to add it
            newEntityFieldUUID = this.createNewUUID();
            const sqlAdd = `INSERT INTO $\{this.qs(mj_core_schema(), \'EntityField\')\} (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '${newEntityFieldUUID}', '${entity.ID}', '${veField.FieldName}', '${veField.Type}', ${veField.AllowsNull ? 1 : 0},
                                       ${veField.Length}, ${veField.Precision}, ${veField.Scale},
                                       ${fieldSequence}, ${makePrimaryKey ? 1 : 0}, ${makePrimaryKey ? 1 : 0}
                                    )`;
            await this.LogSQLAndExecute(pool, sqlAdd, `SQL text to add virtual entity field ${veField.FieldName} for entity ${virtualEntity.Name}`);
            didUpdate = true;
         }
      }
      return {success: true, updatedField: didUpdate, newFieldID: newEntityFieldUUID};
   }

   /**
    * Iterates over all virtual entities and applies LLM-assisted field decoration
    * to identify primary keys, foreign keys, and field descriptions.
    * Only runs if the VirtualEntityFieldDecoration advanced generation feature is enabled.
    * Idempotent: skips entities that already have soft PK/FK annotations.
    */
   protected async decorateVirtualEntitiesWithLLM(pool: CodeGenConnection, currentUser: UserInfo): Promise<void> {
      const ag = new AdvancedGeneration();
      if (!ag.featureEnabled('VirtualEntityFieldDecoration')) {
         return; // Feature not enabled, nothing to do
      }

      const md = new Metadata();
      const virtualEntities = md.Entities.filter(e => e.VirtualEntity);
      if (virtualEntities.length === 0) {
         return;
      }

      // Pre-build available entities list once (shared across all virtual entity decorations)
      const availableEntities = md.Entities
         .filter(e => !e.VirtualEntity && e.PrimaryKeys.length > 0)
         .map(e => ({
            Name: e.Name,
            SchemaName: e.SchemaName,
            BaseTable: e.BaseTable,
            PrimaryKeyField: e.PrimaryKeys[0]?.Name || 'ID'
         }));

      logStatus(`   Decorating virtual entity fields with LLM (${virtualEntities.length} entities)...`);
      let decoratedCount = 0;
      let skippedCount = 0;

      // Process in batches of up to 5 in parallel for better throughput
      const batchSize = 5;
      for (let i = 0; i < virtualEntities.length; i += batchSize) {
         const batch = virtualEntities.slice(i, i + batchSize);
         const results = await Promise.all(
            batch.map(entity => this.decorateSingleVirtualEntityWithLLM(pool, entity, ag, currentUser, availableEntities))
         );
         for (const result of results) {
            if (result.decorated) {
               decoratedCount++;
            } else if (result.skipped) {
               skippedCount++;
            }
         }
      }

      if (decoratedCount > 0 || skippedCount > 0) {
         logStatus(`    > LLM field decoration: ${decoratedCount} decorated, ${skippedCount} skipped (already annotated)`);
      }
   }

   /**
    * Applies LLM-assisted field decoration to a single virtual entity.
    * Parses the view SQL to identify source entities, enriches the LLM prompt with their
    * field metadata (descriptions, categories), then applies PKs, FKs, descriptions, and categories.
    * @returns Whether the entity was decorated, skipped, or encountered an error.
    */
   protected async decorateSingleVirtualEntityWithLLM(
      pool: CodeGenConnection,
      entity: EntityInfo,
      ag: AdvancedGeneration,
      currentUser: UserInfo,
      availableEntities: Array<{ Name: string; SchemaName: string; BaseTable: string; PrimaryKeyField: string }>
   ): Promise<{ decorated: boolean; skipped: boolean }> {
      try {
         // Idempotency check: if entity already has soft PK or soft FK annotations, skip
         // unless forceRegenerate option is enabled on this feature
         const feature = ag.getFeature('VirtualEntityFieldDecoration');
         const forceRegenerate = feature?.options?.find(o => o.name === 'forceRegenerate')?.value === true;
         const hasSoftAnnotations = entity.Fields.some(f => f.IsSoftPrimaryKey || f.IsSoftForeignKey);
         if (hasSoftAnnotations && !forceRegenerate) {
            return { decorated: false, skipped: true };
         }

         // Get view definition from SQL Server
         const viewDefSQL = this.isPostgreSQL
            ? `SELECT pg_get_viewdef('"${entity.SchemaName}"."${entity.BaseView}"'::regclass, true) AS "ViewDef"`
            : `SELECT OBJECT_DEFINITION(OBJECT_ID('${this.qs(entity.SchemaName, entity.BaseView)}')) AS ViewDef`;
         const viewDefResult = await pool.query(viewDefSQL);
         const viewDefinition = viewDefResult.recordset[0]?.ViewDef;
         if (!viewDefinition) {
            logStatus(`         Could not get view definition for ${entity.SchemaName}.${entity.BaseView} — skipping LLM decoration`);
            return { decorated: false, skipped: false };
         }

         // Parse the view SQL to identify referenced tables, then resolve to entities
         const sourceEntities = this.buildSourceEntityContext(viewDefinition);

         // Build field info for the prompt
         const fields = entity.Fields.map(f => ({
            Name: f.Name,
            Type: f.Type,
            Length: f.Length,
            AllowsNull: f.AllowsNull,
            IsPrimaryKey: f.IsPrimaryKey,
            RelatedEntityName: f.RelatedEntity || null
         }));

         // Call the LLM with enriched source entity context
         const result = await ag.decorateVirtualEntityFields(
            entity.Name,
            entity.SchemaName,
            entity.BaseView,
            viewDefinition,
            entity.Description || '',
            fields,
            availableEntities,
            sourceEntities,
            currentUser
         );

         if (!result) {
            return { decorated: false, skipped: false };
         }

         // Apply results to EntityField records
         const schema = mj_core_schema();
         let anyUpdated = false;

         // Apply primary keys
         anyUpdated = await this.applyLLMPrimaryKeys(pool, entity, result.primaryKeys, schema) || anyUpdated;

         // Apply foreign keys
         anyUpdated = await this.applyLLMForeignKeys(pool, entity, result.foreignKeys, schema) || anyUpdated;

         // Apply field descriptions
         anyUpdated = await this.applyLLMFieldDescriptions(pool, entity, result.fieldDescriptions, schema) || anyUpdated;

         // Apply categories using the shared methods (same stability rules as regular entities)
         anyUpdated = await this.applyVEFieldCategories(pool, entity, result) || anyUpdated;

         if (anyUpdated) {
            const sqlUpdate = `UPDATE $\{this.qs(schema, \'Entity\')\} SET ${this.qi(EntityInfo.UpdatedAtFieldName)}=${this.utcNow()} WHERE ID='${entity.ID}'`;
            await this.LogSQLAndExecute(pool, sqlUpdate, `Update entity timestamp for ${entity.Name} after LLM decoration`);
         }

         return { decorated: anyUpdated, skipped: false };
      } catch (e) {
         logError(`   Error decorating virtual entity ${entity.Name} with LLM: ${e}`);
         return { decorated: false, skipped: false };
      }
   }

   /**
    * Parses a view definition SQL and resolves referenced tables to MJ entities.
    * Returns enriched source entity context (all fields with descriptions and categories)
    * for the LLM to use when decorating virtual entity fields.
    */
   protected buildSourceEntityContext(viewDefinition: string): Array<{
      Name: string;
      Description: string;
      Fields: Array<{
         Name: string;
         Type: string;
         Description: string;
         Category: string | null;
         IsPrimaryKey: boolean;
         IsForeignKey: boolean;
      }>;
   }> {
      const parseResult = SQLParser.Parse(viewDefinition);
      const md = new Metadata();
      const sourceEntities: Array<{
         Name: string;
         Description: string;
         Fields: Array<{
            Name: string;
            Type: string;
            Description: string;
            Category: string | null;
            IsPrimaryKey: boolean;
            IsForeignKey: boolean;
         }>;
      }> = [];

      const seen = new Set<string>();

      for (const tableRef of parseResult.Tables) {
         // Match against MJ entities by BaseTable/BaseView + SchemaName
         const matchingEntity = md.Entities.find(e =>
            (e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase() ||
             e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase()) &&
            e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
         );

         if (matchingEntity && !seen.has(matchingEntity.ID)) {
            seen.add(matchingEntity.ID);
            sourceEntities.push({
               Name: matchingEntity.Name,
               Description: matchingEntity.Description || '',
               Fields: matchingEntity.Fields.map(f => ({
                  Name: f.Name,
                  Type: f.Type,
                  Description: f.Description || '',
                  Category: f.Category || null,
                  IsPrimaryKey: f.IsPrimaryKey,
                  IsForeignKey: !!(f.RelatedEntityID)
               }))
            });
         }
      }

      return sourceEntities;
   }

   /**
    * Applies category assignments from VE decoration results using the shared category methods.
    * Loads field records from DB (needs ID, Name, Category, AutoUpdateCategory, AutoUpdateDisplayName)
    * then delegates to the shared methods.
    */
   protected async applyVEFieldCategories(
      pool: CodeGenConnection,
      entity: EntityInfo,
      result: VirtualEntityDecorationResult
   ): Promise<boolean> {
      // Check if the LLM returned any category data
      const hasCategories = result.fieldDescriptions?.some(fd => fd.category);
      if (!hasCategories) {
         return false;
      }

      // Load VE EntityField rows from DB (we need the ID and auto-update flags)
      const schema = mj_core_schema();
      const fieldsSQL = `
         SELECT ID, Name, Category, AutoUpdateCategory, AutoUpdateDisplayName, GeneratedFormSection, DisplayName, ExtendedType, CodeType
         FROM $\{this.qs(schema, \'EntityField\')\}
         WHERE EntityID = '${entity.ID}'
      `;
      const fieldsResult = await pool.query(fieldsSQL);
      const dbFields = fieldsResult.recordset as Array<{
         ID: string; Name: string; Category: string | null; AutoUpdateCategory: boolean; 
         AutoUpdateDisplayName: boolean, GeneratedFormSection: string, DisplayName: string, 
         ExtendedType: string, CodeType: string
      }>;

      if (dbFields.length === 0) return false;

      // Convert VE decoration field descriptions into the format expected by applyFieldCategories
      const fieldCategories = result.fieldDescriptions
         .filter(fd => fd.category)
         .map(fd => ({
            fieldName: fd.fieldName,
            category: fd.category!,
            displayName: fd.displayName || undefined,
            extendedType: fd.extendedType,
            codeType: fd.codeType
         }));

      if (fieldCategories.length === 0) return false;

      const existingCategories = this.buildExistingCategorySet(dbFields);
      await this.applyFieldCategories(pool, entity, dbFields, fieldCategories, existingCategories);

      // Apply entity icon if provided
      if (result.entityIcon) {
         await this.applyEntityIcon(pool, entity.ID, result.entityIcon);
      }

      // Apply category info settings if provided
      if (result.categoryInfo && Object.keys(result.categoryInfo).length > 0) {
         await this.applyCategoryInfoSettings(pool, entity.ID, result.categoryInfo);
      }

      logStatus(`         Applied categories for VE ${entity.Name} (${fieldCategories.length} fields)`);
      return true;
   }

   /**
    * Applies LLM-identified primary keys to entity fields.
    * Sets IsPrimaryKey=1 and IsSoftPrimaryKey=1 for identified fields.
    * First clears any default PK that was set by field-sync (field #1 fallback).
    * All SQL updates are batched into a single execution for performance.
    */
   protected async applyLLMPrimaryKeys(
      pool: CodeGenConnection,
      entity: EntityInfo,
      primaryKeys: string[],
      schema: string
   ): Promise<boolean> {
      if (!primaryKeys || primaryKeys.length === 0) {
         return false;
      }

      // Validate that all identified PK fields exist on the entity
      const validPKs = primaryKeys.filter(pk =>
         entity.Fields.some(f => f.Name.toLowerCase() === pk.toLowerCase())
      );
      if (validPKs.length === 0) {
         return false;
      }

      // Build batched SQL: clear default PK + set all LLM-identified PKs
      const sqlStatements: string[] = [];

      // Clear existing default PK (field #1 fallback) before applying LLM-identified PKs
      sqlStatements.push(`UPDATE $\{this.qs(schema, \'EntityField\')\}
                        SET IsPrimaryKey=0, IsUnique=0
                        WHERE EntityID='${entity.ID}' AND IsPrimaryKey=1 AND IsSoftPrimaryKey=0`);

      // Set LLM-identified PKs
      for (const pk of validPKs) {
         sqlStatements.push(`UPDATE $\{this.qs(schema, \'EntityField\')\}
                         SET IsPrimaryKey=1, IsUnique=1, IsSoftPrimaryKey=1
                         WHERE EntityID='${entity.ID}' AND Name='${pk}'`);
         logStatus(`         ✓ Set PK for ${entity.Name}.${pk} (LLM-identified)`);
      }

      await this.LogSQLAndExecute(pool, sqlStatements.join('\n'), `Set LLM-identified PKs for ${entity.Name}: ${validPKs.join(', ')}`);
      return true;
   }

   /**
    * Applies LLM-identified foreign keys to entity fields.
    * Sets RelatedEntityID, RelatedEntityFieldName, and IsSoftForeignKey=1.
    * Only applies high and medium confidence FKs.
    * All SQL updates are batched into a single execution for performance.
    */
   protected async applyLLMForeignKeys(
      pool: CodeGenConnection,
      entity: EntityInfo,
      foreignKeys: VirtualEntityDecorationResult['foreignKeys'],
      schema: string
   ): Promise<boolean> {
      if (!foreignKeys || foreignKeys.length === 0) {
         return false;
      }

      const md = new Metadata();
      const sqlStatements: string[] = [];

      for (const fk of foreignKeys) {
         // Only apply high/medium confidence
         if (fk.confidence !== 'high' && fk.confidence !== 'medium') {
            continue;
         }

         // Validate that the field exists on this entity
         const field = entity.Fields.find(f => f.Name.toLowerCase() === fk.fieldName.toLowerCase());
         if (!field) {
            continue;
         }

         // Skip if field already has a FK set (config-defined takes precedence)
         if (field.RelatedEntityID) {
            continue;
         }

         // Look up the related entity by name
         const relatedEntity = md.EntityByName(fk.relatedEntityName);
         if (!relatedEntity) {
            logStatus(`         ⚠️  LLM FK: related entity '${fk.relatedEntityName}' not found for ${entity.Name}.${fk.fieldName}`);
            continue;
         }

         sqlStatements.push(`UPDATE $\{this.qs(schema, \'EntityField\')\}
                         SET RelatedEntityID='${relatedEntity.ID}',
                             RelatedEntityFieldName='${fk.relatedFieldName}',
                             IsSoftForeignKey=1
                         WHERE EntityID='${entity.ID}' AND Name='${field.Name}'`);
         logStatus(`         ✓ Set FK for ${entity.Name}.${field.Name} → ${fk.relatedEntityName}.${fk.relatedFieldName} (${fk.confidence}, LLM)`);
      }

      if (sqlStatements.length === 0) {
         return false;
      }

      await this.LogSQLAndExecute(pool, sqlStatements.join('\n'), `Set LLM-identified FKs for ${entity.Name}`);
      return true;
   }

   /**
    * Applies LLM-generated field descriptions to entity fields that lack descriptions.
    * All SQL updates are batched into a single execution for performance.
    */
   protected async applyLLMFieldDescriptions(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fieldDescriptions: VirtualEntityDecorationResult['fieldDescriptions'],
      schema: string
   ): Promise<boolean> {
      if (!fieldDescriptions || fieldDescriptions.length === 0) {
         return false;
      }

      const sqlStatements: string[] = [];

      for (const fd of fieldDescriptions) {
         const field = entity.Fields.find(f => f.Name.toLowerCase() === fd.fieldName.toLowerCase());
         if (!field) {
            continue;
         }

         // Only apply if field doesn't already have a description
         if (field.Description && field.Description.trim().length > 0) {
            continue;
         }

         const escapedDescription = fd.description.replace(/'/g, "''");
         let setClauses = `Description='${escapedDescription}'`;

         // Apply extended type if provided and valid
         if (fd.extendedType) {
            const validExtendedType = this.validateExtendedType(fd.extendedType);
            if (validExtendedType) {
               setClauses += `, ExtendedType='${validExtendedType}'`;
            }
         }

         sqlStatements.push(`UPDATE $\{this.qs(schema, \'EntityField\')\}
                         SET ${setClauses}
                         WHERE EntityID='${entity.ID}' AND Name='${field.Name}'`);
      }

      if (sqlStatements.length === 0) {
         return false;
      }

      await this.LogSQLAndExecute(pool, sqlStatements.join('\n'), `Set LLM-generated descriptions for ${entity.Name} (${sqlStatements.length} fields)`);
      return true;
   }

   /**
    * Valid values for EntityField.ExtendedType, plus common LLM aliases mapped to valid values.
    */
   private static readonly VALID_EXTENDED_TYPES = new Set([
      'Code', 'Email', 'FaceTime', 'Geo', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg'
   ]);

   private static readonly EXTENDED_TYPE_ALIASES: Record<string, string> = {
      'phone': 'Tel',
      'telephone': 'Tel',
      'website': 'URL',
      'link': 'URL',
      'hyperlink': 'URL',
      'mail': 'Email',
      'e-mail': 'Email',
      'text': 'SMS',
      'location': 'Geo',
      'address': 'Geo',
      'teams': 'MSTeams',
      'facetime': 'FaceTime',
      'zoom': 'ZoomMtg',
      'whatsapp': 'WhatsApp',
      'skype': 'Skype',
   };

   /**
    * Validates an LLM-suggested ExtendedType against the allowed values in EntityField.
    * Returns the valid value (case-corrected) or null if invalid.
    */
   protected validateExtendedType(suggested: string): string | null {
      // Direct match (case-insensitive)
      for (const valid of ManageMetadataBase.VALID_EXTENDED_TYPES) {
         if (valid.toLowerCase() === suggested.toLowerCase()) {
            return valid;
         }
      }
      // Check aliases
      const alias = ManageMetadataBase.EXTENDED_TYPE_ALIASES[suggested.toLowerCase()];
      if (alias) {
         return alias;
      }
      return null;
   }

   /**
    * Manages virtual EntityField records for IS-A parent entity fields.
    * For each entity with ParentID set (IS-A child), creates/updates virtual field records
    * that mirror the parent entity's base table fields (excluding PKs, timestamps, and virtual fields).
    * Runs collision detection to prevent child table columns from shadowing parent fields.
    */
   protected async manageParentEntityFields(pool: CodeGenConnection): Promise<{success: boolean, anyUpdates: boolean}> {
      let bSuccess = true;
      let anyUpdates = false;

      const md = new Metadata();
      const childEntities = md.Entities.filter(e => e.IsChildType);

      if (childEntities.length === 0) {
         return { success: true, anyUpdates: false };
      }

      logStatus(`   Processing IS-A parent fields for ${childEntities.length} child entit${childEntities.length === 1 ? 'y' : 'ies'}...`);

      for (const childEntity of childEntities) {
         try {
            const { success, updated } = await this.manageSingleEntityParentFields(pool, childEntity);
            anyUpdates = anyUpdates || updated;
            if (!success) {
               logError(`   Error managing IS-A parent fields for ${childEntity.Name}`);
               bSuccess = false;
            }
         } catch (e) {
            logError(`   Exception managing IS-A parent fields for ${childEntity.Name}: ${e}`);
            bSuccess = false;
         }
      }

      return { success: bSuccess, anyUpdates };
   }

   /**
    * Creates/updates virtual EntityField records for a single child entity's parent fields.
    * Detects field name collisions between child's own base table columns and parent fields.
    */
   protected async manageSingleEntityParentFields(pool: CodeGenConnection, childEntity: EntityInfo): Promise<{success: boolean, updated: boolean}> {
      let bUpdated = false;

      // Get all parent fields: non-PK, non-__mj_, non-virtual from each parent in chain
      const parentFields = childEntity.AllParentFields;
      if (parentFields.length === 0) {
         return { success: true, updated: false };
      }

      // Get child's own (non-virtual) field names for collision detection
      const childOwnFieldNames = new Set(
         childEntity.Fields.filter(f => !f.IsVirtual).map(f => f.Name.toLowerCase())
      );

      for (const parentField of parentFields) {
         // Collision detection: child's own base table column has same name as parent field.
         // This uses in-memory metadata which filters to non-virtual (base table) fields only.
         if (childOwnFieldNames.has(parentField.Name.toLowerCase())) {
            logError(
               `   FIELD COLLISION: Entity '${childEntity.Name}' has its own column '${parentField.Name}' ` +
               `that conflicts with IS-A parent field '${parentField.Name}' from '${parentField.Entity}'. ` +
               `Rename the child column to resolve this collision. Skipping IS-A field sync for this entity.`
            );
            return { success: false, updated: false };
         }

         // Check the DATABASE for existing field record — in-memory metadata may be stale
         // (e.g. createNewEntityFieldsFromSchema may have already added this field from the view)
         const existsResult = await pool.queryWithParams(`SELECT ID, IsVirtual, Type, Length, Precision, Scale, AllowsNull, AllowUpdateAPI
                    FROM $\{this.qs(mj_core_schema(), \'EntityField\')\}
                    WHERE EntityID = @EntityID AND Name = @FieldName`,
               { 'EntityID': childEntity.ID, 'FieldName': parentField.Name }
               );

         if (existsResult.recordset.length > 0) {
            // Field already exists — update it to ensure it's marked as a virtual IS-A field
            const existingRow = existsResult.recordset[0];
            const needsUpdate = !existingRow.IsVirtual ||
               existingRow.Type?.trim().toLowerCase() !== parentField.Type.trim().toLowerCase() ||
               existingRow.Length !== parentField.Length ||
               existingRow.Precision !== parentField.Precision ||
               existingRow.Scale !== parentField.Scale ||
               existingRow.AllowsNull !== parentField.AllowsNull ||
               !existingRow.AllowUpdateAPI;

            if (needsUpdate) {
               const sqlUpdate = `UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\}
                  SET IsVirtual=1,
                      Type='${parentField.Type}',
                      Length=${parentField.Length},
                      Precision=${parentField.Precision},
                      Scale=${parentField.Scale},
                      AllowsNull=${parentField.AllowsNull ? 1 : 0},
                      AllowUpdateAPI=1
                  WHERE ID='${existingRow.ID}'`;
               await this.LogSQLAndExecute(pool, sqlUpdate,
                  `Update IS-A parent field ${parentField.Name} on ${childEntity.Name}`);
               bUpdated = true;
            }
         } else {
            // Create new virtual field record for this parent field
            const newFieldID = this.createNewUUID();
            // Use high sequence — will be reordered by updateExistingEntityFieldsFromSchema
            const sequence = 100000 + parentFields.indexOf(parentField);

            const sqlInsert = `INSERT INTO $\{this.qs(mj_core_schema(), \'EntityField\')\} (
                  ID, EntityID, Name, Type, AllowsNull,
                  Length, Precision, Scale,
                  Sequence, IsVirtual, AllowUpdateAPI,
                  IsPrimaryKey, IsUnique)
               VALUES (
                  '${newFieldID}', '${childEntity.ID}', '${parentField.Name}',
                  '${parentField.Type}', ${parentField.AllowsNull ? 1 : 0},
                  ${parentField.Length}, ${parentField.Precision}, ${parentField.Scale},
                  ${sequence}, 1, 1, 0, 0)`;
            await this.LogSQLAndExecute(pool, sqlInsert,
               `Create IS-A parent field ${parentField.Name} on ${childEntity.Name}`);
            bUpdated = true;
         }
      }

      // Remove stale IS-A parent virtual fields no longer in the parent chain.
      // IS-A parent fields are identified by IsVirtual=true AND AllowUpdateAPI=true.
      const currentParentFieldNames = new Set(parentFields.map(f => f.Name.toLowerCase()));
      const staleFields = childEntity.Fields.filter(f =>
         f.IsVirtual && f.AllowUpdateAPI &&
         !f.IsPrimaryKey && !f.Name.startsWith('__mj_') &&
         !currentParentFieldNames.has(f.Name.toLowerCase())
      );

      for (const staleField of staleFields) {
         const sqlDelete = `DELETE FROM $\{this.qs(mj_core_schema(), \'EntityField\')\} WHERE ID='${staleField.ID}'`;
         await this.LogSQLAndExecute(pool, sqlDelete,
            `Remove stale IS-A parent field ${staleField.Name} from ${childEntity.Name}`);
         bUpdated = true;
      }

      if (bUpdated) {
         const sqlUpdate = `UPDATE $\{this.qs(mj_core_schema(), \'Entity\')\} SET ${this.qi(EntityInfo.UpdatedAtFieldName)}=${this.utcNow()} WHERE ID='${childEntity.ID}'`;
         await this.LogSQLAndExecute(pool, sqlUpdate,
            `Update entity timestamp for ${childEntity.Name} after IS-A field sync`);
      }

      return { success: true, updated: bUpdated };
   }

   /**
    * Checks if an existing virtual parent field record needs to be updated to match the parent field.
    */
   protected parentFieldNeedsUpdate(existing: EntityFieldInfo, parentField: EntityFieldInfo): boolean {
      return existing.Type.trim().toLowerCase() !== parentField.Type.trim().toLowerCase() ||
         existing.Length !== parentField.Length ||
         existing.Precision !== parentField.Precision ||
         existing.Scale !== parentField.Scale ||
         existing.AllowsNull !== parentField.AllowsNull ||
         !existing.AllowUpdateAPI;
   }


   /**
    * This method creates and updates relationships in the metadata based on foreign key relationships in the database.
    * @param pool
    * @param excludeSchemas - specify any schemas to exclude here and any relationships to/from the specified schemas will be ignored
    * @param md
    * @returns
    */
   protected async manageEntityRelationships(pool: CodeGenConnection, excludeSchemas: string[], md: Metadata, batchItems: number = 5): Promise<boolean> {
      let bResult: boolean = true;
      bResult = bResult && await this.manageManyToManyEntityRelationships(pool, excludeSchemas, batchItems);
      bResult = bResult && await this.manageOneToManyEntityRelationships(pool, excludeSchemas, md, batchItems);
      return bResult;
   }

   /**
    * Manages 1->M relationships between entities in the metadata based on foreign key relationships in the database.
    * @param pool
    * @param excludeSchemas - specify any schemas to exclude here and any relationships to/from the specified schemas will be ignored
    * @param md
    * @returns
    */
   protected async manageOneToManyEntityRelationships(pool: CodeGenConnection, excludeSchemas: string[],  md: Metadata, batchItems: number = 5): Promise<boolean> {
      // the way this works is that we look for entities in our catalog and we look for
      // foreign keys in those entities. For example, if we saw an entity called Persons and that entity
      // had a foreign key linking to an entity called Organizations via a field called OrganizationID, then we would create a relationship
      // record in the EntityRelationship table for that relationships. In that example we would create the
      // relationship record with the following values:
      //   EntityID = ID of Organizations entity
      //   RelatedEntityID = ID of Persons entity
      //   RelatedEntityJoinField = OrganizationID
      //   Type = "One To Many"
      //   BundleInAPI = 1
      //   DisplayInForm = 1
      //   DisplayName = Persons (name of the entity)

      try {
         // STEP 1 - search for all foreign keys in the vwEntityFields view, we use the RelatedEntityID field to determine our FKs
         const sSQL = `SELECT *
                       FROM ${mj_core_schema()}.vwEntityFields
                       WHERE
                             RelatedEntityID IS NOT NULL AND
                             IsVirtual = 0 AND
                             EntityID NOT IN (SELECT ID FROM ${mj_core_schema()}.Entity WHERE SchemaName IN (${excludeSchemas.map(s => `'${s}'`).join(',')}))
                       ORDER BY RelatedEntityID`;
         const entityFieldsResult = await pool.query(sSQL);
         const entityFields = entityFieldsResult.recordset;

         // Get the relationship counts for each entity
         const sSQLRelationshipCount = `SELECT EntityID, COUNT(*) AS Count FROM ${mj_core_schema()}.EntityRelationship GROUP BY EntityID`;
         const relationshipCountsResult = await pool.query(sSQLRelationshipCount);
         const relationshipCounts = relationshipCountsResult.recordset;

         const relationshipCountMap = new Map<number, number>();
         for (const rc of relationshipCounts) {
            relationshipCountMap.set(rc.EntityID, rc.Count);
         }

         // get all relationships in one query for performance improvement
         const sSQLRelationship = `SELECT * FROM ${mj_core_schema()}.EntityRelationship`;
         const allRelationshipsResult = await pool.query(sSQLRelationship);
         const allRelationships = allRelationshipsResult.recordset;


         // Function to process a batch of entity fields
         const processBatch = async (batch: any[]) => {
            let batchSQL = '';
            batch.forEach((f) => {
               // for each field determine if an existing relationship exists, if not, create it
               const relationships = allRelationships.filter((r: { EntityID: any; RelatedEntityID: any; }) => r.EntityID===f.RelatedEntityID && r.RelatedEntityID===f.EntityID);
               if (relationships && relationships.length === 0) {
                  // no relationship exists, so create it
                  const e = md.Entities.find(e => e.ID === f.EntityID)!;
                  const parentEntity = md.Entities.find(e => e.ID === f.RelatedEntityID);
                  const parentEntityName = parentEntity ? parentEntity.Name : f.RelatedEntityID;
                  // calculate the sequence by getting the count of existing relationships for the entity and adding 1 and then increment the count for future inserts in this loop
                  const relCount = relationshipCountMap.get(f.EntityID) || 0;
                  const sequence = relCount + 1;
                  const newEntityRelationshipUUID = this.createNewUUID();
                  if (this.isPostgreSQL) {
                  batchSQL += `
/* Create Entity Relationship: \${parentEntityName} -> \${e.Name} (One To Many via \${f.Name}) */
   INSERT INTO \${mj_core_schema()}."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
   SELECT '\${newEntityRelationshipUUID}', '\${f.RelatedEntityID}', '\${f.EntityID}', '\${f.Name}', 'One To Many', true, true, '\${e.Name}', \${sequence}
   WHERE NOT EXISTS (SELECT 1 FROM \${this.qs(mj_core_schema(), 'EntityRelationship')} WHERE "ID" = '\${newEntityRelationshipUUID}');
                              `;
               } else {
                  batchSQL += `
/* Create Entity Relationship: \${parentEntityName} -> \${e.Name} (One To Many via \${f.Name}) */
   IF NOT EXISTS (
      SELECT 1
      FROM \${this.qs(mj_core_schema(), 'EntityRelationship')}
      WHERE ID = '\${newEntityRelationshipUUID}'
   )
   BEGIN
      INSERT INTO \${mj_core_schema()}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('\${newEntityRelationshipUUID}', '\${f.RelatedEntityID}', '\${f.EntityID}', '\${f.Name}', 'One To Many', 1, 1, '\${e.Name}', \${sequence});
   END
                              `;
               }
                  // now update the map for the relationship count
                  relationshipCountMap.set(f.EntityID, sequence);
               }
            });

            if (batchSQL.length > 0){
               await this.LogSQLAndExecute(pool, batchSQL);
            }
         };

         // Split entityFields into batches and process each batch
         for (let i = 0; i < entityFields.length; i += batchItems) {
               const batch = entityFields.slice(i, i + batchItems);
               await processBatch(batch);
         }

         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }


   /**
    * This method will look for situations where entity metadata exist in the entities metadata table but the underlying table has been deleted. In this case, the metadata for the entity
    * should be removed. This method is called as part of the manageMetadata method and is not intended to be called directly.
    * @param ds
    * @param excludeSchemas
    */
   protected async checkAndRemoveMetadataForDeletedTables(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sql = `SELECT * FROM ${mj_core_schema()}.vwEntitiesWithMissingBaseTables WHERE VirtualEntity=0`
         const entitiesResult = await pool.query(sql);
         const entities = <EntityInfo[]>entitiesResult.recordset;
         if (entities && entities.length > 0) {
            for (const e of entities) {
               // for the given entity, wipe out the entity metadata and its core deps.
               // the below could fail if there are non-core dependencies on the entity, but that's ok, we will flag that in the console
               // for the admin to handle manually
               try {
                  const sqlDelete = this.isPostgreSQL
                     ? `SELECT * FROM ${mj_core_schema()}."spDeleteEntityWithCoreDependencies"('${e.ID}')`
                     : `__mj.spDeleteEntityWithCoreDependencies @EntityID='${e.ID}'`;
                  await this.LogSQLAndExecute(pool, sqlDelete, `SQL text to remove entity ${e.Name}`);
                  logStatus(`      > Removed metadata for table ${e.SchemaName}.${e.BaseTable}`);

                  // next up we need to remove the spCreate, spDelete, spUpdate, BaseView, and FullTextSearchFunction, if provided.
                  // We only remoe these artifcacts when they are generated which is info we have in the BaseViewGenerated, spCreateGenerated, etc. fields
                  await this.checkDropSQLObject(pool, e.BaseViewGenerated, 'view', e.SchemaName, e.BaseView);
                  await this.checkDropSQLObject(pool, e.spCreateGenerated, 'procedure', e.SchemaName, e.spCreate ? e.spCreate : `spCreate${e.BaseTableCodeName}`);
                  await this.checkDropSQLObject(pool, e.spDeleteGenerated, 'procedure', e.SchemaName, e.spDelete ? e.spDelete : `spDelete${e.BaseTableCodeName}`);
                  await this.checkDropSQLObject(pool, e.spUpdateGenerated, 'procedure', e.SchemaName, e.spUpdate ? e.spUpdate : `spUpdate${e.BaseTableCodeName}`);
                  await this.checkDropSQLObject(pool, e.FullTextSearchFunctionGenerated, 'function', e.SchemaName, e.FullTextSearchFunction);
               }
               catch (ex) {
                  logError(`Error removing metadata for entity ${(ex as any).Name}, error: ${ex}`);
               }
            }

            // if we get here we now need to refresh our metadata object
            const md = new Metadata();
            await md.Refresh();
         }
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   protected async checkDropSQLObject(pool: CodeGenConnection, proceed: boolean, type: 'procedure' | 'view' | 'function', schemaName: string, name: string) {
      try {
         if (proceed && schemaName && name && schemaName.trim().length > 0 && name.trim().length > 0) {
            // Use IF OBJECT_ID pattern for Flyway compatibility
            // Object type codes: P = Stored Procedure, V = View, FN = Scalar Function, IF/TF = Table-Valued Function
            const upperType = type.toUpperCase() as 'VIEW' | 'PROCEDURE' | 'FUNCTION';
            let sqlDelete: string;
            if (this.isPostgreSQL) {
               const typeStr = upperType === 'PROCEDURE' ? 'FUNCTION' : upperType;
               sqlDelete = `DROP ${typeStr} IF EXISTS ${this.qs(schemaName, name)}${upperType !== 'VIEW' ? ' CASCADE' : ''}`;
            } else {
               const objectTypeCode = type === 'procedure' ? 'P' : type === 'view' ? 'V' : 'FN';
               sqlDelete = `IF OBJECT_ID('${this.qs(schemaName, name)}', '${objectTypeCode}') IS NOT NULL\n    DROP ${upperType} ${this.qs(schemaName, name)}`;
            }
            await this.LogSQLAndExecute(pool, sqlDelete, `SQL text to remove ${type} ${schemaName}.${name}`);

            // next up, we need to clean up the cache of saved DB objects that may exist for this entity in the appropriate sub-directory.
            const sqlOutputDir = outputDir('SQL', true);
            if (sqlOutputDir) {
               // now do the same thing for the /schema directory within the provided directory
               const fType = type === 'procedure' ? 'sp' : type === 'view' ? 'view' : 'full_text_search_function';
               const filePath = path.join(sqlOutputDir, this.SQLUtilityObject.getDBObjectFileName(fType, schemaName, name, false, true));
               const filePathPermissions = path.join(sqlOutputDir, this.SQLUtilityObject.getDBObjectFileName(fType, schemaName, name, true, true));

               // if the files exist, delete them
               if (fs.existsSync(filePath))
                  fs.unlinkSync(filePath);
               if (fs.existsSync(filePathPermissions))
                  fs.unlinkSync(filePathPermissions);
            }

            logStatus(`         > Removed ${type} ${schemaName}.${name}`);
         }
      }
      catch (e) {
         logError(`         > Error removing ${type} ${schemaName}.${name}, error: ${e}`);
      }
   }


   /**
    * Manages M->M relationships between entities in the metadata based on foreign key relationships in the database.
    * NOT IMPLEMENTED IN CURRENT VERSION IN BASE CLASS. M->M relationships ARE supported fully, but they are not AUTO generated by this
    * method, instead an administrator must manually create these relationships in the metadata.
    * @param ds
    * @param excludeSchemas
    * @returns
    */
   protected async manageManyToManyEntityRelationships(pool: CodeGenConnection, excludeSchemas: string[], batchItems: number = 5): Promise<boolean> {
      return true; // not implemented for now, require the admin to manually create these relationships
   }

   /**
    * Manages the creation, updating and deletion of entity field records in the metadata based on the database schema.
    * @param pool
    * @param excludeSchemas
    * @returns
    */
   public async manageEntityFields(pool: CodeGenConnection, excludeSchemas: string[], skipCreatedAtUpdatedAtDeletedAtFieldValidation: boolean, skipEntityFieldValues: boolean, currentUser: UserInfo, skipAdvancedGeneration: boolean, skipDeleteUnneededFields: boolean = false): Promise<boolean> {
      let bSuccess = true;
      const startTime: Date = new Date();

      if (!skipCreatedAtUpdatedAtDeletedAtFieldValidation) {
         if (!await this.ensureCreatedAtUpdatedAtFieldsExist(pool, excludeSchemas) ||
             !await this.ensureDeletedAtFieldsExist(pool, excludeSchemas)) {
            logError (`Error ensuring ${EntityInfo.CreatedAtFieldName}, ${EntityInfo.UpdatedAtFieldName} and ${EntityInfo.DeletedAtFieldName} fields exist`);
            bSuccess = false;
         }
         logStatus(`      Ensured ${EntityInfo.CreatedAtFieldName}/${EntityInfo.UpdatedAtFieldName}/${EntityInfo.DeletedAtFieldName} fields exist in ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);
      }

      const step1StartTime: Date = new Date();
      if (skipDeleteUnneededFields) {
         logStatus(`      Skipping deletion of unneeded entity fields (deferred to post-SQL pass)`);
      } else {
         if (! await this.deleteUnneededEntityFields(pool, excludeSchemas)) {
            logError ('Error deleting unneeded entity fields');
            bSuccess = false;
         }
         logStatus(`      Deleted unneeded entity fields in ${(new Date().getTime() - step1StartTime.getTime()) / 1000} seconds`);
      }

      // AN: 14-June-2025 - See note below about the new order of these steps, this must
      // happen before we update existing entity fields from schema.
      const step2StartTime: Date = new Date();
      if (! await this.createNewEntityFieldsFromSchema(pool)) { // has its own internal filtering for exclude schema/table so don't pass in
         logError ('Error creating new entity fields from schema')
         bSuccess = false;
      }
      logStatus(`      Created new entity fields from schema in ${(new Date().getTime() - step2StartTime.getTime()) / 1000} seconds`);

      // AN: 14-June-2025 - we are now running this AFTER we create new entity fields from schema
      // which results in the same pattern of behavior as migrations where we first create new fields
      // with VERY HIGH sequence numbers (e.g. 100,000 above what they will be approx) and then
      // we align them properly in sequential order from 1+ via this method below.
      const step3StartTime: Date = new Date();
      if (! await this.updateExistingEntityFieldsFromSchema(pool, excludeSchemas)) {
         logError ('Error updating existing entity fields from schema')
         bSuccess = false;
      }
      logStatus(`      Updated existing entity fields from schema in ${(new Date().getTime() - step3StartTime.getTime()) / 1000} seconds`);

      // Apply soft PK/FK configuration if config file exists
      const stepConfigStartTime: Date = new Date();
      if (! await this.applySoftPKFKConfig(pool)) {
         logError('Error applying soft PK/FK configuration');
      }
      logStatus(`      Applied soft PK/FK configuration in ${(new Date().getTime() - stepConfigStartTime.getTime()) / 1000} seconds`);

      // CRITICAL: Refresh metadata to pick up soft PK/FK flags
      // Without this, downstream SQL and TypeScript generation will fail
      // because entity.Fields and entity.PrimaryKeys won't reflect the updated flags
      if (configInfo.additionalSchemaInfo) {
         logStatus('      Refreshing metadata after applying soft PK/FK configuration...');
         const md = new Metadata();
         await md.Refresh();
         logStatus('      Metadata refresh complete');
      }

      // IS-A parent field sync: create/update virtual EntityField records for parent chain fields
      // Must run AFTER metadata refresh so it sees current soft PK/FK flags
      const stepISAStartTime: Date = new Date();
      const isaResult = await this.manageParentEntityFields(pool);
      if (!isaResult.success) {
         logError('Error managing IS-A parent entity fields');
         bSuccess = false;
      }
      logStatus(`      Managed IS-A parent entity fields in ${(new Date().getTime() - stepISAStartTime.getTime()) / 1000} seconds`);

      const step4StartTime: Date = new Date();
      if (! await this.setDefaultColumnWidthWhereNeeded(pool, excludeSchemas)) {
         logError ('Error setting default column width where needed')
         bSuccess = false;
      }
      logStatus(`      Set default column width where needed in ${(new Date().getTime() - step4StartTime.getTime()) / 1000} seconds`);

      const step5StartTime: Date = new Date();
      if (! await this.updateEntityFieldDisplayNameWhereNull(pool, excludeSchemas)) {
         logError('Error updating entity field display name where null');
         bSuccess = false;
      }
      logStatus(`      Updated entity field display name where null in ${(new Date().getTime() - step5StartTime.getTime()) / 1000} seconds`);

      if (!skipEntityFieldValues) {
         const step6StartTime: Date = new Date();
         logStatus(`      Starting to manage entity field values...`);
         if (! await this.manageEntityFieldValuesAndValidatorFunctions(pool, excludeSchemas, currentUser, false)) {
            logError('Error managing entity field values');
            bSuccess = false;
         }
         logStatus(`      Managed entity field values in ${(new Date().getTime() - step6StartTime.getTime()) / 1000} seconds`);
      }

      // Advanced Generation - Smart field identification and form layout
      if (!skipAdvancedGeneration) {
         const step7StartTime: Date = new Date();
         if (! await this.applyAdvancedGeneration(pool, excludeSchemas, currentUser)) {
            logError('Error applying advanced generation features');
            // Don't fail the entire process - advanced generation is optional
         }
         logStatus(`      Applied advanced generation features in ${(new Date().getTime() - step7StartTime.getTime()) / 1000} seconds`);
      }

      logStatus(`      Total time to manage entity fields: ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);

      return bSuccess;
   }


   /**
    * This method ensures that the __mj_DeletedAt field exists in each entity that has DeleteType=Soft. If the field does not exist, it is created.
    */
   protected async ensureDeletedAtFieldsExist(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sqlEntities = `SELECT
                                 *
                              FROM
                                 $\{this.qs(mj_core_schema(), \'vwEntities\')\}
                              WHERE
                                 VirtualEntity=0 AND
                                 DeleteType='Soft' AND
                                 SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         const entitiesResult = await pool.query(sqlEntities);
      const entities = entitiesResult.recordset;
         let overallResult = true;
         if (entities.length > 0) {
            // we have 1+ entities that need the special fields, so loop through them and ensure the fields exist
            // validate that each entity has the __mj_DeletedAt field, and it is a DATETIMEOFFSET fields, NOT NULL and both are fields that have a DEFAULT value of GETUTCDATE().
            const sql = `SELECT
                            TABLE_SCHEMA AS "TABLE_SCHEMA", TABLE_NAME AS "TABLE_NAME",
                            COLUMN_NAME AS "COLUMN_NAME", DATA_TYPE AS "DATA_TYPE",
                            IS_NULLABLE AS "IS_NULLABLE", COLUMN_DEFAULT AS "COLUMN_DEFAULT"
                         FROM INFORMATION_SCHEMA.COLUMNS
                         WHERE
                         (${entities.map((e: { SchemaName: any; BaseTable: any; }) => `(TABLE_SCHEMA='${e.SchemaName}' AND TABLE_NAME='${e.BaseTable}')`).join(' OR ')})
                         AND COLUMN_NAME='${EntityInfo.DeletedAtFieldName}'`
            const resultResult = await pool.query(sql);
      const result = resultResult.recordset;

            for (const e of entities) {
               const eResult = result.filter((r: { TABLE_NAME: any; TABLE_SCHEMA: any; }) => r.TABLE_NAME === e.BaseTable && r.TABLE_SCHEMA === e.SchemaName); // get just the fields for this entity
               const deletedAt = eResult.find((r: { COLUMN_NAME: string; }) => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.DeletedAtFieldName.trim().toLowerCase());

               // now, if we have the fields, we need to check the default value and update if necessary
               const fieldResult = await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(pool, e, EntityInfo.DeletedAtFieldName, deletedAt, true)

               overallResult = overallResult && fieldResult;
            }
         }
         return overallResult;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * Applies soft PK/FK configuration from a JSON file specified in mj.config.cjs (additionalSchemaInfo property).
    * For soft PKs: Sets BOTH IsPrimaryKey=1 AND IsSoftPrimaryKey=1 (IsPrimaryKey is source of truth, IsSoftPrimaryKey protects from schema sync).
    * For soft FKs: Sets RelatedEntityID/RelatedEntityFieldName + IsSoftForeignKey=1 (RelatedEntityID is source of truth, IsSoftForeignKey protects from schema sync).
    * All UPDATE statements are logged to migration files via LogSQLAndExecute() for CI/CD traceability.
    */
   protected async applySoftPKFKConfig(pool: CodeGenConnection): Promise<boolean> {
      // Check if additionalSchemaInfo is configured in mj.config.cjs
      if (!configInfo.additionalSchemaInfo) {
         // No additional schema info configured - this is fine, it's optional
         return true;
      }

      const configPath = path.join(currentWorkingDirectory, configInfo.additionalSchemaInfo);

      if (!fs.existsSync(configPath)) {
         logStatus(`         ⚠️  additionalSchemaInfo configured but file not found: ${configPath}`);
         return true;
      }

      try {
         logStatus(`         Found ${configInfo.additionalSchemaInfo}, applying soft PK/FK configuration...`);
         const config = ManageMetadataBase.getSoftPKFKConfig();

         let totalPKs = 0;
         let totalFKs = 0;
         const schema = mj_core_schema();

         // Config supports two formats:
         //   1. Schema-as-key (template format): { "dbo": [{ "TableName": "Orders", ... }] }
         //   2. Flat tables array (legacy format): { "tables": [{ "SchemaName": "dbo", "TableName": "Orders", ... }] }
         // Both use PascalCase property names.
         const tables = this.extractTablesFromConfig(config);

         for (const table of tables) {
            const tableSchema = table.SchemaName;
            const tableName = table.TableName;

            // Look up entity ID (SELECT query - no need to log to migration file)
            const entityLookupSQL = `SELECT ID FROM $\{this.qs(schema, \'Entity\')\} WHERE SchemaName = '${tableSchema}' AND BaseTable = '${tableName}'`;
            const entityResult = await pool.query(entityLookupSQL);

            if (entityResult.recordset.length === 0) {
               logStatus(`         ⚠️  Entity not found for ${tableSchema}.${tableName} - skipping`);
               continue;
            }

            const entityId = entityResult.recordset[0].ID;

            // Process primary keys - set BOTH IsPrimaryKey = 1 AND IsSoftPrimaryKey = 1
            // IsPrimaryKey is the source of truth, IsSoftPrimaryKey protects it from schema sync
            const primaryKeys = table.PrimaryKey || [];
            if (primaryKeys.length > 0) {
               for (const pk of primaryKeys) {
                  const sSQL = `UPDATE $\{this.qs(schema, \'EntityField\')\}
                                SET ${EntityInfo.UpdatedAtFieldName}=${this.utcNow()},
                                    ${this.qi('IsPrimaryKey')} = 1,
                                    ${this.qi('IsSoftPrimaryKey')} = 1
                                WHERE ${this.qi('EntityID')} = '${entityId}' AND ${this.qi('Name')} = '${pk.FieldName}'`;
                  const result = await this.LogSQLAndExecute(pool, sSQL, `Set soft PK for ${tableSchema}.${tableName}.${pk.FieldName}`);

                  if (result !== null) {
                     logStatus(`         ✓ Set IsPrimaryKey=1, IsSoftPrimaryKey=1 for ${tableName}.${pk.FieldName}`);
                     totalPKs++;
                  }
               }
            }

            // Process foreign keys - set RelatedEntityID, RelatedEntityFieldName, and IsSoftForeignKey = 1
            const foreignKeys = table.ForeignKeys || [];
            if (foreignKeys.length > 0) {
               for (const fk of foreignKeys) {
                  const fkSchema = fk.SchemaName || tableSchema;
                  // Look up related entity ID (SELECT query - no need to log to migration file)
                  const relatedLookupSQL = `SELECT ID FROM $\{this.qs(schema, \'Entity\')\} WHERE SchemaName = '${fkSchema}' AND BaseTable = '${fk.RelatedTable}'`;
                  const relatedEntityResult = await pool.query(relatedLookupSQL);

                  if (relatedEntityResult.recordset.length === 0) {
                     logStatus(`         ⚠️  Related entity not found for ${fkSchema}.${fk.RelatedTable} - skipping FK ${fk.FieldName}`);
                     continue;
                  }

                  const relatedEntityId = relatedEntityResult.recordset[0].ID;

                  const sSQL = `UPDATE $\{this.qs(schema, \'EntityField\')\}
                                SET ${EntityInfo.UpdatedAtFieldName}=${this.utcNow()},
                                    ${this.qi('RelatedEntityID')} = '${relatedEntityId}',
                                    ${this.qi('RelatedEntityFieldName')} = '${fk.RelatedField}',
                                    ${this.qi('IsSoftForeignKey')} = 1
                                WHERE ${this.qi('EntityID')} = '${entityId}' AND ${this.qi('Name')} = '${fk.FieldName}'`;
                  const result = await this.LogSQLAndExecute(pool, sSQL, `Set soft FK for ${tableSchema}.${tableName}.${fk.FieldName} → ${fk.RelatedTable}.${fk.RelatedField}`);

                  if (result !== null) {
                     logStatus(`         ✓ Set soft FK for ${tableName}.${fk.FieldName} → ${fk.RelatedTable}.${fk.RelatedField}`);
                     totalFKs++;
                  }
               }
            }
         }

         logStatus(`         Applied ${totalPKs} soft PK(s) and ${totalFKs} soft FK(s) from configuration`);
         return true;
      } catch (e) {
         logError(`Error applying soft PK/FK configuration: ${e}`);
         return false;
      }
   }

   /**
    * This method ensures that the __mj_CreatedAt and __mj_UpdatedAt fields exist in each entity that has TrackRecordChanges set to true. If the fields do not exist, they are created.
    * If the fields exist but have incorrect default values, the default values are updated. The default value that is to be used for these special fields is GETUTCDATE() which is the
    * UTC date and time. This method is called as part of the manageEntityFields method and is not intended to be called directly.
    * @param pool
    */
   protected async ensureCreatedAtUpdatedAtFieldsExist(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sqlEntities = `SELECT
                                 *
                              FROM
                                 $\{this.qs(mj_core_schema(), \'vwEntities\')\}
                              WHERE
                                 VirtualEntity = 0 AND
                                 TrackRecordChanges = 1 AND
                                 SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         const entitiesResult = await pool.query(sqlEntities);
      const entities = entitiesResult.recordset;
         let overallResult = true;
         if (entities.length > 0) {
            // we have 1+ entities that need the special fields, so loop through them and ensure the fields exist
            // validate that each entity has two specific fields, the first one is __mj_CreatedAt and the second one is __mj_UpdatedAt
            // both are DATETIME fields, NOT NULL and both are fields that have a DEFAULT value of GETUTCDATE().
            const sqlCreatedUpdated = `SELECT
                                          TABLE_SCHEMA AS "TABLE_SCHEMA", TABLE_NAME AS "TABLE_NAME",
                                          COLUMN_NAME AS "COLUMN_NAME", DATA_TYPE AS "DATA_TYPE",
                                          IS_NULLABLE AS "IS_NULLABLE", COLUMN_DEFAULT AS "COLUMN_DEFAULT"
                                       FROM INFORMATION_SCHEMA.COLUMNS
                                       WHERE
                                          (${entities.map((e: { SchemaName: any; BaseTable: any; }) => `(TABLE_SCHEMA='${e.SchemaName}' AND TABLE_NAME='${e.BaseTable}')`).join(' OR ')})
                                       AND COLUMN_NAME IN ('${EntityInfo.CreatedAtFieldName}','${EntityInfo.UpdatedAtFieldName}')`
            const resultResult = await pool.query(sqlCreatedUpdated);
      const result = resultResult.recordset;
            for (const e of entities) {
               // result has both created at and updated at fields, so filter on the result for each and do what we need to based on that
               const eResult = result.filter((r: { TABLE_NAME: any; TABLE_SCHEMA: any; }) => r.TABLE_NAME === e.BaseTable && r.TABLE_SCHEMA === e.SchemaName); // get just the fields for this entity
               const createdAt = eResult.find((r: { COLUMN_NAME: string; }) => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.CreatedAtFieldName.trim().toLowerCase());
               const updatedAt = eResult.find((r: { COLUMN_NAME: string; }) => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.UpdatedAtFieldName.trim().toLowerCase());

               // now, if we have the fields, we need to check the default value and update if necessary
               const fieldResult = await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(pool, e, EntityInfo.CreatedAtFieldName, createdAt, false) &&
                                   await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(pool, e, EntityInfo.UpdatedAtFieldName, updatedAt, false);

               overallResult = overallResult && fieldResult;
            }
         }
         return overallResult;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * This method handles the validation of the existence of the specified special date field and if it does exist it makes sure the default value is set correctly, if it doesn't exist
    * it makes sure that it is created. This method is called as part of the ensureCreatedAtUpdatedAtFieldsExist method and is not intended to be called directly.
    * @param entity
    * @param fieldName
    * @param currentFieldData
    */
   protected async ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(pool: CodeGenConnection, entity: any, fieldName: string, currentFieldData: any, allowNull: boolean): Promise<boolean> {
      try {
         if (!currentFieldData) {
            // field doesn't exist, let's create it
            const sql = this.isPostgreSQL
               ? `ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} ADD COLUMN "${fieldName}" ${this.timestampType} ${allowNull ? 'NULL' : `NOT NULL DEFAULT ${this.utcNow()}`}`
               : `ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} ADD ${fieldName} ${this.timestampType} ${allowNull ? 'NULL' : `NOT NULL DEFAULT ${this.utcNow()}`}`;
            await this.LogSQLAndExecute(pool, sql, `SQL text to add special date field ${fieldName} to entity ${entity.SchemaName}.${entity.BaseTable}`);
         }
         else {
            // field does exist, let's first check the data type/nullability
            if ( currentFieldData.DATA_TYPE.trim().toLowerCase() !== this.timestampType.toLowerCase() ||
                (currentFieldData.IS_NULLABLE.trim().toLowerCase() !== 'no' && !allowNull) ||
                (currentFieldData.IS_NULLABLE.trim().toLowerCase() === 'no' && allowNull)) {
               // the column is the wrong type, or has wrong nullability attribute, so let's update it, first removing the default constraint, then
               // modifying the column, and finally adding the default constraint back in.
               await this.dropExistingDefaultConstraint(pool, entity, fieldName);

               const sql = this.isPostgreSQL
                  ? `ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} ALTER COLUMN "${fieldName}" TYPE ${this.timestampType}, ALTER COLUMN "${fieldName}" ${allowNull ? 'DROP NOT NULL' : 'SET NOT NULL'}`
                  : `ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} ALTER COLUMN ${fieldName} ${this.timestampType} ${allowNull ? 'NULL' : 'NOT NULL'}`;
               await this.LogSQLAndExecute(pool, sql, `SQL text to update special date field ${fieldName} in entity ${entity.SchemaName}.${entity.BaseTable}`);

               if (!allowNull)
                  await this.createDefaultConstraintForSpecialDateField(pool, entity, fieldName);
            }
            else {
               // if we get here that means the column is the correct type and nullability, so now let's check the default value, but we only do that if we are dealing with a
               // field that is NOT NULL
               if (!allowNull) {
                  const defaultValue = currentFieldData.COLUMN_DEFAULT;
                  const realDefaultValue = ExtractActualDefaultValue(defaultValue);
                  if (!realDefaultValue || realDefaultValue.trim().toLowerCase() !== this.utcNow().toLowerCase()) {
                     await this.dropAndCreateDefaultConstraintForSpecialDateField(pool, entity, fieldName);
                  }
               }
            }
         }
         // if we get here, we're good
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * Creates the default constraint for a special date field. This method is called as part of the ensureSpecialDateFieldExistsAndHasCorrectDefaultValue method and is not intended to be called directly.
    */
   protected async createDefaultConstraintForSpecialDateField(pool: CodeGenConnection, entity: any, fieldName: string) {
      try {
         const sqlAddDefaultConstraint = `ALTER TABLE $\{this.qs(entity.SchemaName, entity.BaseTable)\} ADD CONSTRAINT DF_${entity.SchemaName}_${CodeNameFromString(entity.BaseTable)}_${fieldName} DEFAULT ${this.utcNow()} FOR [${fieldName}]`;
         await this.LogSQLAndExecute(pool, sqlAddDefaultConstraint, `SQL text to add default constraint for special date field ${fieldName} in entity ${entity.SchemaName}.${entity.BaseTable}`);
      }
      catch (e) {
         logError(e as string);
      }
   }

   /**
    * Drops and recreates the default constraint for a special date field. This method is called as part of the ensureSpecialDateFieldExistsAndHasCorrectDefaultValue method and is not intended to be called directly.
    * @param ds
    * @param entity
    * @param fieldName
    */
   protected async dropAndCreateDefaultConstraintForSpecialDateField(pool: CodeGenConnection, entity: any, fieldName: string) {
      // default value is not correct, so let's update it
      await this.dropExistingDefaultConstraint(pool, entity, fieldName);
      await this.createDefaultConstraintForSpecialDateField(pool, entity, fieldName);
   }

   /**
    * Drops an existing default constraint from a given column within a given entity, if it exists
    * @param pool
    * @param entity
    * @param fieldName
    */
   protected async dropExistingDefaultConstraint(pool: CodeGenConnection, entity: any, fieldName: string) {
      try {
         let sqlDropDefaultConstraint: string;
         if (this.isPostgreSQL) {
            // PostgreSQL: Query pg_catalog for the default constraint and drop it
            sqlDropDefaultConstraint = `
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${entity.SchemaName}'
     AND rel.relname = '${entity.BaseTable}'
     AND att.attname = '${fieldName}'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${entity.SchemaName}', '${entity.BaseTable}', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} ALTER COLUMN "${fieldName}" DROP DEFAULT;
END $$`;
         } else {
            // SQL Server: Query sys catalog for the default constraint and drop it
            sqlDropDefaultConstraint = `
         DECLARE @constraintName NVARCHAR(255);

         -- Get the default constraint name
         SELECT @constraintName = d.name
         FROM sys.tables t
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.columns c ON t.object_id = c.object_id
         JOIN sys.default_constraints d ON c.default_object_id = d.object_id
         WHERE s.name = '${entity.SchemaName}'
         AND t.name = '${entity.BaseTable}'
         AND c.name = '${fieldName}';

         -- Drop the default constraint if it exists
         IF @constraintName IS NOT NULL
         BEGIN
            EXEC('ALTER TABLE ${this.qs(entity.SchemaName, entity.BaseTable)} DROP CONSTRAINT ' + @constraintName);
         END
         `;
         }
         await this.LogSQLAndExecute(pool, sqlDropDefaultConstraint, `SQL text to drop default existing default constraints in entity ${entity.SchemaName}.${entity.BaseTable}`);
      }
      catch (e) {
         logError(e as string);
      }
   }


   /**
    * This method generates descriptions for entities in teh system where there is no existing description. This is an experimental feature and is done using AI. In order for it
    * to be invoked, the EntityDescriptions feature must be enabled in the Advanced Generation configuration.
    * @param pool
    * @param md
    * @param currentUser
    */
   protected async generateNewEntityDescriptions(pool: CodeGenConnection, md: Metadata, currentUser: UserInfo) {
      // for the list of new entities, go through and attempt to generate new entity descriptions
      const ag = new AdvancedGeneration();
      if (ag.featureEnabled('EntityDescriptions')) {
         // we have the feature enabled, so let's loop through the new entities and generate descriptions for them
         for (let e of ManageMetadataBase.newEntityList) {
            const dataResult = await pool.query(`SELECT * FROM $\{this.qs(mj_core_schema(), \'vwEntities\')\} WHERE Name = '${e}'`);
            const data = dataResult.recordset;
            const fieldsResult = await pool.query(`SELECT * FROM $\{this.qs(mj_core_schema(), \'vwEntityFields\')\} WHERE EntityID='${data[0].ID}'`);
            const fields = fieldsResult.recordset;

            // Use new API to generate entity description
            const result = await ag.generateEntityDescription(
               e,
               data[0].BaseTable,
               fields.map((f: any) => ({ Name: f.Name, Type: f.Type, IsNullable: f.AllowsNull, Description: f.Description })),
               currentUser
            );

            if (result?.entityDescription && result.entityDescription.length > 0) {
               const sSQL = `UPDATE $\{this.qs(mj_core_schema(), \'Entity\')\} SET Description = '${result.entityDescription}' WHERE Name = '${e}'`;
               await this.LogSQLAndExecute(pool, sSQL, `SQL text to update entity description for entity ${e}`);
            }
            else {
               console.warn('   >>> Advanced Generation Error: LLM returned invalid result, skipping entity description for entity ' + e);
            }
         }
      }
   }

   /**
    * This method is responsible for generating a Display Name for each field where a display name is not already set. The approach in the base class
    * uses a simple algorithm that looks for case changes in the field name and inserts spaces at those points. It also strips the trailing 'ID' from the field name if it exists.
    * Override this method in a sub-class if you would like to implement a different approach for generating display names.
    * @param ds
    * @param excludeSchemas
    * @returns
    */
   protected async updateEntityFieldDisplayNameWhereNull(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const sql = `SELECT
                        ef.ID, ef.Name
                      FROM
                        $\{this.qs(mj_core_schema(), \'vwEntityFields\')\} ef
                      INNER JOIN
                        $\{this.qs(mj_core_schema(), \'vwEntities\')\} e
                      ON
                        ef.EntityID = e.ID
                      WHERE
                        ef.DisplayName IS NULL AND
                        ef.Name <> \'ID\' AND
                        e.SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})
                        `
         const fieldsResult = await pool.query(sql)
         const fields = fieldsResult.recordset;
         if (fields && fields.length > 0)
            for (const field of fields) {
               const sDisplayName = stripTrailingChars(convertCamelCaseToHaveSpaces(field.Name), 'ID', true).trim()
               if (sDisplayName.length > 0 && sDisplayName.toLowerCase().trim() !== field.Name.toLowerCase().trim()) {
                  const sSQL = `UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\} SET ${EntityInfo.UpdatedAtFieldName}=${this.utcNow()}, DisplayName = '${sDisplayName}' WHERE ID = '${field.ID}'`
                  await this.LogSQLAndExecute(pool, sSQL, `SQL text to update display name for field ${field.Name}`);
               }
            }

         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * This method updates the DefaultColumnWidth field in the EntityField metadata. The default logic uses a stored procedure called spSetDefaultColumnWidthWhereNeeded
    * which is part of the MJ Core Schema. You can override this method to implement custom logic for setting default column widths. It is NOT recommended to
    * modify the stored procedure in the MJ Core Schema because your changes will be overriden during a future upgrade.
    * @param pool
    * @param excludeSchemas
    * @returns
    */
   protected async setDefaultColumnWidthWhereNeeded(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const spName = this.qs(mj_core_schema(), 'spSetDefaultColumnWidthWhereNeeded');
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spSetDefaultColumnWidthWhereNeeded"('${excludeSchemas.join(',')}')`
            : `EXEC ${mj_core_schema()}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='${excludeSchemas.join(',')}'`;
         await this.LogSQLAndExecute(pool, sSQL, `SQL text to set default column width where needed`, true);
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;  
      }
   }

   /**
    * Creates a SQL statement to retrieve all of the pending entity fields that need to be created in the metadata. This method looks for fields that exist in the underlying
    * database but are NOT in the metadata.
    *
    * IMPORTANT: The sequence calculation uses a dynamic offset based on the maximum existing sequence for each entity, plus 100,000, plus the column sequence.
    * This ensures no collision with existing sequences while maintaining deterministic ordering. The spUpdateExistingEntityFieldsFromSchema stored procedure runs
    * AFTER this method and will correct the sequences to ensure they are in the correct sequential order starting from 1. In a migration, the
    * spUpdateExistingEntityFieldsFromSchema runs afterwards as well so this behavior ensures CodeGen works consistently.
    *
    * @returns {string} - The SQL statement to retrieve pending entity fields.
    */
   protected getPendingEntityFieldsSELECTSQL(): string {
      const schema = mj_core_schema();
      if (this.isPostgreSQL) {
         return this.getPendingEntityFieldsSELECTSQL_PostgreSQL(schema);
      }
      return this.getPendingEntityFieldsSELECTSQL_SQLServer(schema);
   }

   /**
    * SQL Server version of the pending entity fields query.
    * Uses temp tables materialized from DMV views for optimal query plan statistics.
    */
   private getPendingEntityFieldsSELECTSQL_SQLServer(schema: string): string {
      return `
-- Materialize system DMV views into temp tables so SQL Server gets real statistics
-- instead of expanding nested view-on-view joins with bad cardinality estimates
-- Drop first in case a prior run on this connection left them behind
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwForeignKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwForeignKeys;
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwTablePrimaryKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwTablePrimaryKeys;
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwTableUniqueKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwTableUniqueKeys;

SELECT [column], [table], [schema_name], referenced_table, referenced_column, [referenced_schema]
INTO #__mj__CodeGen__vwForeignKeys
FROM ${this.qs(schema, 'vwForeignKeys')};

SELECT TableName, ColumnName, SchemaName
INTO #__mj__CodeGen__vwTablePrimaryKeys
FROM ${this.qs(schema, 'vwTablePrimaryKeys')};

SELECT TableName, ColumnName, SchemaName
INTO #__mj__CodeGen__vwTableUniqueKeys
FROM ${this.qs(schema, 'vwTableUniqueKeys')};

WITH MaxSequences AS (
   SELECT
      EntityID,
      ISNULL(MAX(Sequence), 0) AS MaxSequence
   FROM
      ${this.qs(schema, 'EntityField')}
   GROUP BY
      EntityID
),
NumberedRows AS (
   SELECT
      sf.EntityID,
      ISNULL(ms.MaxSequence, 0) + 100000 + sf.Sequence AS Sequence,
      sf.FieldName,
      sf.Description,
      sf.Type,
      sf.Length,
      sf.Precision,
      sf.Scale,
      sf.AllowsNull,
      sf.DefaultValue,
      sf.AutoIncrement,
      IIF(sf.IsVirtual = 1, 0, IIF(sf.FieldName = '${EntityInfo.CreatedAtFieldName}' OR
                                   sf.FieldName = '${EntityInfo.UpdatedAtFieldName}' OR
                                   sf.FieldName = '${EntityInfo.DeletedAtFieldName}' OR
                                   pk.ColumnName IS NOT NULL, 0, 1)) AllowUpdateAPI,
      sf.IsVirtual,
      e.RelationshipDefaultDisplayType,
      e.Name EntityName,
      re.ID RelatedEntityID,
      fk.referenced_column RelatedEntityFieldName,
      IIF(sf.FieldName = 'Name', 1, 0) IsNameField,
      IsPrimaryKey = CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END,
      IsUnique = CASE
            WHEN pk.ColumnName IS NOT NULL THEN 1
            WHEN uk.ColumnName IS NOT NULL THEN 1
            ELSE 0
         END,
      ROW_NUMBER() OVER (PARTITION BY sf.EntityID, sf.FieldName ORDER BY (SELECT NULL)) AS rn
   FROM
      ${this.qs(schema, 'vwSQLColumnsAndEntityFields')} sf
   LEFT OUTER JOIN
      MaxSequences ms ON sf.EntityID = ms.EntityID
   LEFT OUTER JOIN
      ${this.qs(schema, 'Entity')} e ON sf.EntityID = e.ID
   LEFT OUTER JOIN
      #__mj__CodeGen__vwForeignKeys fk
      ON sf.FieldName = fk.[column] AND e.BaseTable = fk.[table] AND e.SchemaName = fk.[schema_name]
   LEFT OUTER JOIN
      ${this.qs(schema, 'Entity')} re ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
   LEFT OUTER JOIN
      #__mj__CodeGen__vwTablePrimaryKeys pk
      ON e.BaseTable = pk.TableName AND sf.FieldName = pk.ColumnName AND e.SchemaName = pk.SchemaName
   LEFT OUTER JOIN
      #__mj__CodeGen__vwTableUniqueKeys uk
      ON e.BaseTable = uk.TableName AND sf.FieldName = uk.ColumnName AND e.SchemaName = uk.SchemaName
   WHERE
      EntityFieldID IS NULL\n${this.createExcludeTablesAndSchemasFilter('sf.')}
   )
   SELECT *
   FROM NumberedRows
   WHERE rn = 1
   ORDER BY EntityID, Sequence;

DROP TABLE #__mj__CodeGen__vwForeignKeys;
DROP TABLE #__mj__CodeGen__vwTablePrimaryKeys;
DROP TABLE #__mj__CodeGen__vwTableUniqueKeys;
`;
   }

   /**
    * PostgreSQL version of the pending entity fields query.
    * Uses CTEs instead of temp tables, COALESCE instead of ISNULL,
    * CASE WHEN instead of IIF, and double-quote identifiers.
    */
   private getPendingEntityFieldsSELECTSQL_PostgreSQL(schema: string): string {
      return `
WITH fk_cache AS (
   SELECT "column", "table", "schema_name", "referenced_table", "referenced_column", "referenced_schema"
   FROM ${this.qs(schema, 'vwForeignKeys')}
),
pk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${this.qs(schema, 'vwTablePrimaryKeys')}
),
uk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${this.qs(schema, 'vwTableUniqueKeys')}
),
MaxSequences AS (
   SELECT
      "EntityID",
      COALESCE(MAX("Sequence"), 0) AS "MaxSequence"
   FROM
      ${this.qs(schema, 'EntityField')}
   GROUP BY
      "EntityID"
),
NumberedRows AS (
   SELECT
      sf."EntityID",
      COALESCE(ms."MaxSequence", 0) + 100000 + sf."Sequence" AS "Sequence",
      sf."FieldName",
      sf."Description",
      sf."Type",
      sf."Length",
      sf."Precision",
      sf."Scale",
      sf."AllowsNull",
      sf."DefaultValue",
      sf."AutoIncrement",
      CASE WHEN sf."IsVirtual" = true THEN 0
           WHEN sf."FieldName" = '${EntityInfo.CreatedAtFieldName}' THEN 0
           WHEN sf."FieldName" = '${EntityInfo.UpdatedAtFieldName}' THEN 0
           WHEN sf."FieldName" = '${EntityInfo.DeletedAtFieldName}' THEN 0
           WHEN pk."ColumnName" IS NOT NULL THEN 0
           ELSE 1
      END AS "AllowUpdateAPI",
      sf."IsVirtual",
      e."RelationshipDefaultDisplayType",
      e."Name" AS "EntityName",
      re."ID" AS "RelatedEntityID",
      fk."referenced_column" AS "RelatedEntityFieldName",
      CASE WHEN sf."FieldName" = 'Name' THEN 1 ELSE 0 END AS "IsNameField",
      CASE WHEN pk."ColumnName" IS NOT NULL THEN 1 ELSE 0 END AS "IsPrimaryKey",
      CASE
            WHEN pk."ColumnName" IS NOT NULL THEN 1
            WHEN uk."ColumnName" IS NOT NULL THEN 1
            ELSE 0
      END AS "IsUnique",
      ROW_NUMBER() OVER (PARTITION BY sf."EntityID", sf."FieldName" ORDER BY (SELECT NULL)) AS rn
   FROM
      ${this.qs(schema, 'vwSQLColumnsAndEntityFields')} sf
   LEFT OUTER JOIN
      MaxSequences ms ON sf."EntityID" = ms."EntityID"
   LEFT OUTER JOIN
      ${this.qs(schema, 'Entity')} e ON sf."EntityID" = e."ID"
   LEFT OUTER JOIN
      fk_cache fk ON sf."FieldName" = fk."column" AND e."BaseTable" = fk."table" AND e."SchemaName" = fk."schema_name"
   LEFT OUTER JOIN
      ${this.qs(schema, 'Entity')} re ON re."BaseTable" = fk."referenced_table" AND re."SchemaName" = fk."referenced_schema"
   LEFT OUTER JOIN
      pk_cache pk ON e."BaseTable" = pk."TableName" AND sf."FieldName" = pk."ColumnName" AND e."SchemaName" = pk."SchemaName"
   LEFT OUTER JOIN
      uk_cache uk ON e."BaseTable" = uk."TableName" AND sf."FieldName" = uk."ColumnName" AND e."SchemaName" = uk."SchemaName"
   WHERE
      "EntityFieldID" IS NULL\n${this.createExcludeTablesAndSchemasFilter('sf.')}
)
SELECT *
FROM NumberedRows
WHERE rn = 1
ORDER BY "EntityID", "Sequence";
`;
   }

   /**
    * This method builds a SQL Statement that will insert a row into the EntityField table with information about a new field.
    * @param n - the new field
    * @returns
    */
   protected getPendingEntityFieldINSERTSQL(newEntityFieldUUID: string, n: any): string {
      // DefaultInView logic: Include name fields and early sequence fields, but EXCLUDE primary keys and foreign keys
      // Primary keys (ID) and foreign keys are UUIDs that aren't useful for end users
      const isPrimaryKey = n.FieldName?.trim().toLowerCase() === 'id';
      const isForeignKey = n.RelatedEntityID && n.RelatedEntityID.length > 0; // Foreign keys have RelatedEntityID set
      const isNameField = n.FieldName?.trim().toLowerCase() === 'name' || n.IsNameField;
      const isEarlySequence = n.Sequence <= configInfo.newEntityDefaults?.IncludeFirstNFieldsAsDefaultInView;

      const bDefaultInView: boolean = (isNameField || isEarlySequence) && !isPrimaryKey && !isForeignKey;
      const escapedDescription = n.Description ? `'${n.Description.replace(/'/g, "''")}'` : 'NULL';
      let fieldDisplayName: string = '';
      switch (n.FieldName.trim().toLowerCase()) {
         case EntityInfo.CreatedAtFieldName.trim().toLowerCase():
               fieldDisplayName = "Created At";
               break;
            case EntityInfo.UpdatedAtFieldName.trim().toLowerCase():
               fieldDisplayName = "Updated At";
               break;
            case EntityInfo.DeletedAtFieldName.trim().toLowerCase():
               fieldDisplayName = "Deleted At";
               break;
            default:
               fieldDisplayName = convertCamelCaseToHaveSpaces(n.FieldName).trim();
               break;
      }
      const parsedDefaultValue = this.parseDefaultValue(n.DefaultValue);
      const quotedDefaultValue = parsedDefaultValue?.trim().length === 0 ? 'NULL' : 
                                    (parsedDefaultValue?.trim().toLowerCase() === 'null' ? 'NULL' : `'${parsedDefaultValue}'`);
      // in the above we are setting quotedDefaultValue to NULL if the parsed default value is an empty string or the string 'NULL' (case insensitive)

      return `
      ${this.isPostgreSQL ? '' : `IF NOT EXISTS (
         SELECT 1 FROM ${this.qs(mj_core_schema(), 'EntityField')}
         WHERE ID = '${newEntityFieldUUID}'  OR
               (EntityID = '${n.EntityID}' AND Name = '${n.FieldName}')
      )
      BEGIN`}
         INSERT INTO ${this.qs(mj_core_schema(), 'EntityField')}
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '${newEntityFieldUUID}',
            '${n.EntityID}', -- Entity: ${n.EntityName}
            ${n.Sequence},
            '${n.FieldName}',
            '${fieldDisplayName}',
            ${escapedDescription},
            '${n.Type}',
            ${n.Length},
            ${n.Precision},
            ${n.Scale},
            ${n.AllowsNull ? 1 : 0},
            ${quotedDefaultValue},
            ${n.AutoIncrement ? 1 : 0},
            ${n.AllowUpdateAPI ? 1 : 0},
            ${n.IsVirtual ? 1 : 0},
            ${n.RelatedEntityID && n.RelatedEntityID.length > 0 ? `'${n.RelatedEntityID}'` : 'NULL'},
            ${n.RelatedEntityFieldName && n.RelatedEntityFieldName.length > 0 ? `'${n.RelatedEntityFieldName}'` : 'NULL'},
            ${n.IsNameField !== null ? n.IsNameField : 0},
            ${n.FieldName === 'ID' || n.IsNameField ? 1 : 0},
            ${n.RelatedEntityID && n.RelatedEntityID.length > 0 ? 1 : 0},
            ${bDefaultInView ? 1 : 0},
            ${n.IsPrimaryKey},
            ${n.IsUnique},
            '${n.RelationshipDefaultDisplayType}'
         )
      ${this.isPostgreSQL
         ? `ON CONFLICT DO NOTHING`
         : `END`}`
   }

   /**
    * This method takes the stored DEFAULT CONSTRAINT value from the database and parses it to retrieve the actual default value. This is necessary because the default value is
    * sometimes wrapped in parentheses and sometimes wrapped in single quotes. This method removes the wrapping characters and returns the actual default value. Some common raw values
    * that exist in SQL Server include 'getdate()', '(getdate())', 'N''SomeValue''', etc. and this method will remove those wrapping characters to get the actual underlying default value.
    * NOTE: For future versions of MemberJunction where multiple back-end providers could be used, this method will be moved to the Provider architecture so that database-specific versions
    * can be implemented, along with many other aspects of this current codebase.
    * @param sqlDefaultValue
    * @returns
    */
   protected parseDefaultValue(sqlDefaultValue: string): string {
      let sResult: string = null!;

      if (sqlDefaultValue !== null && sqlDefaultValue !== undefined) {
         if (this.isPostgreSQL) {
            // PostgreSQL defaults: 'value'::type, now(), gen_random_uuid(), nextval('seq')
            sResult = sqlDefaultValue;
            // Strip type casts like '2024-01-01'::timestamp, 'value'::character varying
            const castMatch = sResult.match(/^'(.*)'::.*$/);
            if (castMatch) {
               sResult = castMatch[1];
            }
            // Strip nextval('...') for auto-increment - treated as no default
            if (sResult.match(/^nextval\(/i)) {
               return null!;
            }
         } else {
            // SQL Server defaults: wrapped in parens and/or N'' prefix
            if (sqlDefaultValue.startsWith('(') && sqlDefaultValue.endsWith(')'))
               sResult = sqlDefaultValue.substring(1, sqlDefaultValue.length - 1);
            else
               sResult = sqlDefaultValue;

            if (sResult.toUpperCase().startsWith('N\'') && sResult.endsWith('\''))
               sResult = sResult.substring(2, sResult.length - 1);

            if (sResult.startsWith('\'') && sResult.endsWith('\''))
               sResult = sResult.substring(1, sResult.length - 1);
         }
      }

      return sResult;
   }

   protected async createNewEntityFieldsFromSchema(pool: CodeGenConnection): Promise<boolean> {
      try   {
         const sSQL = this.getPendingEntityFieldsSELECTSQL();
         const newEntityFieldsResult = await pool.query(sSQL);
         const newEntityFields = newEntityFieldsResult.recordset;
         if (newEntityFields.length > 0) {
            const transaction = await pool.beginTransaction();
            try {
               // wrap in a transaction so we get all of it or none of it
               for (let i = 0; i < newEntityFields.length; ++i) {
                  const n = newEntityFields[i];
                  if (n.EntityID !== null && n.EntityID !== undefined && n.EntityID.length > 0) {
                     // need to check for null entity id = that is because the above query can return candidate Entity Fields but the entities may not have been created if the entities
                     // that would have been created violate rules - such as not having an ID column, etc.
                     const newEntityFieldUUID = this.createNewUUID();
                     const sSQLInsert = this.getPendingEntityFieldINSERTSQL(newEntityFieldUUID, n);
                     try {
                        await this.LogSQLAndExecute(pool, sSQLInsert, `SQL text to insert new entity field`);
                        // if we get here, we're okay, otherwise we have an exception, which we want as it blows up transaction
                     }
                     catch (e) {
                        // this is here so we can catch the error for debug. We want the transaction to die
                        logError(`Error inserting new entity field. SQL: \n${sSQLInsert}`);
                        throw e;
                     }
                  }
               }
               await transaction.commit();
            } catch (e) {
               await transaction.rollback();
               throw e;
            }

            // if we get here now send a distinct list of the entities that had new fields to the modified entity list
            // column in the resultset is called EntityName, we dont have to dedupe them here because the method below
            // will do that for us
            ManageMetadataBase.addNewEntitiesToModifiedList(newEntityFields.map((f: { EntityName: any; }) => f.EntityName));
         }

         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * This method handles updating entity field related name field maps which is basically the process of finding the related entity field that is the "name" field for the related entity.
    * @param ds
    * @param entityFieldID
    * @param relatedEntityNameFieldMap
    * @returns
    */
   public async updateEntityFieldRelatedEntityNameFieldMap(pool: CodeGenConnection, entityFieldID: string, relatedEntityNameFieldMap: string): Promise<boolean> {
      try   {
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spUpdateEntityFieldRelatedEntityNameFieldMap"('${entityFieldID}', '${relatedEntityNameFieldMap}')`
            : `EXEC ${this.qs(mj_core_schema(), 'spUpdateEntityFieldRelatedEntityNameFieldMap')}
         @EntityFieldID='${entityFieldID}',
         @RelatedEntityNameFieldMap='${relatedEntityNameFieldMap}'`;

         await this.LogSQLAndExecute(pool, sSQL, `SQL text to update entity field related entity name field map for entity field ID ${entityFieldID}`);
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }
   protected async updateExistingEntitiesFromSchema(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spUpdateExistingEntitiesFromSchema"('${excludeSchemas.join(',')}')`
            : `EXEC ${this.qs(mj_core_schema(), 'spUpdateExistingEntitiesFromSchema')} @ExcludedSchemaNames='${excludeSchemas.join(',')}' `;
         const result = await this.LogSQLAndExecute(pool, sSQL, `SQL text to update existing entities from schema`, true);
         // result contains the updated entities, and there is a property of each row called Name which has the entity name that was modified
         // add these to the modified entity list if they're not already in there
         if (result && result.length > 0 ) {
            ManageMetadataBase.addNewEntitiesToModifiedList(result.map((r: { Name: any; }) => r.Name));
         }
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * Adds a list of entity names to the modified entity list if they're not already in there
    */
   public static addNewEntitiesToModifiedList(entityNames: string[]) {
      const distinctEntityNames = [...new Set(entityNames)];
      const newlyModifiedEntityNames = distinctEntityNames.filter((e: string) => !ManageMetadataBase._modifiedEntityList.includes(e));
      // now make sure that each of these entity names is in the modified entity list
      ManageMetadataBase._modifiedEntityList = ManageMetadataBase._modifiedEntityList.concat(newlyModifiedEntityNames);
   }

   protected async updateExistingEntityFieldsFromSchema(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spUpdateExistingEntityFieldsFromSchema"('${excludeSchemas.join(',')}')`
            : `EXEC ${this.qs(mj_core_schema(), 'spUpdateExistingEntityFieldsFromSchema')} @ExcludedSchemaNames='${excludeSchemas.join(',')}'`
         const result = await this.LogSQLAndExecute(pool, sSQL, `SQL text to update existing entity fields from schema`, true);
         // result contains the updated entity fields
         // there is a field in there called EntityName. Get a distinct list of entity names from this and add them
         // to the modified entity list if they're not already in there
         if (result && result.length > 0) {
            ManageMetadataBase.addNewEntitiesToModifiedList(result.map((r: { EntityName: any; }) => r.EntityName));
         }
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * Syncs SchemaInfo records from database schemas, capturing extended properties as descriptions.
    * Creates new SchemaInfo records for schemas that don't exist yet and updates descriptions
    * from schema extended properties for existing records.
    * @param pool - SQL connection pool
    * @param excludeSchemas - Array of schema names to exclude from processing
    * @returns Promise<boolean> - true if successful, false otherwise
    */
   protected async updateSchemaInfoFromDatabase(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spUpdateSchemaInfoFromDatabase"('${excludeSchemas.join(',')}')`
            : `EXEC ${this.qs(mj_core_schema(), 'spUpdateSchemaInfoFromDatabase')} @ExcludedSchemaNames='${excludeSchemas.join(',')}' `;
         const result = await this.LogSQLAndExecute(pool, sSQL, `SQL text to sync schema info from database schemas`, true);

         if (result && result.length > 0) {
            logStatus(`   > Updated/created ${result.length} SchemaInfo records`);
            this.cacheSchemaInfoRecords(result);
         }

         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * Caches SchemaInfo records from the database for use by getNewEntityNameRule().
    * Only stores the fields relevant to entity name prefix/suffix resolution.
    */
   private cacheSchemaInfoRecords(records: Record<string, unknown>[]): void {
      ManageMetadataBase._schemaInfoRecords = records.map(r => ({
         SchemaName: r.SchemaName as string,
         EntityNamePrefix: (r.EntityNamePrefix as string | null) ?? null,
         EntityNameSuffix: (r.EntityNameSuffix as string | null) ?? null,
      }));
   }

   /**
    * Loads existing SchemaInfo records from the database into the cache so that
    * entity name prefix/suffix rules are available before createNewEntities() runs.
    * This is a read-only SELECT — it does NOT create or update any records.
    */
   protected async loadSchemaInfoRecords(pool: CodeGenConnection): Promise<boolean> {
      try {
         const sSQL = `SELECT * FROM $\{this.qs(mj_core_schema(), \'SchemaInfo\')\}`;
         const result = await pool.query(sSQL);
         if (result?.recordset?.length > 0) {
            this.cacheSchemaInfoRecords(result.recordset);
         }
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   protected async deleteUnneededEntityFields(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const sSQL = this.isPostgreSQL
            ? `SELECT * FROM ${mj_core_schema()}."spDeleteUnneededEntityFields"('${excludeSchemas.join(',')}')`
            : `EXEC ${this.qs(mj_core_schema(), 'spDeleteUnneededEntityFields')} @ExcludedSchemaNames='${excludeSchemas.join(',')}' `;
         const result = await this.LogSQLAndExecute(pool, sSQL, `SQL text to delete unneeded entity fields`, true);
         // result contains the DELETED entity fields
         // there is a field in there called Entity. Get a distinct list of entity names from this and add them
         // to the modified entity list if they're not already in there
         if (result && result.length > 0) {
            ManageMetadataBase.addNewEntitiesToModifiedList(result.map((r: { Entity: any; }) => r.Entity));
         }
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   protected async manageEntityFieldValuesAndValidatorFunctions(pool: CodeGenConnection, excludeSchemas: string[], currentUser: UserInfo, skipDBUpdate: boolean): Promise<boolean> {
      try  {
         // here we want to get all of the entity fields that have check constraints attached to them. For each field that has a check constraint, we want to
         // evaluate it to see if it is a simple series of OR statements or not, if it is a simple series of OR statements, we can parse the possible values
         // for the field and sync that up with the EntityFieldValue table. If it is not a simple series of OR statements, we will not be able to parse it and we'll
         // just ignore it.
         const filter = excludeSchemas && excludeSchemas.length > 0 ? ` WHERE SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})` : '';
         const sSQL = `SELECT * FROM $\{this.qs(mj_core_schema(), \'vwEntityFieldsWithCheckConstraints\')\}${filter}`
         const resultResult = await pool.query(sSQL);
         const result = resultResult.recordset;

         const efvSQL = `SELECT * FROM $\{this.qs(mj_core_schema(), \'EntityFieldValue\')\}`;
         const allEntityFieldValuesResult = await pool.query(efvSQL);
         const allEntityFieldValues = allEntityFieldValuesResult.recordset;

         const efSQL = `SELECT * FROM $\{this.qs(mj_core_schema(), \'vwEntityFields\')\} ORDER BY EntityID, Sequence`;
         const allEntityFieldsResult = await pool.query(efSQL);
         const allEntityFields = allEntityFieldsResult.recordset;

         const generationPromises = [];

         const columnLevelResults = result.filter((r: any) => r.EntityFieldID); // get the column level constraints
         const tableLevelResults = result.filter((r: any) => !r.EntityFieldID); // get the table level constraints
         for (const r of columnLevelResults) {
            // now, for each of the constraints we get back here, loop through and evaluate if they're simple and if they're simple, parse and sync with entity field values for that field
            if (r.ConstraintDefinition && r.ConstraintDefinition.length > 0) {
               const parsedValues = this.parseCheckConstraintValues(r.ConstraintDefinition, r.ColumnName, r.EntityName);
               if (parsedValues) {
                  if (!skipDBUpdate) {
                     // we only do this part if we are not skiping the database update as this code will sync values from the CHECK
                     // with the EntityFieldValues in the database.

                     // Sort values alphabetically to ensure consistent sequences across all databases
                     // This guarantees the same value always gets the same sequence number regardless of
                     // how SQL Server returns CHECK constraint values (which can vary)
                     parsedValues.sort();

                     // we have parsed values from the check constraint, so sync them with the entity field values
                     await this.syncEntityFieldValues(pool, r.EntityFieldID, parsedValues, allEntityFieldValues);

                     // finally, make sure the ValueListType column within the EntityField table is set to "List" because for check constraints we only allow the values specified in the list.
                     // check to see if the ValueListType is already set to "List", if not, update it
                     const sSQLCheck: string = `SELECT ValueListType FROM $\{this.qs(mj_core_schema(), \'EntityField\')\} WHERE ID='${r.EntityFieldID}'`;
                     const checkResultResult = await pool.query(sSQLCheck);
                     const checkResult = checkResultResult.recordset;
                     if (checkResult && checkResult.length > 0 && checkResult[0].ValueListType.trim().toLowerCase() !== 'list') {
                        const sSQL: string = `UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\} SET ValueListType='List' WHERE ID='${r.EntityFieldID}'`
                        await this.LogSQLAndExecute(pool, sSQL, `SQL text to update ValueListType for entity field ID ${r.EntityFieldID}`);
                     }
                  }
                  else {
                     // we are skipping the DB update, nothing to do, eh?
                  }
               }
               else {
                  // if we get here that means we don't have a simple condition in the check constraint that the RegEx could parse. If Advanced Generation is enabled, we will
                  // attempt to use an LLM to do things fancier now
                  if (configInfo.advancedGeneration?.enableAdvancedGeneration && 
                      configInfo.advancedGeneration?.features.find(f => f.name === 'ParseCheckConstraints' && f.enabled))  {
                     // the user has the feature turned on, let's generate a description of the constraint and then build a Validate function for the constraint 
                     // run this in parallel
                     generationPromises.push(this.runValidationGeneration(r, allEntityFields, !skipDBUpdate, currentUser));
                  }
               }
            }
         }

         // now for the table level constraints run the process for advanced generation
         for (const r of tableLevelResults) {
            if (configInfo.advancedGeneration?.enableAdvancedGeneration && 
               configInfo.advancedGeneration?.features.find(f => f.name === 'ParseCheckConstraints' && f.enabled))  {
              // the user has the feature turned on, let's generate a description of the constraint and then build a Validate function for the constraint 
              // run this in parallel
              generationPromises.push(this.runValidationGeneration(r, allEntityFields, !skipDBUpdate, currentUser));
           }
         }

         // await the completion of all generation promises here
         await Promise.all(generationPromises);
         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   /**
    * This method will load all generated code from the database - this is intended to be used when you are bypassing managing the metadata.
    * @param pool 
    * @param currentUser 
    */
   public async loadGeneratedCode(pool: CodeGenConnection, currentUser: UserInfo): Promise<boolean> {
      try {
         // right now we're just doing validator functions which are handled here
         return await this.manageEntityFieldValuesAndValidatorFunctions(pool, [], currentUser, true);
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   private async runValidationGeneration(r: any, allEntityFields: any[], generateNewCode: boolean, currentUser: UserInfo) {
      const generatedFunction = await this.generateValidatorFunctionFromCheckConstraint(r, allEntityFields, currentUser, generateNewCode);
      if (generatedFunction?.success) {
         // LLM was able to generate a function for us, so let's store it in the static array, will be used later when we emit the BaseEntity sub-class
         ManageMetadataBase._generatedValidators.push(generatedFunction);
      }   
   }

   /**
    * Generates a TypeScript field validator function from the text of a SQL CHECK constraint. 
    * @param data - the data object containing the entity name, column name, and constraint definition
    * @param allEntityFields - all of the entity fields in the system
    * @param currentUser - the current user
    * @param generateNewCode - a flag indicating whether or not to generate new code, this is set to false when we are just loading the generated code from the database.
    * @returns a data structure with the function text, function name, function description, and a success flag
    */
   protected async generateValidatorFunctionFromCheckConstraint(data: any, allEntityFields: any[], currentUser: UserInfo, generateNewCode: boolean): Promise<ValidatorResult> {
      const entityName = data.EntityName;
      const fieldName = data.ColumnName;
      const constraintDefinition = data.ConstraintDefinition;
      const generatedValidationFunctionName = data.GeneratedValidationFunctionName;
      const generatedValidationFunctionDescription = data.GeneratedValidationFunctionDescription;
      const generatedValidationFunctionCode = data.GeneratedValidationFunctionCode;
      const generatedValidationFunctionCheckConstraint = data.GeneratedValidationFunctionCheckConstraint;

      const returnResult = new ValidatorResult();
      returnResult.success = false;
      returnResult.entityName = entityName;
      returnResult.fieldName = fieldName;
      returnResult.generatedCodeId = data.GeneratedCodeID; // this came from the database, so we'll store it here for reference so we update the record later instead of creating a new one
      returnResult.sourceCheckConstraint = constraintDefinition;
      if (generatedValidationFunctionCheckConstraint === constraintDefinition) {
         // in this situation, we have an EXACT match of the previous version of a CHECK constraint and what is now the CHECK constraint - meaning it hasn't changed
         // in this situation if we have a generated function name, description, and code, we can just return that and not call the LLM
         if (generatedValidationFunctionName && generatedValidationFunctionDescription && generatedValidationFunctionCode) {
            returnResult.functionText = generatedValidationFunctionCode;
            returnResult.functionName = generatedValidationFunctionName;
            returnResult.functionDescription = generatedValidationFunctionDescription;
            returnResult.wasGenerated = false; // we did NOT just generate this code, was already saved
            returnResult.success = true;
            return returnResult;
         }
      }

      try {
         if (generateNewCode && configInfo.advancedGeneration?.enableAdvancedGeneration && configInfo.advancedGeneration?.features.find(f => f.name === 'ParseCheckConstraints' && f.enabled)) {
            // feature is enabled, so let's call the AI to generate a function for us
            const ag = new AdvancedGeneration();
            const entityFieldListInfo = allEntityFields.filter(item => item.Entity.trim().toLowerCase() === data.EntityName.trim().toLowerCase()).map(item => `   * ${item.Name} - ${item.Type}${item.AllowsNull ? ' (nullable)' : ' (not null)'}`).join('\n');

            // Use new API to parse check constraint
            const result = await ag.parseCheckConstraint(
               constraintDefinition,
               entityFieldListInfo,
               generatedValidationFunctionName,
               currentUser
            );

            if (result?.Description && result?.Code && result?.MethodName) {
               returnResult.functionText = result.Code;
               returnResult.functionName = result.MethodName;
               returnResult.functionDescription = result.Description;
               returnResult.aiModelID = result.ModelID;
               returnResult.wasGenerated = true; // we just generated this code
               returnResult.success = true;
            }
            else {
               logError(`Error generating field validator function from check constraint for entity ${entityName} and field ${fieldName}. LLM returned invalid result.`);
            }
         }
      }
      catch (e) {
         logError(e as string);
      }
      finally {
         return returnResult;
      }
   }

   protected async syncEntityFieldValues(ds: CodeGenConnection, entityFieldID: number, possibleValues: string[], allEntityFieldValues: any): Promise<boolean> {
      try {
         // first, get a list of all of the existing entity field values for the field already in the database
         const existingValues = allEntityFieldValues.filter((efv: { EntityFieldID: number; }) => efv.EntityFieldID === entityFieldID);
         // now, loop through the possible values and add any that are not already in the database

         // Step 1: for any existing value that is NOT in the list of possible Values, delete it
         let numRemoved: number = 0;
         const transaction = await ds.beginTransaction();
         try {
            for (const ev of existingValues) {
               if (!possibleValues.find(v => v === ev.Value)) {
                  // delete the value from the database
                  const sSQLDelete = `DELETE FROM $\{this.qs(mj_core_schema(), \'EntityFieldValue\')\} WHERE ID='${ev.ID}'`;
                  await this.LogSQLAndExecute(ds, sSQLDelete, `SQL text to delete entity field value ID ${ev.ID}`);
                  numRemoved++;
               }
            }

            // Step 2: for any possible value that is NOT in the list of existing values, add it
            let numAdded = 0;
            for (const v of possibleValues) {
               if (!existingValues.find((ev: { Value: string; }) => ev.Value === v)) {
                  // Generate a UUID for this new EntityFieldValue record
                  const newId = uuidv4();

                  // add the value to the database with explicit ID
                  const sSQLInsert = `INSERT INTO $\{this.qs(mj_core_schema(), \'EntityFieldValue\')\}
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('${newId}', '${entityFieldID}', ${1 + possibleValues.indexOf(v)}, '${v}', '${v}')`;
                  await this.LogSQLAndExecute(ds, sSQLInsert, `SQL text to insert entity field value with ID ${newId}`);
                  numAdded++;
               }
            }

            // Step 3: finally, for the existing values that are in the list of possible values, update the sequence to match the order in the possible values list
            let numUpdated = 0;
            for (const v of possibleValues) {
               const ev = existingValues.find((ev: { Value: string; }) => ev.Value === v);
               if (ev && ev.Sequence !== 1 + possibleValues.indexOf(v)) {
                  // update the sequence to match the order in the possible values list, if it doesn't already match
                  const sSQLUpdate = `UPDATE $\{this.qs(mj_core_schema(), \'EntityFieldValue\')\} SET Sequence=${1 + possibleValues.indexOf(v)} WHERE ID='${ev.ID}'`;
                  await this.LogSQLAndExecute(ds, sSQLUpdate, `SQL text to update entity field value sequence`);
                  numUpdated++;
               }
            }
            await transaction.commit();
         } catch (e) {
            await transaction.rollback();
            throw e;
         }

         return true;
      }
      catch (e) {
         logError(e as string);
         return false;
      }
   }

   protected parseCheckConstraintValues(constraintDefinition: string, fieldName: string, entityName: string): string[] | null {
      // This regex checks for the overall structure including field name and 'OR' sequences
      // SQL Server uses [FieldName]='Value' quoting, PostgreSQL uses "FieldName" or unquoted FieldName
      // We handle both: [FieldName], "FieldName", or bare FieldName
      // Note: Assuming fieldName does not contain regex special characters; otherwise, it needs to be escaped as well.
      const processedConstraint = constraintDefinition.replace(/(^|[=(\s])N'([^']*)'/g, "$1'$2'");

      // Build a regex fragment that matches the field name in any quoting style:
      // [FieldName] (SQL Server) or "FieldName" (PostgreSQL) or bare FieldName
      const quotedField = `(?:\\[${fieldName}\\]|"${fieldName}"|${fieldName})`;

      // Check for nested pattern: (Field IS NULL OR (Field='Value1' OR ...))
      const nestedNullRegex = new RegExp(`^\\(${quotedField} IS NULL OR \\(${quotedField}='[^']+'(?: OR ${quotedField}='[^']+?')+\\)\\)$`);
      if (nestedNullRegex.test(processedConstraint)) {
         // Extract values from nested pattern - same extraction logic works
         const valueRegex = new RegExp(`${quotedField}='([^']+)\'`, 'g');
         let match;
         const possibleValues: string[] = [];
         while ((match = valueRegex.exec(processedConstraint)) !== null) {
            if (match.index === valueRegex.lastIndex) {
               valueRegex.lastIndex++;
            }
            if (match[1]) {
               possibleValues.push(match[1]);
            }
         }
         return possibleValues.length > 0 ? possibleValues : null;
      }

      // Check for standard pattern with optional trailing IS NULL
      const structureRegex = new RegExp(`^\\(${quotedField}='[^']+'(?: OR ${quotedField}='[^']+?')+(?: OR ${quotedField} IS NULL)?\\)$`);
      if (!structureRegex.test(processedConstraint)) {
         return null;
      }
      else {
         // Regular expression to match the values within the single quotes specifically for the field
         const valueRegex = new RegExp(`${quotedField}='([^']+)\'`, 'g');
         let match;
         const possibleValues: string[] = [];

         // Use regex to find matches and extract the values
         while ((match = valueRegex.exec(processedConstraint)) !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (match.index === valueRegex.lastIndex) {
               valueRegex.lastIndex++;
            }

            // The first captured group contains the value
            if (match[1]) {
               possibleValues.push(match[1]);
            }
         }

         return possibleValues;
      }
   }


   protected createExcludeTablesAndSchemasFilter(fieldPrefix: string): string {
      let sExcludeTables: string = '';
      let sExcludeSchemas: string = '';
      if (configInfo.excludeTables) {
         for (let i = 0; i < configInfo.excludeTables.length; ++i) {
            const t = configInfo.excludeTables[i];
            sExcludeTables += (sExcludeTables.length > 0 ? ' AND ' : '') +
                              (t.schema.indexOf('%') > -1 ? ` NOT ( ${fieldPrefix}SchemaName LIKE '${t.schema}'` :
                                                                ` NOT ( ${fieldPrefix}SchemaName = '${t.schema}'`);
            sExcludeTables += (t.table.indexOf('%') > -1 ? ` AND ${fieldPrefix}TableName LIKE '${t.table}') ` :
                                                           ` AND ${fieldPrefix}TableName = '${t.table}') `);
         }
      }
      if (configInfo.excludeSchemas) {
         for (let i = 0; i < configInfo.excludeSchemas.length; ++i) {
            const s = configInfo.excludeSchemas[i];
            sExcludeSchemas += (sExcludeSchemas.length > 0 ? ' AND ' : '') +
                               (s.indexOf('%') > -1 ? `${fieldPrefix}SchemaName NOT LIKE '${s}'` : `${fieldPrefix}SchemaName <> '${s}'`);
         }
      }

      const sWhere = (sExcludeTables.length > 0 || sExcludeSchemas.length >0 ? ` AND ` : '') +
                     (sExcludeTables.length > 0 ? `(${sExcludeTables})` : '') +
                     (sExcludeSchemas.length > 0 ? (sExcludeTables.length > 0 ? ` AND ` : ``) + '(' + sExcludeSchemas + ')' : '');
      return sWhere;
   }

   protected async createNewEntities(pool: CodeGenConnection, currentUser: UserInfo): Promise<boolean> {
      try   {
         const sSQL = `SELECT * FROM $\{this.qs(mj_core_schema(), \'vwSQLTablesAndEntities\')\} WHERE EntityID IS NULL ` + this.createExcludeTablesAndSchemasFilter('');
         const newEntitiesResult = await pool.query(sSQL);
      const newEntities = newEntitiesResult.recordset;

         if (newEntities && newEntities.length > 0 ) {
            const md = new Metadata()
            const transaction = await pool.beginTransaction();
            try {
               // wrap in a transaction so we get all of it or none of it
               for ( let i = 0; i < newEntities.length; ++i) {
                  // process each of the new entities
                  await this.createNewEntity(pool, newEntities[i], md, currentUser);
               }
               await transaction.commit();
            } catch (e) {
               await transaction.rollback();
               throw e;
            }

            if (ManageMetadataBase.newEntityList.length > 0) {
               // only do this if we actually created new entities
               LogStatus(`   Done creating entities, refreshing metadata to reflect new entities...`)
               await md.Refresh();// refresh now since we've added some new entities
            }
         }
         return true; // if we get here, we succeeded
      }
      catch (e) {
         LogError(e);
         return false;
      }
   }

   protected async shouldCreateNewEntity(ds: CodeGenConnection, newEntity: any): Promise<{shouldCreate: boolean, validationMessage: string}> {
      // validate that the new entity meets our criteria for creation
      // criteria:
      // 1) entity has a field that is a primary key
      // validate all of these factors by getting the sql from SQL Server and check the result, if failure, shouldCreate=false and generate validation message, otherwise return empty validation message and true for shouldCreate.

      const query = this.isPostgreSQL
          ? `SELECT * FROM ${Metadata.Provider.ConfigData.MJCoreSchemaName}."spGetPrimaryKeyForTable"('${newEntity.TableName}', '${newEntity.SchemaName}')`
          : `EXEC ${Metadata.Provider.ConfigData.MJCoreSchemaName}.spGetPrimaryKeyForTable @TableName='${newEntity.TableName}', @SchemaName='${newEntity.SchemaName}'`;

      try {
          const resultResult = await ds.query(query);
      const result = resultResult.recordset;
          if (result.length === 0) {
              // No database PK constraint found - check if there's a soft PK defined in config
              if (this.hasSoftPrimaryKeyInConfig(newEntity.SchemaName, newEntity.TableName)) {
                 logStatus(`         ✓ No database PK for ${newEntity.SchemaName}.${newEntity.TableName}, but soft PK found in config - allowing entity creation`);
                 return { shouldCreate: true, validationMessage: '' };
              }
              return { shouldCreate: false, validationMessage: "No primary key found" };
          }

          return { shouldCreate: true, validationMessage: '' };
      }
      catch (error) {
         const errorMsg = 'Error validating new entity for table:' + newEntity?.TableName;
         console.error(errorMsg, error);
         return { shouldCreate: false, validationMessage: errorMsg };
      }
   }

   /**
    * Checks if a table has a soft primary key defined in the additionalSchemaInfo JSON file (configured in mj.config.cjs)
    */
   protected hasSoftPrimaryKeyInConfig(schemaName: string, tableName: string): boolean {
      // Check if additionalSchemaInfo is configured
      if (!configInfo.additionalSchemaInfo) {
         return false;
      }

      const configPath = path.join(currentWorkingDirectory, configInfo.additionalSchemaInfo);
      if (!fs.existsSync(configPath)) {
         logStatus(`         [Soft PK Check] Config file not found at: ${configPath}`);
         return false;
      }

      try {
         const config = ManageMetadataBase.getSoftPKFKConfig();
         if (!config || !config.tables) {
            logStatus(`         [Soft PK Check] Config file found but no tables array`);
            return false;
         }
         const tableConfig = config.tables.find(
            (t: { schemaName?: string; tableName?: string }) =>
               t.schemaName?.toLowerCase() === schemaName?.toLowerCase() &&
               t.tableName?.toLowerCase() === tableName?.toLowerCase()
         );
         const found = Boolean(tableConfig?.primaryKeys && tableConfig.primaryKeys.length > 0);
         if (!found) {
            logStatus(`         [Soft PK Check] No config found for ${schemaName}.${tableName} (config has ${config.tables.length} tables)`);
         }
         return found;
      } catch (e) {
         logStatus(`         [Soft PK Check] Error reading config: ${e}`);
         return false;
      }
   }

   protected async createNewEntityName(newEntity: any, currentUser: UserInfo): Promise<string> {
      const ag = new AdvancedGeneration();
      if (ag.featureEnabled('EntityNames')) {
         return this.newEntityNameWithAdvancedGeneration(ag, newEntity, currentUser);
      }
      else {
         return this.simpleNewEntityName(newEntity.SchemaName, newEntity.TableName);
      }
   }

   protected createNewEntityDisplayName(newEntity: any, newName: string): string | null {
      const rule = this.getNewEntityNameRule(newEntity.SchemaName);
      if (rule) {
         // we have a rule, so let's extract the DisplayName from the rule which is done
         // by removing the rule.EntityNamePrefix and rule.EntityNameSuffix from the newEntity.Name
         const prefix = rule.EntityNamePrefix.trim();
         const suffix = rule.EntityNameSuffix.trim();
         const newEntityName = newName.trim();
         let newEntityDisplayName = newEntityName; // start with the original name

         if (prefix?.length > 0 && newEntityDisplayName.startsWith(prefix)) {
            newEntityDisplayName = newEntityDisplayName.substring(prefix.length).trim(); // remove the prefix
         }
         if (suffix?.length > 0 && newEntityDisplayName.endsWith(suffix)) {
            newEntityDisplayName = newEntityDisplayName.substring(0, newEntityDisplayName.length - suffix.length).trim(); // remove the suffix
         }
         if (newEntityDisplayName.length > 0 && newEntityDisplayName !== newEntity.Name) {
            return newEntityDisplayName.trim();
         }
      }
      return null; // nothing to do here, the DisplayName can be null as it will just end up being the entity name
   }

   protected async newEntityNameWithAdvancedGeneration(ag: AdvancedGeneration, newEntity: any, currentUser: UserInfo): Promise<string> {
      const result = await ag.generateEntityName(newEntity.TableName, currentUser);
      if (result?.entityName) {
         return this.markupEntityName(newEntity.SchemaName, result.entityName);
      }
      else {
         console.warn('   >>> Advanced Generation Error: LLM returned invalid result, falling back to simple generated entity name');
         return this.simpleNewEntityName(newEntity.SchemaName, newEntity.TableName);
      }
   }
   
   protected simpleNewEntityName(schemaName: string, tableName: string): string {
      const convertedTableName = convertCamelCaseToHaveSpaces(tableName);
      const pluralName = generatePluralName(convertedTableName, {capitalizeFirstLetterOnly: true});
      return this.markupEntityName(schemaName, pluralName);
   }

   /**
    * Applies entity name prefix/suffix rules to a given entity name. Rules are resolved
    * from mj.config.cjs first, then from SchemaInfo database metadata as a fallback.
    * @param schemaName - the database schema name
    * @param entityName - the base entity name to apply prefix/suffix to
    */
   protected markupEntityName(schemaName: string, entityName: string): string {
      const rule = this.getNewEntityNameRule(schemaName);
      if (rule) {
         // found a matching rule, apply it
         return rule.EntityNamePrefix + entityName + rule.EntityNameSuffix;
      }
      else {
         // no matching rule, just return the entity name as is
         return entityName;
      }
   }

   /**
    * Resolves entity name prefix/suffix rules for a given schema. The resolution order is:
    * 1. Config file (mj.config.cjs NameRulesBySchema) - highest priority
    * 2. SchemaInfo database metadata (EntityNamePrefix/EntityNameSuffix columns) - fallback
    *
    * If both sources define rules for the same schema, the config file wins and a console
    * warning is emitted to alert the user of the override.
    */
   protected getNewEntityNameRule(schemaName: string): {SchemaName: string, EntityNamePrefix: string, EntityNameSuffix: string} | undefined {
      const configRule = this.getConfigNameRule(schemaName);
      const dbRule = this.getSchemaInfoNameRule(schemaName);

      if (configRule && dbRule) {
         this.logSchemaNameRuleConflict(schemaName, configRule, dbRule);
         return configRule;
      }

      return configRule ?? dbRule;
   }

   /**
    * Looks up a name rule from the mj.config.cjs NameRulesBySchema configuration.
    */
   private getConfigNameRule(schemaName: string): {SchemaName: string, EntityNamePrefix: string, EntityNameSuffix: string} | undefined {
      return configInfo.newEntityDefaults?.NameRulesBySchema?.find(r => {
         let schemaNameToUse = r.SchemaName;
         if (schemaNameToUse?.trim().toLowerCase() === '${mj_core_schema}') {
            schemaNameToUse = mj_core_schema();
         }
         return schemaNameToUse.trim().toLowerCase() === schemaName.trim().toLowerCase();
      });
   }

   /**
    * Looks up a name rule from the cached SchemaInfo database records.
    * Only returns a rule if at least one of EntityNamePrefix or EntityNameSuffix is set.
    */
   private getSchemaInfoNameRule(schemaName: string): {SchemaName: string, EntityNamePrefix: string, EntityNameSuffix: string} | undefined {
      const schemaRecord = ManageMetadataBase._schemaInfoRecords.find(
         s => s.SchemaName.trim().toLowerCase() === schemaName.trim().toLowerCase()
      );
      if (!schemaRecord) {
         return undefined;
      }
      // Only return a rule if at least one value is explicitly set
      if (schemaRecord.EntityNamePrefix == null && schemaRecord.EntityNameSuffix == null) {
         return undefined;
      }
      return {
         SchemaName: schemaRecord.SchemaName,
         EntityNamePrefix: schemaRecord.EntityNamePrefix ?? '',
         EntityNameSuffix: schemaRecord.EntityNameSuffix ?? '',
      };
   }

   /**
    * Logs a warning when both the config file and SchemaInfo database metadata define
    * entity name prefix/suffix rules for the same schema.
    */
   private logSchemaNameRuleConflict(
      schemaName: string,
      configRule: {EntityNamePrefix: string, EntityNameSuffix: string},
      dbRule: {EntityNamePrefix: string, EntityNameSuffix: string}
   ): void {
      const configDesc = `prefix="${configRule.EntityNamePrefix}", suffix="${configRule.EntityNameSuffix}"`;
      const dbDesc = `prefix="${dbRule.EntityNamePrefix}", suffix="${dbRule.EntityNameSuffix}"`;
      const hasDifference = configRule.EntityNamePrefix !== dbRule.EntityNamePrefix ||
                            configRule.EntityNameSuffix !== dbRule.EntityNameSuffix;
      if (hasDifference) {
         logStatus(`   ⚠️  Schema "${schemaName}" has entity name rules in both mj.config.cjs and SchemaInfo metadata:`);
         logStatus(`       Config file:      ${configDesc}`);
         logStatus(`       SchemaInfo (DB):   ${dbDesc}`);
         logStatus(`       Using config file values (config overrides database metadata).`);
      }
   }

   protected createNewUUID(): string {
      return uuidv4();
   }

   protected async createNewEntity(pool: CodeGenConnection, newEntity: any, md: Metadata, currentUser: UserInfo) {
      try {
         const {shouldCreate, validationMessage} = await this.shouldCreateNewEntity(pool, newEntity);
         if (shouldCreate) {
            // process a single new entity
            let newEntityName: string = await this.createNewEntityName(newEntity, currentUser);
            const newEntityDisplayName = this.createNewEntityDisplayName(newEntity, newEntityName);

            let suffix = '';
            const existingEntity = md.Entities.find(e => e.Name.toLowerCase() === newEntityName.toLowerCase());
            const existingEntityInNewEntityList = ManageMetadataBase.newEntityList.find(e => e === newEntityName); // check the newly created entity list to make sure we didn't create the new entity name along the way in this RUN of CodeGen as it wouldn't yet be in our metadata above
            if (existingEntity || existingEntityInNewEntityList) {
               // the generated name is already in place, so we need another name
               suffix = '__' + newEntity.SchemaName;
               newEntityName = newEntityName + suffix
               LogError(`   >>>> WARNING: Entity name already exists, so using ${newEntityName} instead. If you did not intend for this, please rename the ${newEntity.SchemaName}.${newEntity.TableName} table in the database.`)
            }

            const isNewSchema = await this.isSchemaNew(pool, newEntity.SchemaName);
            const newEntityID = this.createNewUUID();
            const sSQLInsert = this.createNewEntityInsertSQL(newEntityID, newEntityName, newEntity, suffix, newEntityDisplayName);
            await this.LogSQLAndExecute(pool, sSQLInsert, `SQL generated to create new entity ${newEntityName}`);

            // if we get here we created a new entity safely, otherwise we get exception

            // add it to the new entity list
            ManageMetadataBase.newEntityList.push(newEntityName);

            // next, check if this entity is in a schema that is new (e.g. no other entities have been added to this schema yet), if so and if
            // our config option is set to create new applications from new schemas, then create a new application for this schema
            let apps: string[] | null;
            if (isNewSchema && configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName) {
               // new schema and config option is to create a new application from the schema name so do that

               // check to see if the app already exists
               apps = await this.getApplicationIDForSchema(pool, newEntity.SchemaName);
               if (!apps || apps.length === 0) {
                  // doesn't already exist, so create it
                  const appUUID = this.createNewUUID();
                  const newAppID = await this.createNewApplication(pool, appUUID, newEntity.SchemaName, newEntity.SchemaName, currentUser);
                  if (newAppID) {
                     apps = [newAppID];
                  }
                  else {
                     LogError(`   >>>> ERROR: Unable to create new application for schema ${newEntity.SchemaName}`);
                  }
                  await md.Refresh(); // refresh now since we've added a new application, not super efficient to do this for each new application but that won't happen super
                                      // often so not a huge deal, would be more efficient do this in batch after all new apps are created but that would be an over optimization IMO
               }
            }
            else {
               // not a new schema, attempt to look up the application for this schema
               apps = await this.getApplicationIDForSchema(pool, newEntity.SchemaName);
            }

            if (apps && apps.length > 0) {
               if (configInfo.newEntityDefaults.AddToApplicationWithSchemaName) {
                  // only do this if the configuration setting is set to add new entities to applications for schema names
                  for (const appUUID of apps) {
                     const sSQLInsertApplicationEntity = `INSERT INTO ${mj_core_schema()}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('${appUUID}', '${newEntityID}', (SELECT COALESCE(MAX(Sequence),0)+1 FROM ${mj_core_schema()}.ApplicationEntity WHERE ApplicationID = '${appUUID}'))`;
                     await this.LogSQLAndExecute(pool, sSQLInsertApplicationEntity, `SQL generated to add new entity ${newEntityName} to application ID: '${appUUID}'`);
                  }
               }
               else {
                  // this is NOT an error condition, we do have an application UUID, but the configuration setting is to NOT add new entities to applications for schema names
               }
            }
            else {
               // this is an error condition, we should have an application for this schema, if we don't, log an error, non fatal, but should be logged
               LogError(`   >>>> ERROR: Unable to add new entity ${newEntityName} to an application because no Application has SchemaAutoAddNewEntities='${newEntity.SchemaName}'. To fix this, update an existing Application record or create a new one with SchemaAutoAddNewEntities='${newEntity.SchemaName}'.`);
            }

            // next up, we need to check if we're configured to add permissions for new entities, and if so, add them
            if (configInfo.newEntityDefaults.PermissionDefaults && configInfo.newEntityDefaults.PermissionDefaults.AutoAddPermissionsForNewEntities) {
               // we are asked to add permissions for new entities, so do that by looping through the permissions and adding them
               const permissions = configInfo.newEntityDefaults.PermissionDefaults.Permissions;
               for (const p of permissions) {
                  const RoleID = md.Roles.find(r => r.Name.trim().toLowerCase() === p.RoleName.trim().toLowerCase())?.ID;
                  if (RoleID) {
                     const sSQLInsertPermission = `INSERT INTO ${mj_core_schema()}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('${newEntityID}', '${RoleID}', ${p.CanRead ? 1 : 0}, ${p.CanCreate ? 1 : 0}, ${p.CanUpdate ? 1 : 0}, ${p.CanDelete ? 1 : 0})`;
                     await this.LogSQLAndExecute(pool, sSQLInsertPermission, `SQL generated to add new permission for entity ${newEntityName} for role ${p.RoleName}`);
                  }
                  else
                     LogError(`   >>>> ERROR: Unable to find Role ID for role ${p.RoleName} to add permissions for new entity ${newEntityName}`);
               }
            }

            LogStatus(`   Created new entity ${newEntityName} for table ${newEntity.SchemaName}.${newEntity.TableName}`)
         }
         else {
            LogStatus(`   Skipping new entity ${newEntity.TableName} because it doesn't qualify to be created. Reason: ${validationMessage}`)
            return;
         }
      }
      catch (e) {
         const errMsg = e instanceof Error ? e.message : String(e);
         const errStack = e instanceof Error ? e.stack : '';
         LogError(`Failed to create new entity ${newEntity?.TableName}: ${errMsg}`);
         if (errStack) {
            LogError(`   Stack trace: ${errStack}`);
         }
      }
   }

   protected async isSchemaNew(pool: CodeGenConnection, schemaName: string): Promise<boolean> {
      // check to see if there are any entities in the db with this schema name
      const sSQL: string = `SELECT COUNT(*) AS Count FROM $\{this.qs(mj_core_schema(), \'Entity\')\} WHERE SchemaName = '${schemaName}'`;
      const resultResult = await pool.query(sSQL);
      const result = resultResult.recordset;
      return result && result.length > 0 ? result[0].Count === 0 : true;
   }

   /**
    * Creates a new application using direct SQL INSERT to ensure it's captured in SQL logging.
    * The Path field is auto-generated from Name using the same slug logic as MJApplicationEntityServer.
    *
    * @param pool SQL connection pool
    * @param appID Pre-generated UUID for the application
    * @param appName Name of the application
    * @param schemaName Schema name for SchemaAutoAddNewEntities
    * @param currentUser Current user for entity operations (unused but kept for signature compatibility)
    * @returns The application ID if successful, null otherwise
    */
   protected async createNewApplication(pool: CodeGenConnection, appID: string, appName: string, schemaName: string, currentUser: UserInfo): Promise<string | null>{
      try {
         // Generate Path from Name using slug conversion:
         // 1. Convert to lowercase
         // 2. Replace spaces with hyphens
         // 3. Remove special characters (keep only alphanumeric and hyphens)
         const path = appName
            .toLowerCase()
            .replace(/\s+/g, '-')           // spaces to hyphens
            .replace(/[^a-z0-9-]/g, '')     // remove special chars
            .replace(/-+/g, '-')            // collapse multiple hyphens
            .replace(/^-|-$/g, '');         // trim hyphens from start/end

         const sSQL = `INSERT INTO $\{this.qs(mj_core_schema(), \'Application\')\} (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('${appID}', '${appName}', 'Generated for schema', '${schemaName}', '${path}', 1)`;
         await this.LogSQLAndExecute(pool, sSQL, `SQL generated to create new application ${appName}`);
         LogStatus(`Created new application ${appName} with Path: ${path}`);
         return appID;
      }
      catch (e) {
         LogError(`Failed to create new application ${appName} for schema ${schemaName}`, null, e);
         return null;
      }
   }

   protected async applicationExists(pool: CodeGenConnection, applicationName: string): Promise<boolean>{
      const sSQL: string = `SELECT ID FROM $\{this.qs(mj_core_schema(), \'Application\')\} WHERE Name = '${applicationName}'`;
      const resultResult = await pool.query(sSQL);
      const result = resultResult.recordset;
      return result && result.length > 0 ? result[0].ID.length > 0 : false;
   }

   protected async getApplicationIDForSchema(pool: CodeGenConnection, schemaName: string): Promise<string[] | null>{
      // get all the apps each time from DB as we might be adding, don't use Metadata here for that reason
      const sSQL: string = `SELECT ID, Name, SchemaAutoAddNewEntities FROM $\{this.qs(mj_core_schema(), \'vwApplications\')\}`;
      const resultResult = await pool.query(sSQL);
      const result = resultResult.recordset;

      if (!result || result.length === 0) {
         // no applications found, return null
         return null;
      }
      else {
         const apps = result.filter((a: ApplicationInfo) =>  {
            if (a.SchemaAutoAddNewEntities && a.SchemaAutoAddNewEntities.length > 0) {
               const schemas = a.SchemaAutoAddNewEntities.split(",");
               if (schemas && schemas.length > 0) {
                  return schemas.find((s: string) => s.trim().toLowerCase() === schemaName.trim().toLowerCase());
               }
            }
         });
         return apps.map((a: ApplicationInfo) => a.ID);
      }
   }

   /**
    * Adds a newly created entity to the application(s) that match its schema name.
    * If no application exists for the schema and config allows it, creates one.
    * Shared by both table-backed entity creation and virtual entity creation.
    */
   protected async addEntityToApplicationForSchema(
      pool: CodeGenConnection,
      entityId: string,
      entityName: string,
      schemaName: string,
      currentUser: UserInfo
   ): Promise<void> {
      let apps = await this.getApplicationIDForSchema(pool, schemaName);

      // If no app exists and config says to create one for new schemas, create it
      if ((!apps || apps.length === 0) && configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName) {
         const appUUID = this.createNewUUID();
         const newAppID = await this.createNewApplication(pool, appUUID, schemaName, schemaName, currentUser);
         if (newAppID) {
            apps = [newAppID];
            const md = new Metadata();
            await md.Refresh();
         } else {
            LogError(`   >>>> ERROR: Unable to create new application for schema ${schemaName}`);
         }
      }

      if (apps && apps.length > 0) {
         if (configInfo.newEntityDefaults.AddToApplicationWithSchemaName) {
            for (const appUUID of apps) {
               const sSQLInsert = `INSERT INTO ${mj_core_schema()}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('${appUUID}', '${entityId}', (SELECT COALESCE(MAX(Sequence),0)+1 FROM ${mj_core_schema()}.ApplicationEntity WHERE ApplicationID = '${appUUID}'))`;
               await this.LogSQLAndExecute(pool, sSQLInsert, `SQL generated to add entity ${entityName} to application ID: '${appUUID}'`);
            }
         }
      } else {
         LogError(`   >>>> WARNING: No application found for schema ${schemaName} to add entity ${entityName}`);
      }
   }

   /**
    * Adds default permissions for a newly created entity based on config settings.
    * Shared by both table-backed entity creation and virtual entity creation.
    */
   protected async addDefaultPermissionsForEntity(
      pool: CodeGenConnection,
      entityId: string,
      entityName: string
   ): Promise<void> {
      if (!configInfo.newEntityDefaults.PermissionDefaults?.AutoAddPermissionsForNewEntities) {
         return;
      }

      const md = new Metadata();
      const permissions = configInfo.newEntityDefaults.PermissionDefaults.Permissions;
      for (const p of permissions) {
         const RoleID = md.Roles.find(r => r.Name.trim().toLowerCase() === p.RoleName.trim().toLowerCase())?.ID;
         if (RoleID) {
            const sSQLInsert = `INSERT INTO ${mj_core_schema()}.EntityPermission
                                 (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                 ('${entityId}', '${RoleID}', ${p.CanRead ? 1 : 0}, ${p.CanCreate ? 1 : 0}, ${p.CanUpdate ? 1 : 0}, ${p.CanDelete ? 1 : 0})`;
            await this.LogSQLAndExecute(pool, sSQLInsert, `SQL generated to add permission for entity ${entityName} for role ${p.RoleName}`);
         } else {
            LogError(`   >>>> ERROR: Unable to find Role ID for role ${p.RoleName} to add permissions for entity ${entityName}`);
         }
      }
   }

   protected createNewEntityInsertSQL(newEntityUUID: string, newEntityName: string, newEntity: any, newEntitySuffix: string, newEntityDisplayName: string | null): string {
      const newEntityDefaults = configInfo.newEntityDefaults;
      const newEntityDescriptionEscaped = newEntity.Description ? `'${newEntity.Description.replace(/'/g, "''")}` : null;
      const sSQLInsert = `
      INSERT INTO $\{this.qs(mj_core_schema(), \'Entity\')\} (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         ${newEntityDefaults.TrackRecordChanges === undefined ? '' : ', TrackRecordChanges'}
         ${newEntityDefaults.AuditRecordAccess === undefined ? '' : ', AuditRecordAccess'}
         ${newEntityDefaults.AuditViewRuns === undefined ? '' : ', AuditViewRuns'}
         ${newEntityDefaults.AllowAllRowsAPI === undefined ? '' : ', AllowAllRowsAPI'}
         ${newEntityDefaults.AllowCreateAPI === undefined ? '' : ', AllowCreateAPI'}
         ${newEntityDefaults.AllowUpdateAPI === undefined ? '' : ', AllowUpdateAPI'}
         ${newEntityDefaults.AllowDeleteAPI === undefined ? '' : ', AllowDeleteAPI'}
         ${newEntityDefaults.UserViewMaxRows === undefined ? '' : ', UserViewMaxRows'}
      )
      VALUES (
         '${newEntityUUID}',
         '${newEntityName}',
         ${newEntityDisplayName ? `'${newEntityDisplayName}'` : 'NULL'},
         ${newEntityDescriptionEscaped ? newEntityDescriptionEscaped : 'NULL' /*if no description, then null*/},
         ${newEntitySuffix && newEntitySuffix.length > 0 ? `'${newEntitySuffix}'` : 'NULL'},
         '${newEntity.TableName}',
         'vw${generatePluralName(newEntity.TableName, {capitalizeFirstLetterOnly: true}) + (newEntitySuffix && newEntitySuffix.length > 0 ? newEntitySuffix : '')}',
         '${newEntity.SchemaName}',
         1,
         ${newEntityDefaults.AllowUserSearchAPI === undefined ? 1 : newEntityDefaults.AllowUserSearchAPI ? 1 : 0}
         ${newEntityDefaults.TrackRecordChanges === undefined ? '' : ', ' + (newEntityDefaults.TrackRecordChanges ? '1' : '0')}
         ${newEntityDefaults.AuditRecordAccess === undefined ? '' : ', ' + (newEntityDefaults.AuditRecordAccess ? '1' : '0')}
         ${newEntityDefaults.AuditViewRuns === undefined ? '' : ', ' + (newEntityDefaults.AuditViewRuns ? '1' : '0')}
         ${newEntityDefaults.AllowAllRowsAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowAllRowsAPI ? '1' : '0')}
         ${newEntityDefaults.AllowCreateAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowCreateAPI ? '1' : '0')}
         ${newEntityDefaults.AllowUpdateAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowUpdateAPI ? '1' : '0')}
         ${newEntityDefaults.AllowDeleteAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowDeleteAPI ? '1' : '0')}
         ${newEntityDefaults.UserViewMaxRows === undefined ? '' : ', ' + (newEntityDefaults.UserViewMaxRows)}
      )
   `;

      return sSQLInsert;
   }



   /**
    * Apply Advanced Generation features - Smart Field Identification and Form Layout Generation
    */
   protected async applyAdvancedGeneration(pool: CodeGenConnection, excludeSchemas: string[], currentUser: UserInfo): Promise<boolean> {
      try {
         const ag = new AdvancedGeneration();
         if (!ag.enabled) {
            return true;
         }

         // Get list of entities to process
         // If forceRegeneration.enabled is true, process ALL entities
         // Otherwise, only process new or modified entities
         let entitiesToProcess: string[] = [];
         let whereClause = '';

         if (configInfo.forceRegeneration?.enabled) {
            // Force regeneration mode - process all entities (or filtered by entityWhereClause)
            logStatus(`      Force regeneration enabled - processing all entities...`);

            whereClause = 'e.VirtualEntity = 0';
            if (configInfo.forceRegeneration.entityWhereClause && configInfo.forceRegeneration.entityWhereClause.trim().length > 0) {
               whereClause += ` AND (${configInfo.forceRegeneration.entityWhereClause})`;
               logStatus(`         Filtered by: ${configInfo.forceRegeneration.entityWhereClause}`);
            }
            whereClause += ` AND e.SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         } else {
            // Normal mode - only process new or modified entities
            // Deduplicate in case an entity appears in both lists
            entitiesToProcess = [
               ...new Set([
                  ...ManageMetadataBase.newEntityList,
                  ...ManageMetadataBase.modifiedEntityList
               ])
            ];

            if (entitiesToProcess.length === 0) {
               return true;
            }

            logStatus(`      Advanced Generation enabled, processing ${entitiesToProcess.length} entities...`);
            whereClause = `e.VirtualEntity = 0 AND e.Name IN (${entitiesToProcess.map(name => `'${name}'`).join(',')}) AND e.SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         }

         // Get entity details for entities that need processing
         const entitiesSQL = `
            SELECT
               e.ID,
               e.Name,
               e.Description,
               e.SchemaName,
               e.BaseTable,
               e.ParentID
            FROM
               $\{this.qs(mj_core_schema(), \'vwEntities\')\} e
            WHERE
               ${whereClause}
            ORDER BY
               e.Name
         `;

         const entitiesResult = await pool.query(entitiesSQL);
         const entities = entitiesResult.recordset;

         if (entities.length === 0) {
            return true;
         }

         // Get ALL fields for ALL entities in a single query
         const entityIds = entities.map((e: any) => `'${e.ID}'`).join(',');
         const fieldsSQL = `
            SELECT
               ef.EntityID,
               ef.ID,
               ef.Name,
               ef.Type,
               ef.Category,
               ef.AllowsNull,
               ef.DisplayName,
               ef.IsPrimaryKey,
               ef.IsUnique,
               ef.Description,
               ef.AutoUpdateIsNameField,
               ef.AutoUpdateDefaultInView,
               ef.AutoUpdateIncludeInUserSearchAPI,
               ef.AutoUpdateCategory,
               ef.AutoUpdateDisplayName,
               ef.EntityIDFieldName,
               ef.RelatedEntity,
               ef.IsVirtual,
               ef.AllowUpdateAPI,
               ef.IsNameField,
               ef.DefaultInView,
               ef.IncludeInUserSearchAPI
            FROM
               $\{this.qs(mj_core_schema(), \'vwEntityFields\')\} ef
            WHERE
               ef.EntityID IN (${entityIds})
            ORDER BY
               ef.EntityID,
               ef.Sequence
         `;

         const fieldsResult = await pool.query(fieldsSQL);
         const allFields = fieldsResult.recordset;

         // Get EntitySettings for all entities (for existing category icons/info)
         const settingsSQL = `
            SELECT
               es.EntityID,
               es.Name,
               es.Value
            FROM
               $\{this.qs(mj_core_schema(), \'EntitySetting\')\} es
            WHERE
               es.EntityID IN (${entityIds})
               AND es.Name = 'FieldCategoryInfo'
         `;
         const settingsResult = await pool.query(settingsSQL);
         const allSettings = settingsResult.recordset;

         // Group settings by entity
         const settingsByEntity: Record<string, any[]> = {};
         for (const setting of allSettings) {
            if (!settingsByEntity[setting.EntityID]) {
               settingsByEntity[setting.EntityID] = [];
            }
            settingsByEntity[setting.EntityID].push(setting);
         }

         // Attach settings to entities
         for (const entity of entities) {
            entity.Settings = settingsByEntity[entity.ID] || [];
         }

         // Process entities in batches with parallelization
         return await this.processEntitiesBatched(pool, entities, allFields, ag, currentUser);
      } catch (error) {
         logError(`Advanced Generation failed: ${error}`);
         return false;
      }
   }

   /**
    * Process entities in batches with parallel execution
    * @param pool Database connection pool
    * @param entities Entities to process
    * @param allFields All fields for all entities (will be filtered per entity)
    * @param ag AdvancedGeneration instance
    * @param currentUser User context
    * @param batchSize Number of entities to process in parallel (default 5)
    */
   protected async processEntitiesBatched(
      pool: CodeGenConnection,
      entities: any[],
      allFields: any[],
      ag: AdvancedGeneration,
      currentUser: UserInfo,
      batchSize: number = 5
   ): Promise<boolean> {
      let processedCount = 0;
      let errorCount = 0;

      // Process in batches
      for (let i = 0; i < entities.length; i += batchSize) {
         const batch = entities.slice(i, i + batchSize);

         // Process batch in parallel
         const batchResults = await Promise.allSettled(
            batch.map(entity => this.processEntityAdvancedGeneration(pool, entity, allFields, ag, currentUser))
         );

         // Tally results
         for (const result of batchResults) {
            if (result.status === 'fulfilled') {
               processedCount++;
            } else {
               errorCount++;
               logError(`         Error processing entity: ${result.reason}`);
            }
         }

         logStatus(`      Progress: ${processedCount}/${entities.length} entities processed`);
      }

      logStatus(`      Advanced Generation complete: ${processedCount} entities processed, ${errorCount} errors`);
      return errorCount === 0;
   }

   /**
    * Process advanced generation for a single entity
    * @param pool Database connection pool
    * @param entity Entity to process
    * @param allFields All fields for all entities (will be filtered for this entity)
    * @param ag AdvancedGeneration instance
    * @param currentUser User context
    */
   protected async processEntityAdvancedGeneration(
      pool: CodeGenConnection,
      entity: EntityInfo,
      allFields: any[],
      ag: AdvancedGeneration,
      currentUser: UserInfo
   ): Promise<void> {
      try {
         // Filter fields for this entity (client-side filtering)
         const fields = allFields.filter((f: any) => f.EntityID === entity.ID);

         // Determine if this is a new entity (for DefaultForNewUser decision)
         const isNewEntity = ManageMetadataBase.newEntityList.includes(entity.Name);

         // Smart Field Identification
         // Only run if at least one field allows auto-update for any of the smart field properties
         if (fields.some((f: any) => f.AutoUpdateIsNameField || f.AutoUpdateDefaultInView || f.AutoUpdateIncludeInUserSearchAPI)) {
            const fieldAnalysis = await ag.identifyFields({
               Name: entity.Name,
               Description: entity.Description,
               Fields: fields
            }, currentUser);

            if (fieldAnalysis) {
               await this.applySmartFieldIdentification(pool, entity.ID, fields, fieldAnalysis);
            }
         }

         // Form Layout Generation
         // Only run if at least one field allows auto-update
         const needsCategoryGeneration = fields.some((f: any) => f.AutoUpdateCategory && (!f.Category || f.Category.trim() === ''));
         if (needsCategoryGeneration) {
            // Build IS-A parent chain context if this entity has a parent
            const parentChainContext = this.buildParentChainContext(entity, fields);

            const layoutAnalysis = await ag.generateFormLayout({
               Name: entity.Name,
               Description: entity.Description,
               SchemaName: entity.SchemaName,
               Settings: entity.Settings,
               Fields: fields,
               ...parentChainContext
            }, currentUser, isNewEntity);

            if (layoutAnalysis) {
               await this.applyFormLayout(pool, entity, fields, layoutAnalysis, isNewEntity);
               logStatus(`         Applied form layout for ${entity.Name}`);
            }
         }
      }
      catch (ex) {
         logError('Error Processing Entity Advanced Generation', ex)
      }
   }

   /**
    * Builds IS-A parent chain context for an entity, computing which parent each
    * inherited field originates from. Used to provide the LLM with inheritance
    * awareness during form layout generation.
    *
    * Returns an empty object for entities without parents, so it can be safely spread
    * into the entity object passed to generateFormLayout().
    */
   protected buildParentChainContext(
      entity: { ParentID?: string },
      fields: Array<{ Name: string; IsVirtual?: boolean; AllowUpdateAPI?: boolean; IsPrimaryKey?: boolean }>
   ): { ParentChain?: Array<{ entityID: string; entityName: string }>; IsChildEntity?: boolean } {
      if (!entity.ParentID) {
         return {};
      }

      // Walk the IS-A chain using in-memory metadata
      const md = new Metadata();
      const allEntities = md.Entities;
      const parentChain: Array<{ entityID: string; entityName: string }> = [];
      const visited = new Set<string>();
      let currentParentID: string | null = entity.ParentID;

      while (currentParentID) {
         if (visited.has(currentParentID)) break; // circular reference guard
         visited.add(currentParentID);

         const parentEntity = allEntities.find(e => e.ID === currentParentID);
         if (!parentEntity) break;

         parentChain.push({ entityID: parentEntity.ID, entityName: parentEntity.Name });
         currentParentID = parentEntity.ParentID ?? null;
      }

      if (parentChain.length === 0) {
         return {};
      }

      // Annotate each field with its source parent (if inherited)
      // An IS-A inherited field is: IsVirtual=true, AllowUpdateAPI=true, not PK, not __mj_
      for (const field of fields) {
         if (field.IsVirtual && field.AllowUpdateAPI && !field.IsPrimaryKey && !field.Name.startsWith('__mj_')) {
            const sourceParent = this.findFieldSourceParent(field.Name, parentChain, allEntities);
            if (sourceParent) {
               (field as Record<string, unknown>).InheritedFromEntityID = sourceParent.entityID;
               (field as Record<string, unknown>).InheritedFromEntityName = sourceParent.entityName;
            }
         }
      }

      return { ParentChain: parentChain, IsChildEntity: true };
   }

   /**
    * For an inherited field, walks the parent chain to find which specific parent entity
    * originally defines this field (by matching non-virtual fields on each parent).
    */
   protected findFieldSourceParent(
      fieldName: string,
      parentChain: Array<{ entityID: string; entityName: string }>,
      allEntities: EntityInfo[]
   ): { entityID: string; entityName: string } | null {
      for (const parent of parentChain) {
         const parentEntity = allEntities.find(e => e.ID === parent.entityID);
         if (!parentEntity) continue;

         // Check if this parent has a non-virtual field with this name
         const hasField = parentEntity.Fields.some(f => f.Name === fieldName && !f.IsVirtual);
         if (hasField) {
            return parent;
         }
      }
      return null;
   }

   /**
    * Apply smart field identification results to entity fields
    */
   protected async applySmartFieldIdentification(
      pool: CodeGenConnection,
      entityId: string,
      fields: any[],
      result: SmartFieldIdentificationResult
   ): Promise<void> {
      const sqlStatements: string[] = [];

      // Find the name field (exactly one)
      const nameField = fields.find(f => f.Name === result.nameField);

      if (nameField && nameField.AutoUpdateIsNameField && nameField.ID && !nameField.IsNameField /*don't waste SQL to set the value if IsNameField already set */) {
         sqlStatements.push(`
            UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\}
            SET IsNameField = 1
            WHERE ID = '${nameField.ID}'
            AND AutoUpdateIsNameField = 1
         `);
      } else if (!nameField) {
         logError(`Smart field identification returned invalid nameField: '${result.nameField}' not found in entity fields`);
      }

      // Find all default in view fields (one or more)
      const defaultInViewFields = fields.filter(f =>
         result.defaultInView.includes(f.Name) && f.AutoUpdateDefaultInView && f.ID
      );

      // Warn about any fields that weren't found
      const missingFields = result.defaultInView.filter(name =>
         !fields.some(f => f.Name === name)
      );
      if (missingFields.length > 0) {
         logError(`Smart field identification returned invalid defaultInView fields: ${missingFields.join(', ')} not found in entity`);
      }

      // Build update statements for all default in view fields
      for (const field of defaultInViewFields) {
         if (!field.DefaultInView) {
            // only set these when DefaultInView not already on, otherwise wasteful
            sqlStatements.push(`
               UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\}
               SET DefaultInView = 1
               WHERE ID = '${field.ID}'
               AND AutoUpdateDefaultInView = 1
            `);
         }
      }

      // Find all searchable fields (one or more) - for IncludeInUserSearchAPI
      if (result.searchableFields && result.searchableFields.length > 0) {
         const searchableFields = fields.filter(f =>
            result.searchableFields.includes(f.Name) && f.AutoUpdateIncludeInUserSearchAPI && f.ID
         );

         // Warn about any fields that weren't found
         const missingSearchableFields = result.searchableFields.filter(name =>
            !fields.some(f => f.Name === name)
         );
         if (missingSearchableFields.length > 0) {
            logError(`Smart field identification returned invalid searchableFields: ${missingSearchableFields.join(', ')} not found in entity`);
         }

         // Build update statements for all searchable fields
         for (const field of searchableFields) {
            if (!field.IncludeInUserSearchAPI) {
               // only set this if IncludeInUserSearchAPI isn't already set
               sqlStatements.push(`
                  UPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\}
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '${field.ID}'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               `);
            }
         }
      }

      // Execute all updates in one batch
      if (sqlStatements.length > 0) {
         const combinedSQL = sqlStatements.join('\n');
         try {
            await this.LogSQLAndExecute(pool, combinedSQL, `Set field properties for entity`, false);
         }
         catch (ex) {
            logError('Error executing combined smart field SQL: ', ex)
         }
      }
   }

   /**
    * Apply form layout generation results to set category on entity fields.
    * Delegates to shared methods for category assignment, icon, and category info persistence.
    * @param pool Database connection pool
    * @param entityId Entity ID to update
    * @param fields Entity fields
    * @param result Form layout result from LLM
    * @param isNewEntity If true, apply entityImportance; if false, skip it
    */
   protected async applyFormLayout(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fields: Array<{ ID: string; Name: string; Category: string | null; AutoUpdateCategory: boolean; AutoUpdateDisplayName: boolean, GeneratedFormSection: string, DisplayName: string, ExtendedType: string, CodeType: string }>,
      result: FormLayoutResult,
      isNewEntity: boolean = false
   ): Promise<void> {
      const existingCategories = this.buildExistingCategorySet(fields);

      await this.applyFieldCategories(pool, entity, fields, result.fieldCategories, existingCategories);

      if (result.entityIcon) {
         await this.applyEntityIcon(pool, entity.ID, result.entityIcon);
      }

      // Resolve categoryInfo from new or legacy format
      const categoryInfoToStore = result.categoryInfo ||
         (result.categoryIcons ?
            Object.fromEntries(
               Object.entries(result.categoryIcons).map(([cat, icon]) => [cat, { icon, description: '' }])
            ) as Record<string, FieldCategoryInfo> : null);

      if (categoryInfoToStore) {
         await this.applyCategoryInfoSettings(pool, entity.ID, categoryInfoToStore);
      }

      if (isNewEntity && result.entityImportance) {
         await this.applyEntityImportance(pool, entity.ID, result.entityImportance);
      }
   }

   // ─────────────────────────────────────────────────────────────────
   // Shared category / icon / settings persistence methods
   // Used by both the regular entity pipeline and VE decoration pipeline
   // ─────────────────────────────────────────────────────────────────

   /**
    * Builds a set of existing category names from entity fields.
    * Used to enforce category stability (prevent renaming).
    */
   protected buildExistingCategorySet(fields: Array<{ Category: string | null }>): Set<string> {
      const existingCategories = new Set<string>();
      for (const field of fields) {
         if (field.Category && field.Category.trim() !== '') {
            existingCategories.add(field.Category);
         }
      }
      return existingCategories;
   }

   /**
    * Applies category, display name, extended type, and code type to entity fields.
    * Enforces stability rules: fields with existing categories cannot move to NEW categories.
    * All SQL updates are batched into a single execution for performance.
    */
   protected async applyFieldCategories(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fields: Array<{ ID: string; Name: string; Category: string | null; AutoUpdateCategory: boolean; AutoUpdateDisplayName: boolean, GeneratedFormSection: string, DisplayName: string, ExtendedType: string, CodeType: string}>,
      fieldCategories: Array<{
         fieldName: string;
         category: string;
         displayName?: string;
         extendedType?: string | null;
         codeType?: string | null;
         reason?: string;
      }>,
      existingCategories: Set<string>
   ): Promise<void> {
      const sqlStatements: string[] = [];

      for (const fieldCategory of fieldCategories) {
         const field = fields.find(f => f.Name === fieldCategory.fieldName);

         if (field && field.AutoUpdateCategory && field.ID) {
            // Override category to "System Metadata" for __mj_ fields (system audit fields)
            let category = fieldCategory.category;
            if (field.Name.startsWith('__mj_')) {
               category = 'System Metadata';
            }

            // ENFORCEMENT: Prevent category renaming
            const fieldHasExistingCategory = field.Category != null && field.Category.trim() !== '';
            const categoryIsNew = !existingCategories.has(category);

            if (fieldHasExistingCategory && categoryIsNew) {
               logStatus(`         Rejected category change for field '${field.Name}': cannot move from existing category '${field.Category}' to new category '${category}'. Keeping original category.`);
               category = field.Category!;
            }

            const setClauses: string[] = []
            
            if (field.Category !== category) {
               setClauses.push(
                  `Category = '${category.replace(/'/g, "''")}'`
               );
            }

            if (field.GeneratedFormSection !== 'Category') {
               setClauses.push(`GeneratedFormSection = 'Category'`)
            }
           
            if (fieldCategory.displayName && field.AutoUpdateDisplayName && field.DisplayName !== fieldCategory.displayName) {
               setClauses.push(`DisplayName = '${fieldCategory.displayName.replace(/'/g, "''")}'`);
            }

            if (fieldCategory.extendedType !== undefined && field.ExtendedType !== fieldCategory.extendedType) {
               const extendedType = fieldCategory.extendedType === null ? 'NULL' : `'${String(fieldCategory.extendedType).replace(/'/g, "''")}'`;
               setClauses.push(`ExtendedType = ${extendedType}`);
            }

            if (fieldCategory.codeType !== undefined && field.CodeType !== fieldCategory.codeType) {
               const codeType = fieldCategory.codeType === null ? 'NULL' : `'${String(fieldCategory.codeType).replace(/'/g, "''")}'`;
               setClauses.push(`CodeType = ${codeType}`);
            }

            if (setClauses.length > 0) {
               // only generate an UPDATE if we have 1+ set clause
               sqlStatements.push(`\n-- UPDATE Entity Field Category Info ${entity.Name}.${field.Name} \nUPDATE $\{this.qs(mj_core_schema(), \'EntityField\')\}
SET 
   ${setClauses.join(',\n   ')}
WHERE 
   ID = '${field.ID}' AND AutoUpdateCategory = 1`);
            }
         } else if (!field) {
            logError(`Form layout returned invalid fieldName: '${fieldCategory.fieldName}' not found in entity`);
         }
      }

      if (sqlStatements.length > 0) {
         try {
            await this.LogSQLAndExecute(pool, sqlStatements.join('\n'), `Set categories for ${sqlStatements.length} fields`, false);
         }
         catch (ex) {
            logError('Error Applying Field Categories', ex)
         }
      }
   }

   /**
    * Sets the entity icon if the entity doesn't already have one.
    */
   protected async applyEntityIcon(
      pool: CodeGenConnection,
      entityId: string,
      entityIcon: string
   ): Promise<void> {
      if (!entityIcon || entityIcon.trim().length === 0) return;

      const checkSQL = `SELECT Icon FROM $\{this.qs(mj_core_schema(), \'Entity\')\} WHERE ID = '${entityId}'`;
      const entityCheck = await pool.query(checkSQL);

      if (entityCheck.recordset.length > 0) {
         const currentIcon = entityCheck.recordset[0].Icon;
         if (!currentIcon || currentIcon.trim().length === 0) {
            const escapedIcon = entityIcon.replace(/'/g, "''");
            const updateSQL = `
               UPDATE $\{this.qs(mj_core_schema(), \'Entity\')\}
               SET Icon = '${escapedIcon}', __mj_UpdatedAt = ${this.utcNow()}
               WHERE ID = '${entityId}'
            `;
            try {
               await this.LogSQLAndExecute(pool, updateSQL, `Set entity icon to ${entityIcon}`, false);
               logStatus(`  Set entity icon: ${entityIcon}`);
            }
            catch (ex) {
               logError('Error Applying Entity Icon', ex);
            }
         }
      }
   }

   /**
    * Upserts FieldCategoryInfo (new format) and FieldCategoryIcons (legacy format) in EntitySetting.
    */
   protected async applyCategoryInfoSettings(
      pool: CodeGenConnection,
      entityId: string,
      categoryInfo: Record<string, FieldCategoryInfo>
   ): Promise<void> {
      if (!categoryInfo || Object.keys(categoryInfo).length === 0) return;

      const infoJSON = JSON.stringify(categoryInfo).replace(/'/g, "''");

      // Upsert FieldCategoryInfo (new format)
      const checkNewSQL = `SELECT ID FROM $\{this.qs(mj_core_schema(), \'EntitySetting\')\} WHERE EntityID = '${entityId}' AND Name = 'FieldCategoryInfo'`;
      const existingNew = await pool.query(checkNewSQL);

      if (existingNew.recordset.length > 0) {
         try {
            await this.LogSQLAndExecute(pool, `
               UPDATE $\{this.qs(mj_core_schema(), \'EntitySetting\')\}
               SET Value = '${infoJSON}', __mj_UpdatedAt = ${this.utcNow()}
               WHERE EntityID = '${entityId}' AND Name = 'FieldCategoryInfo'
            `, `Update FieldCategoryInfo setting for entity`, false);
         }
         catch (ex) {
            logError('Error Applying Category Info Settings: Part 1', ex)
         }
      } else {
         const newId = uuidv4();
         try {
            await this.LogSQLAndExecute(pool, `
               INSERT INTO $\{this.qs(mj_core_schema(), \'EntitySetting\')\} (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('${newId}', '${entityId}', 'FieldCategoryInfo', '${infoJSON}', ${this.utcNow()}, ${this.utcNow()})
            `, `Insert FieldCategoryInfo setting for entity`, false);
         }
         catch (ex) {
            logError('Error Applying Category Info Settings: Part 2', ex)
         }
      }

      // Also upsert legacy FieldCategoryIcons for backwards compatibility
      const iconsOnly: Record<string, string> = {};
      for (const [category, info] of Object.entries(categoryInfo)) {
         if (info && typeof info === 'object' && 'icon' in info) {
            iconsOnly[category] = info.icon;
         }
      }
      const iconsJSON = JSON.stringify(iconsOnly).replace(/'/g, "''");

      const checkLegacySQL = `SELECT ID FROM $\{this.qs(mj_core_schema(), \'EntitySetting\')\} WHERE EntityID = '${entityId}' AND Name = 'FieldCategoryIcons'`;
      const existingLegacy = await pool.query(checkLegacySQL);

      if (existingLegacy.recordset.length > 0) {
         try {
            await this.LogSQLAndExecute(pool, `
               UPDATE $\{this.qs(mj_core_schema(), \'EntitySetting\')\}
               SET Value = '${iconsJSON}', __mj_UpdatedAt = ${this.utcNow()}
               WHERE EntityID = '${entityId}' AND Name = 'FieldCategoryIcons'
            `, `Update FieldCategoryIcons setting (legacy)`, false);
         }
         catch (ex) {
            logError('Error Applying Category Info Settings: Part 3', ex)
         }
      } else {
         const newId = uuidv4();
         try {
            await this.LogSQLAndExecute(pool, `
               INSERT INTO $\{this.qs(mj_core_schema(), \'EntitySetting\')\} (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('${newId}', '${entityId}', 'FieldCategoryIcons', '${iconsJSON}', ${this.utcNow()}, ${this.utcNow()})
            `, `Insert FieldCategoryIcons setting (legacy)`, false);
         }
         catch (ex) {
            logError('Error Applying Category Info Settings: Part 4', ex)
         }
      }
   }

   /**
    * Applies entity importance analysis to MJApplicationEntity records.
    * Only called for NEW entities to set DefaultForNewUser.
    */
   protected async applyEntityImportance(
      pool: CodeGenConnection,
      entityId: string,
      importance: { defaultForNewUser: boolean; entityCategory: string; confidence: string; reasoning: string }
   ): Promise<void> {
      const defaultForNewUser = importance.defaultForNewUser ? 1 : 0;
      const updateSQL = `
         UPDATE $\{this.qs(mj_core_schema(), \'ApplicationEntity\')\}
         SET DefaultForNewUser = ${defaultForNewUser}, __mj_UpdatedAt = ${this.utcNow()}
         WHERE EntityID = '${entityId}'
      `;

      try {
         await this.LogSQLAndExecute(pool, updateSQL,
            `Set DefaultForNewUser=${defaultForNewUser} for NEW entity (category: ${importance.entityCategory}, confidence: ${importance.confidence})`, false);

         logStatus(`  Entity importance (NEW Entity): ${importance.entityCategory} (defaultForNewUser: ${importance.defaultForNewUser}, confidence: ${importance.confidence})`);
         logStatus(`    Reasoning: ${importance.reasoning}`);
      }
      catch (ex) {
         logError('Error Applying Entity Importance', ex)
      }
   }

   /**
    * Executes the given SQL query using the given ConnectionPool object.
    * If the appendToLogFile parameter is true, the query will also be appended to the log file.
    * Note that in order to append to the log file, ManageMetadataBase.manageMetaDataLogging must be called first.
    * @param pool - The ConnectionPool object to use to execute the query.
    * @param query - The SQL query to execute.
    * @param description - A description of the query to append to the log file.
    * @param isRecurringScript - if set to true tells the logger that the provided SQL represents a recurring script meaning it is something that is executed, generally, for all CodeGen runs. In these cases, the Config settings can result in omitting these recurring scripts from being logged because the configuration environment may have those recurring scripts already set to run after all run-specific migrations get run.
    * @returns - The result of the query execution.
    */
   private async LogSQLAndExecute(pool: CodeGenConnection, query: string, description?: string, isRecurringScript: boolean = false): Promise<any> {
      return await SQLLogging.LogSQLAndExecute(pool, query, description, isRecurringScript);
   }
}
