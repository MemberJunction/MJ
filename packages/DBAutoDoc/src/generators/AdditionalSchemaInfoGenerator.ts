/**
 * Generates additionalSchemaInfo.json compatible with MemberJunction CodeGen.
 *
 * CodeGen uses this file to set IsSoftPrimaryKey / IsSoftForeignKey flags on
 * EntityField records, enabling relationship metadata for databases that lack
 * proper FK/PK constraints.
 *
 * The output format is:
 * {
 *   "<schemaName>": [
 *     {
 *       "TableName": "<tableName>",
 *       "PrimaryKey": [{ "FieldName": "...", "Description": "..." }],
 *       "ForeignKeys": [{ "FieldName": "...", "SchemaName": "...", "RelatedTable": "...", "RelatedField": "...", "Description": "..." }]
 *     }
 *   ]
 * }
 */

import { DatabaseDocumentation, SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state.js';
import { PKCandidate, FKCandidate } from '../types/discovery.js';
import { OrganicKeyCluster } from '../types/organic-keys.js';

export interface AdditionalSchemaInfoOptions {
  /** Only include AI-discovered keys, not keys already present in the database schema */
  discoveredOnly?: boolean;
  /** Minimum confidence (0-100) for discovered keys to be included */
  confidenceThreshold?: number;
  /** Only include tables/columns with user-approved descriptions */
  approvedOnly?: boolean;
  /** Only include confirmed candidates (status === 'confirmed') from discovery */
  confirmedOnly?: boolean;
  /** Minimum confidence (0-100) for value-list / enum entries. Default 85. */
  valueListConfidenceThreshold?: number;
  /** If true, skip emitting Fields[] entirely. Default false. */
  excludeValueLists?: boolean;
}

interface SoftPKEntry {
  FieldName: string;
  Description?: string;
}

interface SoftFKEntry {
  FieldName: string;
  SchemaName?: string;
  RelatedTable: string;
  RelatedField: string;
  Description?: string;
}

/** Per-column value-list entry emitted in Fields[] when enum detection is active */
export interface FieldValueListEntry {
  FieldName: string;
  ValueListType: 'List' | 'ListOrUserEntry';
  PossibleValues: string[];
  /** Optional description surfaced to humans reviewing the file */
  Description?: string;
  /** Confidence at emission time, 0–100. Useful for audit / re-tuning thresholds. */
  Confidence?: number;
}

interface TableSchemaInfo {
  TableName: string;
  PrimaryKey?: SoftPKEntry[];
  ForeignKeys?: SoftFKEntry[];
  /** Enum/value-list fields discovered by LLM analysis */
  Fields?: FieldValueListEntry[];
}

interface SchemaNameInfo {
  name: string;
  entityNamePrefix: string;
  entityNameSuffix: string;
  description?: string;
}

/** One organic key cluster as serialized in additionalSchemaInfo.json. */
export interface OrganicKeyClusterInfo {
  Concept: string;
  Normalization: 'LowerCaseTrim' | 'Trim' | 'ExactMatch' | 'Custom';
  CustomNormalizationExpression?: string;
  Confidence: number;
  Reasoning: string;
  Tags: string[];
  Members: Array<{
    Schema: string;
    Table: string;
    Column: string;
    ParticipatesInFK: boolean;
    FKTarget?: { Schema: string; Table: string; Column: string } | null;
  }>;
}

/** Schema-keyed output format matching CodeGen's additionalSchemaInfo.json */
interface AdditionalSchemaInfoOutput {
  Schemas: SchemaNameInfo[];
  /** Organic key clusters detected via cluster-based analysis (may be absent if detection didn't run). */
  OrganicKeyClusters?: OrganicKeyClusterInfo[];
  [schemaName: string]: TableSchemaInfo[] | SchemaNameInfo[] | OrganicKeyClusterInfo[] | undefined;
}

export class AdditionalSchemaInfoGenerator {
  /**
   * Generate additionalSchemaInfo JSON from analysis state.
   *
   * Merges two sources:
   * 1. Hard FK/PK data already in state.schemas (from database introspection)
   * 2. Discovered PK/FK candidates from state.phases.keyDetection (AI discovery)
   *
   * Also emits a top-level "Schemas" array with entity name prefix/suffix
   * recommendations derived from schema names, for use by CodeGen to prevent
   * entity name collisions across schemas.
   *
   * When discoveredOnly is true, only source (2) is included — useful when
   * CodeGen already handles the hard constraints from the database.
   */
  public generate(
    state: DatabaseDocumentation,
    options: AdditionalSchemaInfoOptions = {}
  ): string {
    const result: AdditionalSchemaInfoOutput = {
      Schemas: this.generateSchemaNameInfo(state),
    };
    const threshold = options.confidenceThreshold ?? 0;

    // Collect discovered candidates from key detection phase
    const discoveredPKs = this.getDiscoveredPKs(state, threshold, options.confirmedOnly ?? false);
    const discoveredFKs = this.getDiscoveredFKs(state, threshold, options.confirmedOnly ?? false);

    for (const schema of state.schemas) {
      const tables: TableSchemaInfo[] = [];

      for (const table of schema.tables) {
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        const tableInfo = this.buildTableInfo(
          schema,
          table,
          discoveredPKs,
          discoveredFKs,
          options.discoveredOnly ?? false,
          options.valueListConfidenceThreshold ?? 85,
          options.excludeValueLists ?? false,
          options.confirmedOnly ?? false
        );

        if (tableInfo) {
          tables.push(tableInfo);
        }
      }

      if (tables.length > 0) {
        result[schema.name] = tables;
      }
    }

    // Emit organic key clusters as a top-level array. Clusters span multiple schemas
    // by design, so they don't fit the per-schema bucket — they get their own section
    // parallel to "Schemas".
    if (state.organicKeyClusters && state.organicKeyClusters.length > 0) {
      result.OrganicKeyClusters = state.organicKeyClusters.map((c) => this.serializeCluster(c));
    }

    return JSON.stringify(result, null, 4);
  }

  /** Convert an internal OrganicKeyCluster into the additionalSchemaInfo wire format. */
  private serializeCluster(cluster: OrganicKeyCluster): OrganicKeyClusterInfo {
    return {
      Concept: cluster.concept,
      Normalization: cluster.normalization,
      CustomNormalizationExpression: cluster.customNormalizationExpression,
      Confidence: cluster.confidence,
      Reasoning: cluster.reasoning,
      Tags: cluster.tags,
      Members: cluster.members.map((m) => ({
        Schema: m.schema,
        Table: m.table,
        Column: m.column,
        ParticipatesInFK: m.participatesInFK,
        FKTarget: m.fkTarget
          ? { Schema: m.fkTarget.schema, Table: m.fkTarget.table, Column: m.fkTarget.column }
          : null,
      })),
    };
  }

  /**
   * Generates schema-level entity name prefix recommendations.
   * For multi-schema databases, each schema gets a prefix to prevent
   * entity name collisions (e.g., "Accounting: " for ACCOUNTING schema).
   *
   * Prefix rules:
   * - Single-schema databases: no prefix (empty string)
   * - Short recognized acronyms (CRM, AI, HR, ERP, etc.): keep as-is
   * - Compound names with underscores: normalize (AI_COMMERCE_CONTEXT -> "AI Commerce Context: ")
   * - Regular names: title-case (ACCOUNTING -> "Accounting: ")
   */
  private generateSchemaNameInfo(state: DatabaseDocumentation): SchemaNameInfo[] {
    // Single schema — no prefixes needed
    if (state.schemas.length <= 1) {
      return state.schemas.map(s => ({
        name: s.name,
        entityNamePrefix: '',
        entityNameSuffix: '',
        description: s.description || undefined,
      }));
    }

    return state.schemas.map(s => ({
      name: s.name,
      entityNamePrefix: this.generateSchemaPrefix(s.name) + ' ',
      entityNameSuffix: '',
      description: s.description || undefined,
    }));
  }

  /**
   * Generates a human-readable prefix from a schema name.
   * Examples:
   *   "CRM" -> "CRM:"
   *   "ACCOUNTING" -> "Accounting:"
   *   "AI_COMMERCE_CONTEXT" -> "AI Commerce Context:"
   *   "CRM_V2" -> "CRM V2:"
   */
  private generateSchemaPrefix(schemaName: string): string {
    const knownAcronyms = new Set([
      'CRM', 'AI', 'HR', 'ERP', 'ETL', 'API', 'MJ', 'UI', 'UX', 'IT', 'QA',
    ]);

    if (schemaName.includes('_')) {
      // Split on underscores, process each part
      const parts = schemaName.split('_').filter(p => p.length > 0);
      const normalized = parts.map(part => {
        if (knownAcronyms.has(part.toUpperCase())) {
          return part.toUpperCase();
        }
        // Check if it's a version-like suffix (V2, V3, etc.)
        if (/^V\d+$/i.test(part)) {
          return part.toUpperCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      });
      return normalized.join(' ') + ':';
    }

    // Single word — check if it's a known acronym
    if (knownAcronyms.has(schemaName.toUpperCase())) {
      return schemaName.toUpperCase() + ':';
    }

    // Title-case it
    return schemaName.charAt(0).toUpperCase() + schemaName.slice(1).toLowerCase() + ':';
  }

  /**
   * Build a single table's schema info entry by combining
   * introspected and discovered keys, plus value-list fields.
   */
  private buildTableInfo(
    schema: SchemaDefinition,
    table: TableDefinition,
    discoveredPKs: PKCandidate[],
    discoveredFKs: FKCandidate[],
    discoveredOnly: boolean,
    valueListThreshold: number,
    excludeValueLists: boolean,
    confirmedOnly: boolean
  ): TableSchemaInfo | null {
    const pks: SoftPKEntry[] = [];
    const fks: SoftFKEntry[] = [];

    // Source 1: Hard keys from introspection (skip if discoveredOnly)
    if (!discoveredOnly) {
      this.collectIntrospectedPKs(table, pks);
      this.collectIntrospectedFKs(schema, table, fks);
    }

    // Source 2: AI-discovered keys
    this.collectDiscoveredPKs(schema.name, table.name, discoveredPKs, pks);
    this.collectDiscoveredFKs(schema.name, table.name, discoveredFKs, fks);

    // Source 3: Value-list fields from enum detection
    const fields = excludeValueLists
      ? []
      : this.collectValueListFields(table, valueListThreshold, confirmedOnly);

    if (pks.length === 0 && fks.length === 0 && fields.length === 0) {
      return null;
    }

    const entry: TableSchemaInfo = { TableName: table.name };
    if (pks.length > 0) {
      entry.PrimaryKey = pks;
    }
    if (fks.length > 0) {
      entry.ForeignKeys = fks;
    }
    if (fields.length > 0) {
      entry.Fields = fields;
    }

    return entry;
  }

  /**
   * Collect value-list field entries from columns with enum verdicts.
   * Only includes columns where the LLM marked isEnum=true and confidence
   * meets the threshold.
   */
  private collectValueListFields(
    table: TableDefinition,
    threshold: number,
    confirmedOnly: boolean
  ): FieldValueListEntry[] {
    const fields: FieldValueListEntry[] = [];

    for (const col of table.columns) {
      const verdict = col.valueListVerdict;
      if (!verdict || !verdict.isEnum) continue;
      if (verdict.confidence * 100 < threshold) continue;
      if (confirmedOnly && !col.userApproved) continue;

      // Sort values alphabetically — matches CHECK-constraint pass behavior
      const sortedValues = [...verdict.values].sort();

      fields.push({
        FieldName: col.name,
        ValueListType: verdict.type,
        PossibleValues: sortedValues,
        Description: col.description ?? undefined,
        Confidence: Math.round(verdict.confidence * 100),
      });
    }

    return fields;
  }

  /**
   * Collect primary key columns from introspected table definition.
   */
  private collectIntrospectedPKs(table: TableDefinition, pks: SoftPKEntry[]): void {
    const existingFields = new Set(pks.map(p => p.FieldName));

    for (const col of table.columns) {
      if (col.isPrimaryKey && !existingFields.has(col.name)) {
        pks.push({
          FieldName: col.name,
          Description: col.description || `Primary key column for ${table.name}`
        });
      }
    }
  }

  /**
   * Collect foreign key columns from introspected table definition.
   */
  private collectIntrospectedFKs(
    schema: SchemaDefinition,
    table: TableDefinition,
    fks: SoftFKEntry[]
  ): void {
    const existingKeys = new Set(fks.map(f => `${f.FieldName}->${f.RelatedTable}.${f.RelatedField}`));

    // From column-level foreignKeyReferences
    for (const col of table.columns) {
      if (col.isForeignKey && col.foreignKeyReferences) {
        const ref = col.foreignKeyReferences;
        const key = `${col.name}->${ref.table}.${ref.referencedColumn}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          fks.push({
            FieldName: col.name,
            SchemaName: ref.schema || schema.name,
            RelatedTable: ref.table,
            RelatedField: ref.referencedColumn,
            Description: col.description
          });
        }
      }
    }

    // From table-level dependsOn relationships
    for (const dep of table.dependsOn) {
      const key = `${dep.column}->${dep.table}.${dep.referencedColumn}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        fks.push({
          FieldName: dep.column,
          SchemaName: dep.schema || schema.name,
          RelatedTable: dep.table,
          RelatedField: dep.referencedColumn
        });
      }
    }
  }

  /**
   * Collect discovered PKs from the key detection phase.
   */
  private collectDiscoveredPKs(
    schemaName: string,
    tableName: string,
    discoveredPKs: PKCandidate[],
    pks: SoftPKEntry[]
  ): void {
    const existingFields = new Set(pks.map(p => p.FieldName));

    const matching = discoveredPKs.filter(
      pk => pk.schemaName === schemaName && pk.tableName === tableName
    );

    for (const pk of matching) {
      for (const colName of pk.columnNames) {
        if (!existingFields.has(colName)) {
          existingFields.add(colName);
          pks.push({
            FieldName: colName,
            Description: `AI-discovered primary key (confidence: ${pk.confidence}%)`
          });
        }
      }
    }
  }

  /**
   * Collect discovered FKs from the key detection phase.
   */
  private collectDiscoveredFKs(
    schemaName: string,
    tableName: string,
    discoveredFKs: FKCandidate[],
    fks: SoftFKEntry[]
  ): void {
    const existingKeys = new Set(fks.map(f => `${f.FieldName}->${f.RelatedTable}.${f.RelatedField}`));

    const matching = discoveredFKs.filter(
      fk => fk.schemaName === schemaName && fk.sourceTable === tableName
    );

    for (const fk of matching) {
      const key = `${fk.sourceColumn}->${fk.targetTable}.${fk.targetColumn}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        fks.push({
          FieldName: fk.sourceColumn,
          SchemaName: fk.targetSchema || schemaName,
          RelatedTable: fk.targetTable,
          RelatedField: fk.targetColumn,
          Description: `AI-discovered relationship (confidence: ${fk.confidence}%)`
        });
      }
    }
  }

  /**
   * Extract discovered PK candidates from the key detection phase,
   * filtered by confidence threshold and status.
   */
  private getDiscoveredPKs(
    state: DatabaseDocumentation,
    threshold: number,
    confirmedOnly: boolean
  ): PKCandidate[] {
    const keyDetection = state.phases.keyDetection;
    if (!keyDetection?.discovered?.primaryKeys) {
      return [];
    }

    return keyDetection.discovered.primaryKeys.filter(pk => {
      if (confirmedOnly && pk.status !== 'confirmed') {
        return false;
      }
      if (pk.status === 'rejected') {
        return false;
      }
      return pk.confidence >= threshold;
    });
  }

  /**
   * Extract discovered FK candidates from the key detection phase,
   * filtered by confidence threshold and status.
   */
  private getDiscoveredFKs(
    state: DatabaseDocumentation,
    threshold: number,
    confirmedOnly: boolean
  ): FKCandidate[] {
    const keyDetection = state.phases.keyDetection;
    if (!keyDetection?.discovered?.foreignKeys) {
      return [];
    }

    return keyDetection.discovered.foreignKeys.filter(fk => {
      if (confirmedOnly && fk.status !== 'confirmed') {
        return false;
      }
      if (fk.status === 'rejected') {
        return false;
      }
      return fk.confidence >= threshold;
    });
  }
}
