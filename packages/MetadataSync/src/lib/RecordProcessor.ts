import { BaseEntity, CompositeKey, EntityInfo, Metadata, RunView, UserInfo } from '@memberjunction/core';
import fs from 'fs-extra';
import path from 'path';
import { ordinalCompare, UUIDsEqual } from '@memberjunction/global';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { EntityConfig } from '../config';
import { JsonWriteHelper } from './json-write-helper';
import { EntityPropertyExtractor } from './EntityPropertyExtractor';
import { FieldExternalizer } from './FieldExternalizer';
import { RelatedEntityHandler } from './RelatedEntityHandler';
import {
  FindSubPropertyExternalizations,
  ExternalizeSubProperties,
  FieldExternalizerAdapter,
} from './json-subproperty-externalization';
import { METADATA_KEYWORDS, ExtractKeywordValue, createKeywordReference, IsMetadataKeyword } from '../constants/metadata-keywords';
import { RelatedEntityConfig } from '../config';
import {
  HasNestedEnvReference,
  IsJsonContainer,
  JsonValue,
  KeepEnvReference,
  KeepNestedEnvReferences,
  KeptEnvReference,
  NestedEnvKeepResult,
  ParseEnvReference,
} from './env-reference';
import { EnvSourcedValue, EnvSourcedValuesOf, FindEnvSourcedValue } from './env-derived-fields';
import { ExistingRecordIndex, KeepPrimaryKeyEnvReferences, UnsetPrimaryKeyVariableError } from './existing-record-index';
import { LookupPair, ParseLookupCreateFields, ParseLookupPairs, SplitLookupReference } from './lookup-reference';

/** A `@lookup:` value whose criteria or create fields use `@env:`. */
interface ParsedEnvLookup {
  EntityName: string;
  Criteria: LookupPair[];
  Variables: Set<string>;
}

/** A criteria field and the value it must have; null means a null value. */
interface ExpectedLookupValue {
  Name: string;
  Value: string | null;
}

/** The record a lookup's foreign key points at: found, not found, or not readable. */
type LookupTargetRead = { Status: 'Found'; Row: Record<string, unknown> } | { Status: 'NotFound' } | { Status: 'Failed' };

/**
 * Handles the core processing of individual record data into the sync format
 */
export class RecordProcessor {
  private propertyExtractor: EntityPropertyExtractor;
  private fieldExternalizer: FieldExternalizer;
  private relatedEntityHandler: RelatedEntityHandler;

  /** Receives pull warnings. When not set, warnings go to the console. */
  public WarningSink: ((message: string) => void) | null = null;
  /** For each record this processor returned, the read-only fields it left out because they hold an env value. */
  private readonly envOmittedFields = new WeakMap<RecordData, ReadonlySet<string>>();

  constructor(
    private syncEngine: SyncEngine,
    private contextUser: UserInfo
  ) {
    this.propertyExtractor = new EntityPropertyExtractor();
    this.fieldExternalizer = new FieldExternalizer();
    this.relatedEntityHandler = new RelatedEntityHandler(syncEngine, contextUser);
  }

  /**
   * Batch pre-fetch related entities for a set of parent records.
   * Public facade so callers don't need direct access to relatedEntityHandler.
   */
  async BatchPrefetchRelatedEntities(
    parentPrimaryKeys: string[],
    relationConfig: RelatedEntityConfig,
    verbose?: boolean
  ): Promise<Map<string, BaseEntity[]>> {
    return this.relatedEntityHandler.batchQueryRelatedEntities(parentPrimaryKeys, relationConfig, verbose);
  }

  /** @deprecated Use {@link BatchPrefetchRelatedEntities}. */
  async batchPrefetchRelatedEntities(
    parentPrimaryKeys: string[],
    relationConfig: RelatedEntityConfig,
    verbose?: boolean
  ): Promise<Map<string, BaseEntity[]>> {
    return this.BatchPrefetchRelatedEntities(parentPrimaryKeys, relationConfig, verbose);
  }

  /**
   * Processes a record into the standardized RecordData format
   */
  async ProcessRecord(
    record: BaseEntity,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean,
    isNewRecord: boolean = true,
    existingRecordData?: RecordData,
    currentDepth: number = 0,
    ancestryPath: Set<string> = new Set(),
    fieldOverrides?: Record<string, any>,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<RecordData> {
    // Extract all properties from the entity
    const allProperties = this.propertyExtractor.extractAllProperties(record, fieldOverrides);

    // Process fields, collections, embeds, extension, and related entities (§6)
    const envOmitted = new Set<string>();
    const { fields, collections, embeds, extension, relatedEntities } = await this.processEntityData(
      allProperties,
      record,
      primaryKey,
      targetDir,
      entityConfig,
      existingRecordData,
      currentDepth,
      ancestryPath,
      verbose,
      batchedRelatedData,
      envOmitted
    );
    
    // Calculate checksum and sync metadata
    const syncData = await this.calculateSyncMetadata(
      fields, 
      targetDir, 
      entityConfig, 
      existingRecordData, 
      verbose,
      collections,
      embeds,
      extension
    );
    
    // Build the final record data with proper ordering
    const recordData = JsonWriteHelper.createOrderedRecordData(
      fields,
      relatedEntities,
      this.keptPrimaryKey(primaryKey, entityConfig, existingRecordData),
      syncData,
      collections,
      embeds,
      extension
    );
    this.envOmittedFields.set(recordData, envOmitted);
    return recordData;
  }

  /**
   * The read-only fields left out of a record this processor returned, because their database
   * value holds the value of an `@env:` reference in the record file. A merge removes them too.
   */
  EnvOmittedFieldsOf(recordData: RecordData): ReadonlySet<string> {
    return this.envOmittedFields.get(recordData) ?? new Set<string>();
  }

  /** The key to write: the file's `@env:` key values that still resolve to the database key, else the database key. */
  private keptPrimaryKey(
    primaryKey: Record<string, unknown>,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined
  ): Record<string, unknown> {
    const fileKey = existingRecordData?.primaryKey;
    if (!fileKey || !Object.values(fileKey).some((value) => ParseEnvReference(value) !== null)) {
      return primaryKey;
    }
    return KeepPrimaryKeyEnvReferences(fileKey, primaryKey, this.syncEngine.getEntityInfo(entityConfig.entity));
  }

  /** @deprecated Use {@link ProcessRecord}. */
  async processRecord(
    record: BaseEntity,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean,
    isNewRecord: boolean = true,
    existingRecordData?: RecordData,
    currentDepth: number = 0,
    ancestryPath: Set<string> = new Set(),
    fieldOverrides?: Record<string, any>,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<RecordData> {
    return this.ProcessRecord(record, primaryKey, targetDir, entityConfig, verbose, isNewRecord, existingRecordData, currentDepth, ancestryPath, fieldOverrides, batchedRelatedData);
  }

  /**
   * Processes entity data into fields and related entities
   */
  private async processEntityData(
    allProperties: Record<string, any>,
    record: BaseEntity,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>,
    envOmitted: Set<string> = new Set()
  ): Promise<{
    fields: Record<string, any>;
    collections?: Record<string, RecordData[]>;
    embeds?: Record<string, RecordData>;
    extension?: RecordData['extension'];
    relatedEntities: Record<string, RecordData[]>;
  }> {
    const fields: Record<string, any> = {};
    const collections: Record<string, RecordData[]> = {};
    const embeds: Record<string, RecordData> = {};
    const relatedEntities: Record<string, RecordData[]> = {};

    // Process individual fields
    await this.processFields(
      allProperties,
      primaryKey,
      targetDir,
      entityConfig,
      existingRecordData,
      fields,
      verbose,
      envOmitted
    );

    // Process collections if declared (§6)
    await this.processCollections(
      record,
      targetDir,
      entityConfig,
      collections,
      currentDepth,
      ancestryPath,
      verbose,
      existingRecordData
    );

    // Process extension if present (§6)
    const extension = await this.processExtension(
      record,
      primaryKey,
      targetDir,
      entityConfig,
      verbose,
      existingRecordData
    );

    // Process embeds if present (§6)
    await this.processEmbeds(
      record,
      targetDir,
      entityConfig,
      embeds,
      currentDepth,
      ancestryPath,
      verbose,
      existingRecordData
    );

    // Process related entities if configured
    await this.processRelatedEntities(
      record,
      entityConfig,
      existingRecordData,
      currentDepth,
      ancestryPath,
      relatedEntities,
      verbose,
      batchedRelatedData
    );

    return {
      fields,
      ...(Object.keys(collections).length > 0 ? { collections } : {}),
      ...(Object.keys(embeds).length > 0 ? { embeds } : {}),
      ...(extension ? { extension } : {}),
      relatedEntities,
    };
  }

  /**
   * Processes individual fields from the entity
   */
  private async processFields(
    allProperties: Record<string, any>,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    fields: Record<string, any>,
    verbose?: boolean,
    envOmitted: Set<string> = new Set()
  ): Promise<void> {
    const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
    const envValues = EnvSourcedValuesOf(existingRecordData, entityInfo);
    
    for (const [fieldName, fieldValue] of Object.entries(allProperties)) {
      if (this.shouldSkipField(fieldName, primaryKey, entityConfig, entityInfo)) {
        continue;
      }

      const keptValue = await this.keepEnvReferences(
        fieldName,
        fieldValue,
        allProperties,
        primaryKey,
        targetDir,
        entityConfig,
        existingRecordData,
        verbose
      );
      if (keptValue !== null) {
        fields[fieldName] = keptValue;
        continue;
      }

      if (this.holdsEnvValueReadOnly(fieldName, fieldValue, envValues, entityInfo, primaryKey, entityConfig, existingRecordData, verbose)) {
        envOmitted.add(fieldName);
        continue;
      }

      if (this.shouldSkipNullField(fieldValue, entityConfig)) {
        continue;
      }
      
      let processedValue = await this.processFieldValue(
        fieldName,
        fieldValue,
        allProperties,
        targetDir,
        entityConfig,
        existingRecordData,
        verbose
      );
      
      fields[fieldName] = processedValue;
    }
  }

  /**
   * True when the field is read-only for push (not the key) and its database value holds the value of
   * an `@env:` reference in the record file. Push ignores such a field, so pull leaves it out. With
   * verbose, a note names the field and the variable, never the value.
   */
  private holdsEnvValueReadOnly(
    fieldName: string,
    databaseValue: unknown,
    envValues: ReadonlyArray<EnvSourcedValue>,
    entityInfo: EntityInfo | null,
    primaryKey: Record<string, unknown>,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): boolean {
    const fieldInfo = entityInfo?.Fields.find((f) => f.Name === fieldName);
    if (!fieldInfo?.ReadOnly || fieldInfo.IsPrimaryKey) {
      return false;
    }
    const found = FindEnvSourcedValue(databaseValue, envValues);
    if (!found) {
      return false;
    }
    if (verbose) {
      console.log(`${this.describeField(entityConfig, primaryKey, fieldName, existingRecordData)}: left out, it holds the value of @env:${found.VariableName} (read-only field)`);
    }
    return true;
  }

  /**
   * The field value pull writes when the existing file value holds `@env:` references, so pull
   * never writes a resolved environment value into a file.
   * @returns The value to write, or null when the existing value holds no `@env:` reference
   */
  private async keepEnvReferences(
    fieldName: string,
    databaseValue: unknown,
    allProperties: Record<string, unknown>,
    primaryKey: Record<string, unknown>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<JsonValue | null> {
    const flat = this.keepEnvReference(fieldName, databaseValue, primaryKey, entityConfig, existingRecordData, verbose);
    if (flat !== null) {
      return flat;
    }
    const nested = this.keepNestedEnvReferences(fieldName, databaseValue, primaryKey, entityConfig, existingRecordData, verbose);
    if (nested !== null) {
      if (nested.KeptFileValue) {
        return nested.Value;
      }
      return await this.applyJsonSubPropertyExternalization(
        fieldName,
        nested.Value,
        allProperties,
        targetDir,
        entityConfig,
        existingRecordData,
        verbose
      );
    }
    const sideFile = await this.keepEnvReferencesInSideFile(
      fieldName,
      databaseValue,
      primaryKey,
      targetDir,
      entityConfig,
      existingRecordData,
      verbose
    );
    if (sideFile !== null) {
      return sideFile;
    }
    return await this.keepEnvLookupReference(fieldName, databaseValue, primaryKey, entityConfig, existingRecordData, verbose);
  }

  /**
   * Keeps an existing `@lookup:` whose criteria or create fields use `@env:`. Loads the record the
   * database foreign key points at and compares each criteria field the way push looks it up: the
   * field name and the value without case, the value not trimmed, and `null` matching a null value.
   * Keeps the lookup in every case: silently when it matches, with a verbose note when it cannot be
   * checked, with a warning when the record is missing, cannot be read or does not match.
   * @returns The lookup to keep, or null when the existing value is not such a lookup
   */
  private async keepEnvLookupReference(
    fieldName: string,
    databaseValue: unknown,
    primaryKey: Record<string, unknown>,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<string | null> {
    const existingValue = existingRecordData?.fields?.[fieldName];
    if (typeof existingValue !== 'string' || !existingValue.startsWith(METADATA_KEYWORDS.LOOKUP)) {
      return null;
    }
    const lookup = this.parseEnvLookup(existingValue);
    if (lookup === null) {
      return null;
    }

    const where = this.describeField(entityConfig, primaryKey, fieldName, existingRecordData);
    const keepUnchecked = (reason: string): string => {
      if (verbose) {
        console.log(`${where}: ${reason} Kept ${existingValue} in the file.`);
      }
      return existingValue;
    };
    if (lookup === 'Unreadable') {
      return keepUnchecked('the lookup criteria cannot be read, so the lookup was not checked.');
    }
    const expected = this.expectedLookupValues(lookup.Criteria);
    if (typeof expected === 'string') {
      return keepUnchecked(expected);
    }

    const problem = await this.lookupTargetProblem(lookup.EntityName, databaseValue, expected, [...lookup.Variables].join(', '));
    if (problem !== null) {
      this.warn(`${where}: ${problem} Kept ${existingValue} in the file.`);
    }
    return existingValue;
  }

  /**
   * Reads a `@lookup:` value for the `@env:` keep.
   * @returns The parsed lookup; `'Unreadable'` when it holds `@env:` but cannot be parsed; null
   * when it holds no `@env:` reference
   */
  private parseEnvLookup(lookupValue: string): ParsedEnvLookup | 'Unreadable' | null {
    const split = SplitLookupReference(lookupValue.substring(METADATA_KEYWORDS.LOOKUP.length));
    const criteria = split ? ParseLookupPairs(split.CriteriaText) : null;
    const createFields = split ? this.readLookupCreateFields(split.FlagsText) : null;
    if (!split || !criteria || !createFields) {
      return lookupValue.includes(METADATA_KEYWORDS.ENV) ? 'Unreadable' : null;
    }
    const variables = new Set<string>();
    for (const pair of [...criteria, ...createFields]) {
      const reference = ParseEnvReference(pair.Value);
      if (reference) {
        variables.add(reference.VariableName);
      }
    }
    return variables.size === 0 ? null : { EntityName: split.EntityName, Criteria: criteria, Variables: variables };
  }

  /** The lookup's create fields, or null when a value cannot be URI-decoded. */
  private readLookupCreateFields(flagsText: string): LookupPair[] | null {
    try {
      return ParseLookupCreateFields(flagsText);
    } catch {
      return null;
    }
  }

  /**
   * The value each criteria field must have, with `@env:` values read from the environment.
   * @returns The values, or the reason the lookup cannot be checked
   */
  private expectedLookupValues(criteria: LookupPair[]): ExpectedLookupValue[] | string {
    const expected: ExpectedLookupValue[] = [];
    for (const pair of criteria) {
      const reference = ParseEnvReference(pair.Value);
      let value: string;
      if (reference) {
        const envValue = process.env[reference.VariableName];
        if (envValue === undefined) {
          return `${reference.VariableName} is not set, so the lookup was not checked.`;
        }
        value = envValue;
      } else if (IsMetadataKeyword(pair.Value)) {
        return 'the lookup criteria use a reference pull cannot check.';
      } else {
        value = pair.Value;
      }
      expected.push({ Name: pair.Name, Value: value.trim().toLowerCase() === 'null' ? null : value });
    }
    return expected;
  }

  /**
   * Checks the record the foreign key points at against the expected criteria values.
   * @returns The warning text without values, or null when the record matches
   */
  private async lookupTargetProblem(
    entityName: string,
    databaseValue: unknown,
    expected: ExpectedLookupValue[],
    variables: string
  ): Promise<string | null> {
    if (databaseValue === null || databaseValue === undefined) {
      return `the database value is null, so it does not match the lookup that uses ${variables}.`;
    }
    const target = await this.loadLookupTarget(entityName, String(databaseValue));
    if (target.Status === 'NotFound') {
      return `the record the database value points at was not found, so it does not match the lookup that uses ${variables}.`;
    }
    if (target.Status === 'Failed') {
      return `the record the database value points at could not be read, so the lookup that uses ${variables} was not checked.`;
    }
    if (!this.lookupRowMatches(target.Row, expected)) {
      return `the database value does not match the lookup that uses ${variables}.`;
    }
    return null;
  }

  /** Compares a row with the expected values: field names and values without case, values not trimmed. */
  private lookupRowMatches(row: Record<string, unknown>, expected: ExpectedLookupValue[]): boolean {
    const valuesByName = new Map(Object.entries(row).map(([name, value]) => [name.toLowerCase(), value]));
    return expected.every(({ Name, Value }) => {
      const actual = valuesByName.get(Name.toLowerCase());
      if (Value === null) {
        return actual === null || actual === undefined;
      }
      return actual !== null && actual !== undefined && String(actual).toLowerCase() === Value.toLowerCase();
    });
  }

  /** Reads the record a foreign key points at, as plain values. */
  private async loadLookupTarget(entityName: string, foreignKeyValue: string): Promise<LookupTargetRead> {
    try {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo) {
        return { Status: 'Failed' };
      }
      const result = await new RunView().RunView<Record<string, unknown>>(
        {
          EntityName: entityName,
          ExtraFilter: CompositeKey.FromURLSegment(entityInfo, foreignKeyValue).ToWhereClause(),
          ResultType: 'simple',
        },
        this.contextUser
      );
      if (!result.Success) {
        return { Status: 'Failed' };
      }
      if (result.Results.length === 0) {
        return { Status: 'NotFound' };
      }
      return { Status: 'Found', Row: result.Results[0] };
    } catch {
      return { Status: 'Failed' };
    }
  }

  /**
   * Returns the field's existing `@env:` reference. Warns when the variable differs from the database value.
   * @returns The reference to keep, or null when the existing value is not an `@env:` reference
   */
  private keepEnvReference(
    fieldName: string,
    databaseValue: unknown,
    primaryKey: Record<string, unknown>,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): string | null {
    const kept = KeepEnvReference(existingRecordData?.fields?.[fieldName], this.serializeDateValue(databaseValue));
    if (!kept) {
      return null;
    }
    this.reportKeptReference(this.describeField(entityConfig, primaryKey, fieldName, existingRecordData), kept, verbose);
    return kept.Reference;
  }

  /**
   * Keeps `@env:` references inside a JSON field. When the file value is kept whole, warns why
   * (a verbose note only when the database value is null).
   */
  private keepNestedEnvReferences(
    fieldName: string,
    databaseValue: unknown,
    primaryKey: Record<string, unknown>,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): { Value: JsonValue; KeptFileValue: boolean } | null {
    const result = KeepNestedEnvReferences(existingRecordData?.fields?.[fieldName], databaseValue);
    if (!result) {
      return null;
    }
    const where = this.describeField(entityConfig, primaryKey, fieldName, existingRecordData);
    this.reportNestedKeep(where, result, databaseValue, verbose);
    return { Value: result.Value, KeptFileValue: result.KeptFileValue };
  }

  /**
   * Gives the warnings and verbose notes for a nested keep. Messages name paths and variables only.
   * @param sideFile The side file the references are in, named in each message when given
   */
  private reportNestedKeep(
    where: string,
    result: NestedEnvKeepResult,
    databaseValue: unknown,
    verbose?: boolean,
    sideFile?: string
  ): void {
    const inFile = sideFile ? ` (side file ${sideFile})` : '';
    if (result.KeptFileValue) {
      if (result.LeftValueVariables.length > 0) {
        this.warn(
          `${where}${inFile}: the database value holds the value of ${result.LeftValueVariables.join(', ')} at a path the file does not reference. Kept the file value, which holds @env: references.`
        );
      } else if (databaseValue === null || databaseValue === undefined) {
        if (verbose) {
          console.log(`${where}${inFile}: the database value is null. Kept the file value, which holds @env: references.`);
        }
      } else {
        this.warn(`${where}${inFile}: the database value is not JSON. Kept the file value, which holds @env: references.`);
      }
      return;
    }
    for (const item of result.Kept) {
      const at = item.Path.startsWith('[') ? `${where}${item.Path}` : `${where}.${item.Path}`;
      this.reportKeptReference(`${at}${inFile}`, item, verbose);
    }
  }

  /**
   * Keeps `@env:` references in the `.json` side file that the field names with `@file:`. Writes the
   * database JSON with the references put back to the side file when it differs, and keeps the
   * `@file:` reference in the record. A side file with `@include` directives or nested `@file:`
   * references is not rewritten.
   * @returns The `@file:` reference to keep, or null when the field is not such a side file
   */
  private async keepEnvReferencesInSideFile(
    fieldName: string,
    databaseValue: unknown,
    primaryKey: Record<string, unknown>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<string | null> {
    const existingValue = existingRecordData?.fields?.[fieldName];
    if (typeof existingValue !== 'string' || !existingValue.startsWith(METADATA_KEYWORDS.FILE)) {
      return null;
    }
    const relativePath = ExtractKeywordValue(existingValue);
    if (!relativePath || !relativePath.endsWith('.json')) {
      return null;
    }
    const sideFilePath = path.resolve(targetDir, relativePath);
    const sideFile = await this.readJsonSideFile(sideFilePath);
    if (!sideFile || !HasNestedEnvReference(sideFile.Json)) {
      return null;
    }
    const where = this.describeField(entityConfig, primaryKey, fieldName, existingRecordData);
    const parsedText = JSON.stringify(sideFile.Json);
    if (parsedText.includes('"@include') || parsedText.includes(`"${METADATA_KEYWORDS.FILE}`)) {
      this.warn(
        `${where} (side file ${relativePath}): the side file holds @env: references and @include or @file: references. Pull did not rewrite it.`
      );
      return existingValue;
    }
    const result = KeepNestedEnvReferences(sideFile.Json, databaseValue);
    if (!result) {
      return null;
    }
    this.reportNestedKeep(where, result, databaseValue, verbose, relativePath);
    if (!result.KeptFileValue && JSON.stringify(result.Value) !== JSON.stringify(sideFile.Json)) {
      // The side file is written here, outside the pull's FileWriteBatch and its backup.
      await fs.writeJson(sideFilePath, result.Value, { spaces: 2 });
      if (verbose) {
        console.log(`${where} (side file ${relativePath}): updated the side file and kept its @env: references.`);
      }
    }
    return existingValue;
  }

  /**
   * Reads a JSON side file as push does: a leading byte order mark is ignored.
   * @returns The parsed JSON, or null when the file is missing or does not parse
   */
  private async readJsonSideFile(filePath: string): Promise<{ Json: unknown } | null> {
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    try {
      const text = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
      return { Json: JSON.parse(text) };
    } catch {
      return null;
    }
  }

  /** Warns on a drifted kept reference, and notes an unset variable when verbose. Never prints a value. */
  private reportKeptReference(where: string, kept: KeptEnvReference, verbose: boolean | undefined): void {
    if (kept.Check === 'Drift') {
      this.warn(`${where}: the database value does not match ${kept.VariableName}. Kept ${kept.Reference} in the file.`);
    } else if (kept.Check === 'Unset' && verbose) {
      console.log(`${where}: ${kept.VariableName} is not set, so it was not compared. Kept ${kept.Reference} in the file.`);
    }
  }

  /** Names a field in messages. An `@env:` key value is shown as the file has it, never resolved. */
  private describeField(
    entityConfig: EntityConfig,
    primaryKey: Record<string, unknown>,
    fieldName: string,
    existingRecordData: RecordData | undefined
  ): string {
    const key = this.keptPrimaryKey(primaryKey, entityConfig, existingRecordData);
    return `${entityConfig.entity} ${JSON.stringify(key)} field ${fieldName}`;
  }

  private warn(message: string): void {
    if (this.WarningSink) {
      this.WarningSink(message);
    } else {
      console.warn(message);
    }
  }

  /**
   * Determines if a field should be skipped during processing
   */
  private shouldSkipField(
    fieldName: string,
    primaryKey: Record<string, any>,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo | null
  ): boolean {
    // Skip primary key fields
    if (primaryKey[fieldName] !== undefined) {
      return true;
    }
    
    // Skip internal fields
    if (fieldName.startsWith('__mj_')) {
      return true;
    }
    
    // Skip excluded fields
    if (entityConfig.pull?.excludeFields?.includes(fieldName)) {
      return true;
    }
    
    // Skip virtual fields if configured
    if (this.shouldSkipVirtualField(fieldName, entityConfig, entityInfo)) {
      return true;
    }
    
    return false;
  }

  /**
   * True when the field is null and the config sets `ignoreNullFields`
   */
  private shouldSkipNullField(fieldValue: unknown, entityConfig: EntityConfig): boolean {
    return !!entityConfig.pull?.ignoreNullFields && fieldValue === null;
  }

  /**
   * Checks if a virtual field should be skipped
   */
  private shouldSkipVirtualField(
    fieldName: string,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo | null
  ): boolean {
    if (!entityConfig.pull?.ignoreVirtualFields || !entityInfo) {
      return false;
    }
    
    const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
    return fieldInfo?.IsVirtual === true;
  }

  /**
   * Processes a single field value through various transformations
   */
  private async processFieldValue(
    fieldName: string,
    fieldValue: any,
    allProperties: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<any> {
    let processedValue = fieldValue;

    // Convert Date objects to ISO strings
    processedValue = this.serializeDateValue(processedValue);

    // Apply lookup field conversion if configured
    processedValue = await this.applyLookupFieldConversion(
      fieldName,
      processedValue,
      entityConfig,
      verbose
    );

    // Trim string values
    processedValue = this.trimStringValue(processedValue);

    // Apply field externalization if configured
    processedValue = await this.applyFieldExternalization(
      fieldName,
      processedValue,
      allProperties,
      targetDir,
      entityConfig,
      existingRecordData,
      verbose
    );

    return processedValue;
  }

  /**
   * Serializes Date objects to ISO strings for JSON storage
   */
  private serializeDateValue(value: any): any {
    if (value instanceof Date) {
      // Check if the date is valid
      if (isNaN(value.getTime())) {
        return null; // Invalid dates become null
      }
      return value.toISOString();
    }
    return value;
  }

  /**
   * Applies lookup field conversion if configured
   */
  private async applyLookupFieldConversion(
    fieldName: string,
    fieldValue: any,
    entityConfig: EntityConfig,
    verbose?: boolean
  ): Promise<any> {
    const lookupConfig = entityConfig.pull?.lookupFields?.[fieldName];
    if (!lookupConfig || fieldValue == null) {
      return fieldValue;
    }
    
    try {
      return await this.convertGuidToLookup(String(fieldValue), lookupConfig, verbose);
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to convert ${fieldName} to lookup: ${error}`);
      }
      return fieldValue; // Keep original value if lookup fails
    }
  }

  /**
   * Trims string values to remove whitespace
   */
  private trimStringValue(value: any): any {
    return typeof value === 'string' ? value.trim() : value;
  }

  /**
   * Applies field externalization if configured
   */
  private async applyFieldExternalization(
    fieldName: string,
    fieldValue: any,
    allProperties: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<any> {
    if (!entityConfig.pull?.externalizeFields || fieldValue == null) {
      return fieldValue;
    }
    
    const externalizePattern = this.getExternalizationPattern(fieldName, entityConfig);
    if (!externalizePattern) {
      // No whole-field pattern. The field may still carry dotted configs targeting
      // properties inside its JSON (`Configuration.ReplayScript`), which externalize the
      // leaf and leave an `@file:` reference beside the hand-authored keys. A whole-field
      // config takes precedence, so this only runs when there isn't one.
      return await this.applyJsonSubPropertyExternalization(
        fieldName,
        fieldValue,
        allProperties,
        targetDir,
        entityConfig,
        existingRecordData,
        verbose
      );
    }

    try {
      const existingFileReference = existingRecordData?.fields?.[fieldName];
      const recordData = this.createRecordDataForExternalization(allProperties);
      
      return await this.fieldExternalizer.ExternalizeField(
        fieldName,
        fieldValue,
        externalizePattern,
        recordData,
        targetDir,
        existingFileReference,
        entityConfig.pull?.mergeStrategy || 'merge',
        verbose
      );
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to externalize field ${fieldName}: ${error}`);
      }
      return fieldValue; // Keep original value if externalization fails
    }
  }

  /**
   * Externalizes any configured properties *inside* this field's JSON, returning the
   * field with `@file:` references in their place. A no-op unless the field has dotted
   * `externalizeFields` entries. Best-effort like the whole-field path: a failure keeps
   * the original value rather than losing the pull.
   */
  private async applyJsonSubPropertyExternalization(
    fieldName: string,
    fieldValue: any,
    allProperties: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<any> {
    const subConfigs = FindSubPropertyExternalizations(fieldName, entityConfig.pull?.externalizeFields);
    if (subConfigs.length === 0) {
      return fieldValue;
    }

    try {
      return await ExternalizeSubProperties(
        fieldValue,
        subConfigs,
        FieldExternalizerAdapter(
          this.fieldExternalizer,
          allProperties,
          targetDir,
          entityConfig.pull?.mergeStrategy || 'merge',
          verbose
        ),
        existingRecordData?.fields?.[fieldName]
      );
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to externalize sub-properties of ${fieldName}: ${error}`);
      }
      return fieldValue;
    }
  }

  /**
   * Gets the externalization pattern for a field
   */
  private getExternalizationPattern(fieldName: string, entityConfig: EntityConfig): string | null {
    const externalizeConfig = entityConfig.pull?.externalizeFields;
    if (!externalizeConfig) return null;
    
    if (Array.isArray(externalizeConfig)) {
      return this.getArrayExternalizationPattern(fieldName, externalizeConfig);
    } else {
      return this.getObjectExternalizationPattern(fieldName, externalizeConfig);
    }
  }

  /**
   * Gets externalization pattern from array configuration
   */
  private getArrayExternalizationPattern(
    fieldName: string, 
    externalizeConfig: any[]
  ): string | null {
    if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
      // Simple string array format
      if ((externalizeConfig as string[]).includes(fieldName)) {
        return createKeywordReference('file', `{Name}.${fieldName.toLowerCase()}.md`);
      }
    } else {
      // Array of objects format
      const fieldConfig = (externalizeConfig as Array<{field: string; pattern: string}>)
        .find(config => config.field === fieldName);
      if (fieldConfig) {
        return fieldConfig.pattern;
      }
    }
    return null;
  }

  /**
   * Gets externalization pattern from object configuration
   */
  private getObjectExternalizationPattern(
    fieldName: string, 
    externalizeConfig: Record<string, any>
  ): string | null {
    const fieldConfig = externalizeConfig[fieldName];
    if (fieldConfig) {
      const extension = fieldConfig.extension || '.md';
      return createKeywordReference('file', `{Name}.${fieldName.toLowerCase()}${extension}`);
    }
    return null;
  }

  /**
   * Creates a BaseEntity-like object for externalization processing
   */
  private createRecordDataForExternalization(allProperties: Record<string, any>): Record<string, unknown> {
    return allProperties;
  }

  /**
   * Processes related entities for the record
   */
  private async processRelatedEntities(
    record: BaseEntity,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    currentDepth: number,
    ancestryPath: Set<string>,
    relatedEntities: Record<string, RecordData[]>,
    verbose?: boolean,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<void> {
    if (!entityConfig.pull?.relatedEntities) {
      return;
    }

    for (const [relationKey, relationConfig] of Object.entries(entityConfig.pull.relatedEntities)) {
      try {
        const existingRelated = existingRecordData?.relatedEntities?.[relationKey] || [];

        let relatedRecords: RecordData[];

        if (batchedRelatedData && batchedRelatedData.has(relationKey)) {
          // Use pre-fetched batch data — avoids per-parent queries
          relatedRecords = await this.relatedEntityHandler.loadRelatedEntitiesFromBatch(
            record,
            relationConfig,
            entityConfig,
            existingRelated,
            this.ProcessRecord.bind(this),
            currentDepth,
            ancestryPath,
            batchedRelatedData.get(relationKey)!,
            verbose
          );
        } else {
          // Fall back to per-record loading (original behavior)
          relatedRecords = await this.relatedEntityHandler.loadRelatedEntities(
            record,
            relationConfig,
            entityConfig,
            existingRelated,
            this.ProcessRecord.bind(this),
            currentDepth,
            ancestryPath,
            verbose
          );
        }

        if (relatedRecords.length > 0) {
          relatedEntities[relationKey] = relatedRecords;
        }
      } catch (error) {
        if (error instanceof UnsetPrimaryKeyVariableError) {
          throw error;
        }
        if (verbose) {
          console.warn(`Failed to load related entities for ${relationKey}: ${error}`);
        }
      }
    }
  }

  /**
   * Calculates sync metadata including checksum and last modified timestamp
   */
  private async calculateSyncMetadata(
    fields: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean,
    collections?: Record<string, RecordData[]>,
    embeds?: Record<string, RecordData>,
    extension?: RecordData['extension']
  ): Promise<{ lastModified: string; checksum: string }> {
    // Determine if we should include external file content in checksum
    const hasExternalizedFields = this.hasExternalizedFields(fields, entityConfig);

    const checksumPayload = SyncEngine.BuildRecordChecksumPayload(fields, collections, embeds, extension);

    const checksum = hasExternalizedFields
      ? await this.syncEngine.calculateChecksumWithFileContent(checksumPayload, targetDir)
      : this.syncEngine.calculateChecksum(checksumPayload);

    if (verbose && hasExternalizedFields) {
      console.log(`Calculated checksum including external file content for record`);
    }

    // Compare with existing checksum to determine if data changed
    const existingChecksum = existingRecordData?.sync?.checksum;
    const existingTimestamp = existingRecordData?.sync?.lastModified;

    if (existingChecksum === checksum) {
      // No change detected - preserve existing sync metadata
      if (verbose) {
        console.log(`No changes detected for record, preserving existing timestamp`);
      }
      return {
        lastModified: existingTimestamp!,
        checksum: checksum
      };
    } else {
      // Change detected - update timestamp
      const newTimestamp = new Date().toISOString();
      if (verbose) {
        if (existingChecksum) {
          console.log(`Changes detected for record, updating timestamp`);
        } else {
          console.log(`New record, generating initial timestamp`);
        }
      }
      return {
        lastModified: newTimestamp,
        checksum: checksum
      };
    }
  }

  /**
   * Processes first-class collections on pull (§6)
   */
  private async processCollections(
    record: BaseEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    collections: Record<string, RecordData[]>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean,
    existingRecordData?: RecordData
  ): Promise<void> {
    if (!record.EntityInfo?.RelatedEntities) return;

    for (const rel of record.EntityInfo.RelatedEntities) {
      if (!rel.RelatedRecordCollection) continue;

      let colName = rel.RelatedEntity;
      try {
        const parsed = JSON.parse(rel.RelatedRecordCollection);
        if (parsed.Name) colName = parsed.Name;
      } catch {}

      // Look up companion on record
      let companion = record.GetCompanion(colName);
      if (!companion) {
        const entityRecord = record as unknown as Record<string, unknown>;
        if (entityRecord[colName] && typeof (entityRecord[colName] as { Items?: BaseEntity[] }).Items !== 'undefined') {
          companion = entityRecord[colName] as unknown as typeof companion;
        }
      }

      if (!companion) continue;

      // Pull emits only the collections a repo configures under `collections` in .mj-sync.json.
      // Without config there is no natural key or declared-row filter, so every loaded row
      // would be written with its source primaryKey and foreign key: rows the server derives
      // for itself (a query's inferred parameters, say) would become authored JSON, and
      // pushing that file to another database would miss them by id and insert duplicates.
      const colConfig = entityConfig.collections?.[colName];
      if (!colConfig) {
        if (verbose) {
          console.log(`Skipping collection '${colName}' on ${record.EntityInfo.Name}: not configured under 'collections' in .mj-sync.json`);
        }
        continue;
      }

      const col = companion as unknown as {
        LoadMode: string;
        IsLoaded: boolean;
        Items: BaseEntity[];
        Load: () => Promise<void>;
      };

      // Rider 4 / §6: Load: 'never' collection must be skipped with a stated reason on pull, never emitted as []
      if (col.LoadMode === 'never') {
        console.log(`Skipping Load: 'never' collection '${colName}' on ${record.EntityInfo.Name}`);
        continue;
      }

      if (!col.IsLoaded) {
        try {
          await col.Load();
        } catch (loadErr) {
          console.warn(`Failed to load collection '${colName}' on ${record.EntityInfo.Name}: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`);
          continue;
        }
      }

      // A collection with matchOn holds declared items alongside rows the server derives for
      // itself (a query's inferred parameters, say). Pull writes back only what was declared,
      // identified by its natural key, so derived rows never become authored JSON and the
      // file stays portable across databases whose generated ids differ.
      const matchOn = colConfig.matchOn ?? [];
      const declaredWhere = colConfig.declaredWhere;
      const isNaturalKeyed = matchOn.length > 0;

      const loadedItems = col.Items ?? [];
      const rawItems = declaredWhere
        ? loadedItems.filter((child) => this.matchesDeclaredWhere(child, declaredWhere))
        : loadedItems;
      if (rawItems.length > 0) {
        collections[colName] = [];
        const childEntityInfo = rawItems[0].EntityInfo;
        const childConfig: EntityConfig = {
          entity: childEntityInfo.Name,
        };

        // Deterministically sort collection items by their identity: the natural key when
        // matchOn names one, otherwise the primary key(s)
        const sortKeys = isNaturalKeyed ? matchOn : childEntityInfo.PrimaryKeys.map((pk) => pk.Name);
        const items = [...rawItems].sort((a, b) => {
          for (const key of sortKeys) {
            const aVal = String(a.Get(key) ?? '');
            const bVal = String(b.Get(key) ?? '');
            const cmp = ordinalCompare(aVal, bVal);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });

        const existingChildren = existingRecordData?.collections?.[colName] ?? [];
        const childIndex = ExistingRecordIndex.Build(
          existingChildren.map((existingChild) => ({ Record: existingChild })),
          childEntityInfo
        );
        childIndex.ThrowIfUnsetKeyVariables(childEntityInfo.Name);

        for (const child of items) {
          const childPK: Record<string, unknown> = {};
          for (const pk of childEntityInfo.PrimaryKeys) {
            childPK[pk.Name] = child.Get(pk.Name);
          }
          const existingChild = childIndex.Find(childPK)?.Record;

          const childData = await this.ProcessRecord(
            child,
            childPK,
            targetDir,
            childConfig,
            verbose,
            !existingChild,
            existingChild,
            currentDepth + 1,
            new Set([...(ancestryPath ?? []), `${record.EntityInfo.Name}:${JSON.stringify(record.PrimaryKey)}`])
          );
          if (isNaturalKeyed) {
            this.toNaturalKeyedItem(childData, rel.RelatedEntityJoinField);
          }
          collections[colName].push(childData);
        }
      }
    }
  }

  /**
   * True when every field named in `declaredWhere` equals the child's value. Strings compare
   * case-insensitively, matching the collation of the columns these filters name.
   */
  private matchesDeclaredWhere(child: BaseEntity, declaredWhere: Record<string, unknown>): boolean {
    return Object.entries(declaredWhere).every(([field, wanted]) => {
      const actual = child.Get(field);
      if (typeof actual === 'string' && typeof wanted === 'string') {
        return actual.toLowerCase() === wanted.toLowerCase();
      }
      return actual === wanted;
    });
  }

  /**
   * Reshapes a pulled collection item so its natural key is its identity: drops `primaryKey`
   * (push matches the item on `matchOn` instead) and the join field (the collection stamps
   * the owner's foreign key itself).
   */
  private toNaturalKeyedItem(childData: RecordData, joinField: string | undefined): void {
    delete childData.primaryKey;
    if (joinField && childData.fields) {
      delete childData.fields[joinField];
    }
  }

  /**
   * Processes first-class extension on pull (§6)
   */
  private async processExtension(
    record: BaseEntity,
    primaryKey: Record<string, unknown>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean,
    existingRecordData?: RecordData
  ): Promise<RecordData['extension'] | undefined> {
    const child = record.ISAChild;
    if (!child) return undefined;

    // Leaf fields only: fields present on child but NOT on parent
    const parentFieldNames = new Set(record.EntityInfo.Fields.map((f) => f.Name.toLowerCase()));
    const childProperties = this.propertyExtractor.extractAllProperties(child);
    const leafFields: Record<string, unknown> = {};

    const childConfig: EntityConfig = { entity: child.EntityInfo.Name };
    const existingExtension: RecordData = {
      fields: this.existingExtensionFields(existingRecordData, child.EntityInfo.Name) ?? {},
      ...(existingRecordData?.primaryKey ? { primaryKey: existingRecordData.primaryKey } : {}),
    };
    for (const [fName, fVal] of Object.entries(childProperties)) {
      if (parentFieldNames.has(fName.toLowerCase())) continue;
      if (fName.startsWith('__mj_')) continue;
      if (primaryKey[fName] !== undefined) continue;
      const kept = await this.keepEnvReferences(fName, fVal, childProperties, primaryKey, targetDir, childConfig, existingExtension, verbose);
      leafFields[fName] = kept ?? fVal;
    }

    // Determine if child type is ambiguous (more than one subtype exists in metadata)
    const provider = Metadata.Provider; // global-provider-ok: MetadataSync is a single-provider CLI process
    const childSubtypes = provider?.Entities
      ? provider.Entities.filter(
          (e) => UUIDsEqual(e.ParentID, record.EntityInfo.ID) || UUIDsEqual(e.ParentEntityInfo?.ID, record.EntityInfo.ID)
        )
      : [];
    const needsEntityName = childSubtypes.length > 1 || record.EntityInfo.AllowMultipleSubtypes;

    return {
      ...(needsEntityName ? { entity: child.EntityInfo.Name } : {}),
      fields: leafFields,
    };
  }

  /**
   * Processes first-class embeds on pull (§6)
   */
  private async processEmbeds(
    record: BaseEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    embeds: Record<string, RecordData>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean,
    existingRecordData?: RecordData
  ): Promise<void> {
    for (const field of record.EntityInfo.Fields) {
      if (!field.RelatedEntity) continue;
      const objectPropName = `${field.Name}_Object`;
      const entityRecord = record as unknown as Record<string, unknown>;
      const embedded = entityRecord[objectPropName] as BaseEntity | undefined;

      if (embedded && typeof embedded.Get === 'function') {
        const embedProperties = this.propertyExtractor.extractAllProperties(embedded);
        const embedFields: Record<string, unknown> = {};
        const embedPK: Record<string, unknown> = {};
        for (const pk of embedded.EntityInfo.PrimaryKeys) {
          embedPK[pk.Name] = embedded.Get(pk.Name);
        }
        const existingEmbed = existingRecordData?.embeds?.[field.Name];
        const embedKey = this.keptEmbedPrimaryKey(embedPK, embedded.EntityInfo, existingEmbed);
        const embedConfig: EntityConfig = { entity: embedded.EntityInfo.Name };
        for (const [fName, fVal] of Object.entries(embedProperties)) {
          if (fName.startsWith('__mj_') || embedPK[fName] !== undefined) continue;
          const kept = await this.keepEnvReferences(fName, fVal, embedProperties, embedPK, targetDir, embedConfig, existingEmbed, verbose);
          embedFields[fName] = kept ?? fVal;
        }

        embeds[field.Name] = {
          fields: embedFields,
          ...(Object.keys(embedPK).length > 0 ? { primaryKey: embedKey } : {}),
        };
      }
    }
  }

  /**
   * The key pull writes for an embed: the existing embed's `@env:` key values that still resolve to the database key.
   * @throws UnsetPrimaryKeyVariableError when an existing embed key variable is not set
   */
  private keptEmbedPrimaryKey(
    embedPK: Record<string, unknown>,
    embedEntityInfo: EntityInfo,
    existingEmbed: RecordData | undefined
  ): Record<string, unknown> {
    if (!existingEmbed?.primaryKey) {
      return embedPK;
    }
    ExistingRecordIndex.Build([{ Record: existingEmbed }], embedEntityInfo).ThrowIfUnsetKeyVariables(embedEntityInfo.Name);
    return KeepPrimaryKeyEnvReferences(existingEmbed.primaryKey, embedPK, embedEntityInfo);
  }

  /** The fields of the existing extension, in its shorthand form or its map form keyed by entity name. */
  private existingExtensionFields(
    existingRecordData: RecordData | undefined,
    childEntityName: string
  ): Record<string, unknown> | undefined {
    const extension = existingRecordData?.extension;
    if (!extension) {
      return undefined;
    }
    const shorthandFields = (extension as { fields?: unknown }).fields;
    if (IsJsonContainer(shorthandFields) && !Array.isArray(shorthandFields)) {
      return shorthandFields;
    }
    return (extension as Record<string, { fields?: Record<string, unknown> }>)[childEntityName]?.fields;
  }

  /**
   * Checks if the record has externalized fields
   */
  private hasExternalizedFields(fields: Record<string, any>, entityConfig: EntityConfig): boolean {
    return !!entityConfig.pull?.externalizeFields &&
           Object.values(fields).some(value =>
             typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.FILE)
           );
  }

  /**
   * Convert a GUID value to @lookup syntax by looking up the human-readable value
   */
  private async convertGuidToLookup(
    guidValue: string,
    lookupConfig: { entity: string; field: string },
    verbose?: boolean
  ): Promise<string> {
    if (!guidValue || typeof guidValue !== 'string') {
      return guidValue;
    }

    try {
      // The lookup target is any entity — build the predicate from its real key column(s).
      const md = new Metadata(); // global-provider-ok: MetadataSync is a single-provider CLI process
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: lookupConfig.entity,
        ExtraFilter: CompositeKey.FromURLSegment(md.EntityByName(lookupConfig.entity), guidValue).ToWhereClause(),
        ResultType: 'entity_object'
      }, this.contextUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        const targetRecord = result.Results[0];
        const lookupValue = targetRecord[lookupConfig.field];
        
        if (lookupValue != null) {
          return createKeywordReference('lookup', `${lookupConfig.entity}.${lookupConfig.field}=${lookupValue}`);
        }
      }

      if (verbose) {
        console.warn(`Lookup failed for ${guidValue} in ${lookupConfig.entity}.${lookupConfig.field}`);
      }
      
      return guidValue; // Return original GUID if lookup fails
    } catch (error) {
      if (verbose) {
        console.warn(`Error during lookup conversion: ${error}`);
      }
      return guidValue;
    }
  }
}