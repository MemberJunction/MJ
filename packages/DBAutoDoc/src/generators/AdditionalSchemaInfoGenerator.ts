/**
 * Describe a discovered FK, including what the probe measured.
 *
 * The confidence number alone is the LLM's self-report; the containment counts are the
 * only part of this sentence grounded in the data.
 */
function describeDiscoveredFK(fk: FKCandidate): string {
  const base = `AI-discovered relationship (confidence: ${fk.confidence}%)`;
  const v = fk.verification;
  if (!v) return base;
  if (v.Verification === 'Verified' && v.MatchedRows !== null && v.SampledRows !== null) {
    return `${base} — join verified, ${v.MatchedRows}/${v.SampledRows} sampled values matched`;
  }
  if (v.Verification === 'Refuted') {
    return `${base} — join REFUTED: ${v.VerificationNote}`;
  }
  return `${base} — join NOT verified: ${v.VerificationNote}`;
}

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

import { IsUniquelyIndexed } from '../utils/index-hints.js';
import { DatabaseDocumentation, SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state.js';
import { PKCandidate, FKCandidate, KeyVerificationStamp } from '../types/discovery.js';
import { PickBestPKCandidate } from '../discovery/ApplyPrimaryKeys.js';
import { DetectedOrganicKeysOutput, OrganicKeyConfig } from '../discovery/OrganicKeyTranslator.js';
import { EnumCandidateGate } from '../discovery/EnumCandidateGate.js';

/** Post-#6636 column shape carrying `primaryKeySource` without coupling this wave to `types/state.ts`. */
type ColumnWithOptionalPKSource = ColumnDefinition & { primaryKeySource?: string };

function isDiscoveryPKColumn(col: ColumnDefinition): boolean {
  return (col as ColumnWithOptionalPKSource).primaryKeySource === 'discovery';
}

export interface AdditionalSchemaInfoOptions {
  /** Only include AI-discovered keys, not keys already present in the database schema */
  DiscoveredOnly?: boolean;
  /** Minimum confidence (0-100) for discovered keys to be included */
  ConfidenceThreshold?: number;
  /** Only include tables/columns with user-approved descriptions */
  ApprovedOnly?: boolean;
  /** Only include confirmed candidates (status === 'confirmed') from discovery */
  ConfirmedOnly?: boolean;
  /** Minimum confidence (0-100) for value-list / enum entries. Default 85. */
  ValueListConfidenceThreshold?: number;
  /** If true, skip emitting Fields[] entirely. Default false. */
  ExcludeValueLists?: boolean;
  /**
   * Organic-key detection output (per-schema/per-table OrganicKeys). When present,
   * merged into each table's OrganicKeys[] so CodeGen's processOrganicKeyConfig
   * writes EntityOrganicKey / EntityOrganicKeyRelatedEntity metadata.
   */
  OrganicKeys?: DetectedOrganicKeysOutput;
  /**
   * Fold value-list spellings that differ only by letter case or surrounding whitespace.
   * Defaults to true when the state contains an active (non-skipped) data quality phase.
   */
  FoldSpellingVariants?: boolean;
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
  /**
   * Which stage authored this key, and whether anyone checked it against the data.
   *
   * Without it a wrong inferred key and a correct hand-written one sit side by side in
   * this file with nothing to tell them apart — a consumer choosing between them has no
   * signal, and a later run cannot tell which of its own outputs was ever verified.
   * Counts only; never a value.
   */
  Verification?: KeyVerificationStamp;
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
  /** Organic-key configurations consumed by CodeGen's processOrganicKeyConfig */
  OrganicKeys?: OrganicKeyConfig[];
}

interface SchemaNameInfo {
  name: string;
  entityNamePrefix: string;
  entityNameSuffix: string;
  description?: string;
}

/** Schema-keyed output format matching CodeGen's additionalSchemaInfo.json */
interface AdditionalSchemaInfoOutput {
  Schemas: SchemaNameInfo[];
  [schemaName: string]: TableSchemaInfo[] | SchemaNameInfo[];
}

export class AdditionalSchemaInfoGenerator {
  private readonly plainEnumGate = new EnumCandidateGate({ FoldSpellingVariants: false });
  private readonly foldingEnumGate = new EnumCandidateGate({ FoldSpellingVariants: true });
  private activeEnumGate: EnumCandidateGate = this.plainEnumGate;

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
  public Generate(
    state: DatabaseDocumentation,
    options: AdditionalSchemaInfoOptions = {}
  ): string {
    const foldVariants =
      options.FoldSpellingVariants ??
      (state.phases?.dataQuality !== undefined && state.phases.dataQuality.Status !== 'skipped');
    this.activeEnumGate = foldVariants ? this.foldingEnumGate : this.plainEnumGate;
    const result: AdditionalSchemaInfoOutput = {
      Schemas: this.generateSchemaNameInfo(state),
    };
    const threshold = options.ConfidenceThreshold ?? 0;

    // Collect discovered candidates from key detection phase
    const discoveredPKs = this.getDiscoveredPKs(state, threshold, options.ConfirmedOnly ?? false);
    const discoveredFKs = this.getDiscoveredFKs(state, threshold, options.ConfirmedOnly ?? false);

    for (const schema of state.schemas) {
      const tables: TableSchemaInfo[] = [];

      for (const table of schema.tables) {
        if (options.ApprovedOnly && !table.userApproved) {
          continue;
        }

        const tableInfo = this.buildTableInfo(
          state,
          schema,
          table,
          discoveredPKs,
          discoveredFKs,
          options.DiscoveredOnly ?? false,
          options.ValueListConfidenceThreshold ?? 85,
          options.ExcludeValueLists ?? false,
          options.ConfirmedOnly ?? false
        );

        if (tableInfo) {
          // Attach organic keys for this table when detection output is present.
          const orgKeys = this.getOrganicKeysForTable(options.OrganicKeys, schema.name, table.name);
          if (orgKeys.length > 0) {
            tableInfo.OrganicKeys = orgKeys;
          }
          tables.push(tableInfo);
        }
      }

      // A table may have organic keys even if buildTableInfo returned null (no
      // soft PK/FK and no value lists). Emit a minimal entry so they aren't lost.
      if (options.OrganicKeys) {
        const emittedTables = new Set(tables.map((t) => t.TableName));
        for (const table of schema.tables) {
          if (emittedTables.has(table.name)) continue;
          const orgKeys = this.getOrganicKeysForTable(options.OrganicKeys, schema.name, table.name);
          if (orgKeys.length > 0) {
            tables.push({ TableName: table.name, OrganicKeys: orgKeys });
          }
        }
      }

      if (tables.length > 0) {
        result[schema.name] = tables;
      }
    }

    return JSON.stringify(result, null, 4);
  }

  /** @deprecated Use {@link Generate}. */
  public generate(
    state: DatabaseDocumentation,
    options: AdditionalSchemaInfoOptions = {}
  ): string {
    return this.Generate(state, options);
  }

  /**
   * Look up the organic keys detected for a specific schema.table from the
   * detector's per-schema/per-table output. Returns [] when none.
   */
  private getOrganicKeysForTable(
    organicKeys: DetectedOrganicKeysOutput | undefined,
    schemaName: string,
    tableName: string,
  ): OrganicKeyConfig[] {
    if (!organicKeys) return [];
    const tablesForSchema = organicKeys[schemaName];
    if (!tablesForSchema) return [];
    const entry = tablesForSchema.find((t) => t.TableName === tableName);
    return entry?.OrganicKeys ?? [];
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
    state: DatabaseDocumentation,
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

    const allTablePKCandidates = (state.phases.keyDetection?.discovered?.primaryKeys ?? []).filter(
      pk => this.sameSchemaAndTable(pk.schemaName, pk.tableName, schema.name, table.name)
    );
    const allDiscoveredFKs = state.phases.keyDetection?.discovered?.foreignKeys ?? [];
    const declaredPKColumns = this.resolveDeclaredPKColumns(table, allTablePKCandidates);

    // Source 1: Hard keys from introspection (skip if discoveredOnly)
    if (!discoveredOnly) {
      this.collectIntrospectedPKs(table, declaredPKColumns, pks);
      this.collectIntrospectedFKs(schema, table, fks, allDiscoveredFKs);
    }

    // Source 2: AI-discovered keys (never emit a discovered PK onto a table with a declared catalog PK)
    this.collectDiscoveredPKs(schema.name, table, discoveredPKs, declaredPKColumns.length > 0, pks);
    this.collectDiscoveredFKs(schema.name, table, discoveredFKs, fks);

    // A composite FK's column pairs whose target is not unique on its own are dropped whichever
    // source proposed them: introspection, a discovery pass, or the LLM confirming the constraint.
    this.dropNonUniqueCompositePairs(state, schema, table, fks);

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
   *
   * Unless a user approved the column, the verdict must also pass the enum candidate gate against
   * the column's statistics, and only values observed in the column are kept. That way, a state
   * file written before the gate existed does not export `__mj_*`, audit, year or GUID lists, or
   * invented values. A list is closed (`List`) only when a user approved it; a list inferred from
   * data is `ListOrUserEntry`, since the data cannot show that no other value is allowed. That holds
   * for a column with a CHECK constraint too: CodeGen builds the closed list from a value-list
   * CHECK itself, and a CHECK that is not a value list (e.g. `Status <> ''`) allows values the
   * data does not hold.
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

      const values = col.userApproved
        ? verdict.values
        : this.activeEnumGate.FilterVerdictValues(col, table.rowCount, verdict.values);
      if (!values) continue;

      // Sort values alphabetically — matches CHECK-constraint pass behavior
      const sortedValues = [...values].sort();

      fields.push({
        FieldName: col.name,
        ValueListType: col.userApproved ? verdict.type : 'ListOrUserEntry',
        PossibleValues: sortedValues,
        Description: col.description ?? undefined,
        Confidence: Math.round(verdict.confidence * 100),
      });
    }

    return fields;
  }

  /**
   * Resolve the table's declared (catalog) primary key columns, ordered by authority:
   * 1. Introspected catalog PK index (`table.indexes` with `IsPrimaryKey: true`) — immune to
   *    candidate name collisions (even when discovery proposed and rejected a catalog PK column).
   * 2. Post-#6636 `primaryKeySource: 'discovery'` markers — when present on any column of the
   *    table, unmarked `isPrimaryKey` columns are unambiguously catalog-declared.
   * 3. Pre-#6636 fallback — `isPrimaryKey` columns not named by any discovery candidate.
   */
  private resolveDeclaredPKColumns(
    table: TableDefinition,
    allTablePKCandidates: PKCandidate[]
  ): ColumnDefinition[] {
    const catalogPKIndex = table.indexes?.find(idx => idx.IsPrimaryKey && idx.Columns.length > 0);
    if (catalogPKIndex) {
      const fromIndex = this.matchColumnsByName(table.columns, catalogPKIndex.Columns);
      if (fromIndex.length > 0) {
        return fromIndex;
      }
    }

    if (table.columns.some(isDiscoveryPKColumn)) {
      return table.columns.filter(col => col.isPrimaryKey && !isDiscoveryPKColumn(col));
    }

    const namedByAnyCandidate = new Set(
      allTablePKCandidates.flatMap(pk => pk.columnNames.map(c => c.toLowerCase()))
    );
    return table.columns.filter(
      col => col.isPrimaryKey && !namedByAnyCandidate.has(col.name.toLowerCase())
    );
  }

  private matchColumnsByName(columns: ColumnDefinition[], names: string[]): ColumnDefinition[] {
    const byLower = new Map(columns.map(col => [col.name.toLowerCase(), col]));
    const matched: ColumnDefinition[] = [];
    const seen = new Set<string>();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      const col = byLower.get(lower);
      if (col) {
        seen.add(lower);
        matched.push(col);
      }
    }
    return matched;
  }

  /**
   * Append resolved declared (catalog) primary key columns into `pks`.
   */
  private collectIntrospectedPKs(
    table: TableDefinition,
    declaredPKColumns: ColumnDefinition[],
    pks: SoftPKEntry[]
  ): void {
    const existingFields = new Set(pks.map(p => p.FieldName.toLowerCase()));

    for (const col of declaredPKColumns) {
      const lower = col.name.toLowerCase();
      if (existingFields.has(lower)) {
        continue;
      }
      existingFields.add(lower);
      pks.push({
        FieldName: col.name,
        Description: col.description || `Primary key column for ${table.name}`
      });
    }
  }

  /**
   * Collect declared (catalog) foreign keys from column references and `dependsOn`.
   * Discovery-authored edges (present in `allRawFKCandidates` without a catalog `constraintName`)
   * are deferred to {@link collectDiscoveredFKs} so status, confidence, confirmation, description
   * provenance, and verification stamps are applied uniformly in one place.
   */
  private collectIntrospectedFKs(
    schema: SchemaDefinition,
    table: TableDefinition,
    fks: SoftFKEntry[],
    allRawFKCandidates: FKCandidate[] = []
  ): void {
    const existingKeys = new Set(fks.map(f => this.formatSoftFKDedupKey(f, schema.name)));
    const discoveryEdges = this.buildDiscoveryFKEdgeKeys(schema.name, table.name, allRawFKCandidates);
    const catalogConstraintEdges = this.buildCatalogConstraintEdgeKeys(schema.name, table);

    this.collectColumnIntrospectedFKs(schema.name, table, discoveryEdges, catalogConstraintEdges, existingKeys, fks);
    this.collectDependsOnIntrospectedFKs(schema.name, table, discoveryEdges, existingKeys, fks);
  }

  private collectColumnIntrospectedFKs(
    schemaName: string,
    table: TableDefinition,
    discoveryEdges: Set<string>,
    catalogConstraintEdges: Set<string>,
    existingKeys: Set<string>,
    fks: SoftFKEntry[]
  ): void {
    for (const col of table.columns) {
      if (!col.isForeignKey || !col.foreignKeyReferences) continue;
      const ref = col.foreignKeyReferences;
      const targetSchema = ref.schema || schemaName;
      const edge = this.formatFKEdgeKey(schemaName, table.name, col.name, targetSchema, ref.table, ref.referencedColumn);
      if (discoveryEdges.has(edge) && !catalogConstraintEdges.has(edge)) {
        continue;
      }
      const entry: SoftFKEntry = {
        FieldName: col.name,
        SchemaName: targetSchema,
        RelatedTable: ref.table,
        RelatedField: ref.referencedColumn,
        Description: col.description
      };
      const dedupKey = this.formatSoftFKDedupKey(entry, schemaName);
      if (!existingKeys.has(dedupKey)) {
        existingKeys.add(dedupKey);
        fks.push(entry);
      }
    }
  }

  private collectDependsOnIntrospectedFKs(
    schemaName: string,
    table: TableDefinition,
    discoveryEdges: Set<string>,
    existingKeys: Set<string>,
    fks: SoftFKEntry[]
  ): void {
    for (const dep of table.dependsOn) {
      const targetSchema = dep.schema || schemaName;
      const edge = this.formatFKEdgeKey(schemaName, table.name, dep.column, targetSchema, dep.table, dep.referencedColumn);
      if (!dep.constraintName && discoveryEdges.has(edge)) {
        continue;
      }
      const entry: SoftFKEntry = {
        FieldName: dep.column,
        SchemaName: targetSchema,
        RelatedTable: dep.table,
        RelatedField: dep.referencedColumn
      };
      const dedupKey = this.formatSoftFKDedupKey(entry, schemaName);
      if (!existingKeys.has(dedupKey)) {
        existingKeys.add(dedupKey);
        fks.push(entry);
      }
    }
  }

  private buildDiscoveryFKEdgeKeys(schemaName: string, tableName: string, candidates: FKCandidate[]): Set<string> {
    return new Set(
      candidates
        .filter(fk => this.sameSchemaAndTable(fk.schemaName, fk.sourceTable, schemaName, tableName))
        .map(fk => this.formatFKEdgeKey(fk.schemaName, fk.sourceTable, fk.sourceColumn, fk.targetSchema || schemaName, fk.targetTable, fk.targetColumn))
    );
  }

  private sameSchemaAndTable(schemaA: string, tableA: string, schemaB: string, tableB: string): boolean {
    return schemaA.toLowerCase() === schemaB.toLowerCase() && tableA.toLowerCase() === tableB.toLowerCase();
  }

  private buildCatalogConstraintEdgeKeys(schemaName: string, table: TableDefinition): Set<string> {
    return new Set(
      table.dependsOn
        .filter(dep => Boolean(dep.constraintName))
        .map(dep => this.formatFKEdgeKey(schemaName, table.name, dep.column, dep.schema || schemaName, dep.table, dep.referencedColumn))
    );
  }

  private formatFKEdgeKey(
    srcSchema: string,
    srcTable: string,
    srcCol: string,
    tgtSchema: string,
    tgtTable: string,
    tgtCol: string
  ): string {
    return `${srcSchema}.${srcTable}.${srcCol}->${tgtSchema}.${tgtTable}.${tgtCol}`.toLowerCase();
  }

  private formatSoftFKDedupKey(
    entry: Pick<SoftFKEntry, 'FieldName' | 'SchemaName' | 'RelatedTable' | 'RelatedField'>,
    defaultSchema: string
  ): string {
    return `${entry.FieldName}->${entry.SchemaName || defaultSchema}.${entry.RelatedTable}.${entry.RelatedField}`.toLowerCase();
  }

  /**
   * MJ models a foreign key as one column, so a composite key is written as one entry per column
   * pair. Only a pair whose target is unique on its own is kept: the other columns of a composite
   * key usually point at columns that repeat in the target table (a join on them alone multiplies
   * rows), so they are left out rather than guessed. A column of the constraint that points
   * somewhere else (a different, real target) is kept; single-column keys are unchanged.
   * A constraint read as a cross product (see {@link isCrossProduct}) keeps none of its pairs.
   */
  private dropNonUniqueCompositePairs(state: DatabaseDocumentation, schema: SchemaDefinition, table: TableDefinition, fks: SoftFKEntry[]): void {
    const drop = new Set<string>();
    for (const pairs of this.compositeConstraints(table).values()) {
      const crossProduct = this.isCrossProduct(pairs);
      for (const dep of pairs) {
        const targetSchema = dep.schema || schema.name;
        if (crossProduct || !this.isUniqueOnItsOwn(state, targetSchema, dep.table, dep.referencedColumn)) {
          drop.add(this.formatSoftFKDedupKey({
            FieldName: dep.column,
            SchemaName: targetSchema,
            RelatedTable: dep.table,
            RelatedField: dep.referencedColumn,
          }, schema.name));
        }
      }
    }
    if (drop.size === 0) {
      return;
    }
    const kept = fks.filter(f => !drop.has(this.formatSoftFKDedupKey(f, schema.name)));
    fks.splice(0, fks.length, ...kept);
  }

  /** The introspected column pairs of each multi-column foreign key constraint, by constraint name. */
  private compositeConstraints(table: TableDefinition): Map<string, TableDefinition['dependsOn']> {
    const byConstraint = new Map<string, TableDefinition['dependsOn']>();
    for (const dep of table.dependsOn) {
      if (dep.constraintName) {
        byConstraint.set(dep.constraintName, [...(byConstraint.get(dep.constraintName) ?? []), dep]);
      }
    }
    return new Map([...byConstraint].filter(([, pairs]) => pairs.length > 1));
  }

  /**
   * True when a constraint's pairs repeat a source column. A foreign key pairs each source column
   * with exactly one referenced column, so a repeat can only be the N x N cross product the
   * PostgreSQL driver produced before it read pg_constraint. Which pairing is right is unknown, so
   * a state file written then must be re-introspected rather than exported as it is.
   */
  private isCrossProduct(pairs: TableDefinition['dependsOn']): boolean {
    return new Set(pairs.map(p => p.column.toLowerCase())).size < pairs.length;
  }

  /**
   * Whether a column identifies one row of its table by itself: it is the table's only primary
   * key column, or it has a unique, unfiltered single-column index. A target table that is not in
   * the analysed state cannot be checked, so it counts as not unique.
   */
  private isUniqueOnItsOwn(state: DatabaseDocumentation, schemaName: string, tableName: string, columnName: string): boolean {
    const target = state.schemas
      .find(s => s.name.toLowerCase() === schemaName.toLowerCase())
      ?.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
    if (!target) {
      return false;
    }
    const pkColumns = target.columns.filter(c => c.isPrimaryKey);
    if (pkColumns.length === 1 && pkColumns[0].name.toLowerCase() === columnName.toLowerCase()) {
      return true;
    }
    return IsUniquelyIndexed(target, columnName) === true;
  }

  /**
   * Collect discovered PKs from the key detection phase.
   * Emits at most ONE winning candidate per table (via {@link PickBestPKCandidate}) and never
   * unions a discovered PK onto a table that has a declared catalog PK (including under `DiscoveredOnly`).
   */
  private collectDiscoveredPKs(
    schemaName: string,
    table: TableDefinition,
    discoveredPKs: PKCandidate[],
    hasDeclaredPK: boolean,
    pks: SoftPKEntry[]
  ): void {
    if (hasDeclaredPK || pks.length > 0) {
      return;
    }

    const matching = discoveredPKs.filter(
      pk => this.sameSchemaAndTable(pk.schemaName, pk.tableName, schemaName, table.name)
    );
    const winner = PickBestPKCandidate(matching);
    if (!winner) {
      return;
    }

    const seenFields = new Set<string>();
    for (const colName of winner.columnNames) {
      const lower = colName.toLowerCase();
      if (seenFields.has(lower)) continue;
      seenFields.add(lower);
      const col = table.columns.find(c => c.name.toLowerCase() === lower);
      pks.push({
        FieldName: colName,
        Description: col?.description || `AI-discovered primary key (confidence: ${winner.confidence}%)`
      });
    }
  }

  /**
   * Collect discovered FKs from the key detection phase.
   * When multiple candidates target the same edge, prefers confirmed then highest-confidence.
   */
  private collectDiscoveredFKs(
    schemaName: string,
    table: TableDefinition,
    discoveredFKs: FKCandidate[],
    fks: SoftFKEntry[]
  ): void {
    const existingKeys = new Set(fks.map(f => this.formatSoftFKDedupKey(f, schemaName)));

    const matching = discoveredFKs.filter(
      fk => this.sameSchemaAndTable(fk.schemaName, fk.sourceTable, schemaName, table.name)
    );

    for (const { DedupKey, Candidate: fk } of this.selectBestDiscoveredFKs(schemaName, matching)) {
      if (existingKeys.has(DedupKey)) {
        continue;
      }
      existingKeys.add(DedupKey);
      const col = table.columns.find(c => c.name.toLowerCase() === fk.sourceColumn.toLowerCase());
      const provenance = describeDiscoveredFK(fk);
      fks.push({
        FieldName: fk.sourceColumn,
        SchemaName: fk.targetSchema || schemaName,
        RelatedTable: fk.targetTable,
        RelatedField: fk.targetColumn,
        Description: col?.description ? `${col.description} (${provenance})` : provenance,
        Verification: fk.verification
      });
    }
  }

  private selectBestDiscoveredFKs(
    schemaName: string,
    matching: FKCandidate[]
  ): Array<{ DedupKey: string; Candidate: FKCandidate }> {
    const bestByKey = new Map<string, FKCandidate>();
    for (const fk of matching) {
      const dedupKey = this.formatSoftFKDedupKey({
        FieldName: fk.sourceColumn,
        SchemaName: fk.targetSchema || schemaName,
        RelatedTable: fk.targetTable,
        RelatedField: fk.targetColumn,
      }, schemaName);
      const existing = bestByKey.get(dedupKey);
      if (!existing || this.fkCandidateRanksHigher(fk, existing)) {
        bestByKey.set(dedupKey, fk);
      }
    }
    return [...bestByKey.entries()].map(([DedupKey, Candidate]) => ({ DedupKey, Candidate }));
  }

  private fkCandidateRanksHigher(candidate: FKCandidate, current: FKCandidate): boolean {
    const cConfirmed = candidate.status === 'confirmed' ? 1 : 0;
    const curConfirmed = current.status === 'confirmed' ? 1 : 0;
    return cConfirmed > curConfirmed || (cConfirmed === curConfirmed && candidate.confidence > current.confidence);
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
