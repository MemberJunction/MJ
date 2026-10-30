import { EntityFieldInfo, EntityInfo, EntityRelationshipInfo, Metadata, RelatedRecordCollection, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import * as fs from 'fs';
import fse from 'fs-extra';
import * as path from 'path';
import { minimatch } from 'minimatch';
import fastGlob from 'fast-glob';
import { RecordFieldNames } from '../lib/entity-field-names';
import { RECORD_FILE_GLOB_OPTIONS } from '../lib/record-file-glob';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  FileValidationResult,
  EntityDependency,
  ParsedReference,
} from '../types/validation';
import { RecordData } from '../lib/sync-engine';
import { GetSystemUser } from '../lib/provider-utils';
import { IsIgnoredDirectoryName } from '../lib/ignore-directories';
import { MapJsonStartLines } from '../lib/json-record-lines';
import { ParseMetadataReference } from '../lib/reference-parser';
import { ParseEnvReference } from '../lib/env-reference';
import { LOOKUP_OPTIONAL_MESSAGE } from '../lib/lookup-reference';
import { EvaluatePushWhen, PushWhenError } from '../lib/push-when';
import {
  METADATA_KEYWORDS,
  IsMetadataKeyword,
  ExtractKeywordValue
} from '../constants/metadata-keywords';
import { EntityConfig, FolderOverride, SyncConfig } from '../config';
import { ResolveCollectionRelationship } from '@memberjunction/record-graph';

// Type aliases for clarity
type EntityData = RecordData;
type EntitySyncConfig = EntityConfig;
/** The `.mj-sync.json` given to ValidateDirectory: a metadata root or one entity folder. */
type DirectoryConfig = Partial<EntityConfig> & Pick<SyncConfig, 'directoryOrder' | 'userRoleValidation'>;

/** One record entry for an entity and primary key: where it starts and the raw field values it sets. */
interface RecordClaim {
  /** The entity folder the entry is in, by its name under the metadata root ('' for a lone folder). */
  Folder: string;
  Path: string;
  Line: number | undefined;
  Fields: Record<string, unknown>;
}

export class ValidationService {
  private metadata: Metadata;
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private entityDependencies: Map<string, EntityDependency> = new Map();
  private processedEntities: Set<string> = new Set();
  private claimedPrimaryKeys: Map<string, RecordClaim[]> = new Map();
  /** 1-based start line of each record object read from a record file. */
  private recordStartLines = new WeakMap<object, number>();
  /** The entity folder being validated. Push resolves record `@file:` references from it. */
  private entityDir = '';
  /** That folder's name under the metadata root, as in `directoryOrder`. */
  private entityFolder = '';
  /** Each folder's `overrides`, by folder name. */
  private folderOverrides = new Map<string, FolderOverride[]>();
  private options: ValidationOptions;
  private userRoleCache: Map<string, string[]> = new Map();

  constructor(options: Partial<ValidationOptions> = {}) {
    this.metadata = new Metadata(); // global-provider-ok: metadata sync operates on the configured provider only
    this.options = {
      verbose: false,
      outputFormat: 'human',
      maxNestingDepth: 10,
      checkBestPractices: true,
      ...options,
    };
  }

  /**
   * Validates all metadata files in the specified directory
   */
  public async ValidateDirectory(dir: string): Promise<ValidationResult> {
    // Validate that include and exclude are not used together
    if (this.options.include && this.options.exclude) {
      throw new Error('Cannot specify both --include and --exclude options. Please use one or the other.');
    }

    this.reset();

    const configPath = path.join(dir, '.mj-sync.json');
    if (!fs.existsSync(configPath)) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: dir,
        message: 'No .mj-sync.json configuration file found in directory',
      });
      return this.getResult();
    }

    const config: DirectoryConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Load user role configuration and cache if enabled
    if (config.userRoleValidation?.enabled) {
      await this.loadUserRoles();
    }

    if (!config.entity && config.pushWhen !== undefined) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: configPath,
        message: 'pushWhen is only allowed in an entity folder .mj-sync.json',
        suggestion: 'Move pushWhen into the .mj-sync.json of each folder it should gate',
      });
    }

    // A config with an entity means `dir` is one entity folder, unless the caller treats it as a root
    const isEntityFolder = !!config.entity && !this.options.ValidateChildFoldersOnly;
    const candidates = isEntityFolder ? [''] : await this.getDirectoriesInOrder(dir, config);
    const directories = candidates.filter((subDir) => this.pushWhenAllows(path.join(dir, subDir)));

    let totalFiles = 0;
    let totalEntities = 0;
    const fileResults = new Map<string, FileValidationResult>();

    for (const subDir of directories) {
      const subDirPath = path.join(dir, subDir);
      const result = await this.validateEntityDirectory(subDirPath, subDir);
      this.warnNestedPushWhen(subDirPath);
      if (result) {
        totalFiles += result.files;
        totalEntities += result.entities;
        for (const [file, fileResult] of result.fileResults) {
          fileResults.set(file, fileResult);
        }
      }
    }

    await this.validateDependencyOrder(directories);
    if (!isEntityFolder) {
      this.validateOverrideFolders(dir, this.orderFolders(dir, config));
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        totalFiles,
        totalEntities,
        totalErrors: this.errors.length,
        totalWarnings: this.warnings.length,
        fileResults,
      },
    };
  }

  /** Warns about each `.mj-sync.json` below `dir` that has `pushWhen`; push over a parent folder ignores it. */
  private warnNestedPushWhen(dir: string): void {
    const configPaths = fastGlob.sync('*/**/.mj-sync.json', {
      cwd: dir,
      absolute: true,
      dot: true,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
    });
    for (const configPath of configPaths) {
      let config: unknown;
      try {
        config = fse.readJsonSync(configPath);
      } catch {
        continue;
      }
      if (config === null || typeof config !== 'object' || Array.isArray(config) || !('pushWhen' in config)) {
        continue;
      }
      this.addWarning({
        type: 'validation',
        severity: 'warning',
        file: configPath,
        message: 'pushWhen in a nested folder has no effect when push runs over a parent folder',
        suggestion: 'Move the folder directly under the metadata root, or push it with --dir',
      });
    }
  }

  /** @deprecated Use {@link ValidateDirectory}. */
  public async validateDirectory(dir: string): Promise<ValidationResult> {
    return this.ValidateDirectory(dir);
  }

  /**
   * Validates a single entity directory
   */
  private async validateEntityDirectory(dir: string, folder: string): Promise<{ files: number; entities: number; fileResults: Map<string, FileValidationResult> } | null> {
    // The folder's entity comes from .mj-sync.json; .mj-folder.json holds only defaults
    const configPath = path.join(dir, '.mj-sync.json');
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const config: DirectoryConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Validate entity name exists
    if (!config.entity || config.entity.trim() === '') {
      this.addError({
        type: 'validation',
        severity: 'error',
        file: configPath,
        message: 'Entity name is empty or missing',
      });
      return null;
    }
    const entityConfig: EntitySyncConfig = { ...config, entity: config.entity };

    const entityInfo = this.metadata.EntityByName(entityConfig.entity);

    if (!entityInfo) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: configPath,
        message: `Entity "${config.entity}" not found in metadata`,
      });
      return null;
    }

    // Validate collection modes if defined (§8.1)
    if (config.collections) {
      for (const [colName, colConfig] of Object.entries(config.collections)) {
        const c = colConfig as { mode?: string; maxImpliedDeletePercent?: number };
        if (c.mode && c.mode !== 'upsert' && c.mode !== 'authoritative') {
          this.addError({
            type: 'validation',
            severity: 'error',
            file: configPath,
            message: `Invalid collection mode "${c.mode}" for collection "${colName}". Allowed values: "upsert", "authoritative"`,
          });
        }
      }
    }

    this.entityDir = path.resolve(dir);
    this.entityFolder = folder;
    this.readFolderOverrides(config.overrides, folder, entityInfo, configPath);
    const files = await this.getMatchingFiles(dir, config.filePattern);
    let totalEntities = 0;
    const fileResults = new Map<string, FileValidationResult>();

    for (const file of files) {
      const result = await this.validateFile(file, entityInfo, entityConfig);
      if (result) {
        totalEntities += result.entityCount;
        fileResults.set(file, result);
      }
    }

    return { files: files.length, entities: totalEntities, fileResults };
  }

  /**
   * Validates a single metadata file
   */
  private async validateFile(filePath: string, entityInfo: EntityInfo, config: EntitySyncConfig): Promise<FileValidationResult> {
    let entityCount = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const data = JSON.parse(content);
      this.recordStartLines = MapJsonStartLines(content, data);
      const entities = Array.isArray(data) ? data : [data];
      entityCount = entities.length;

      for (const entityData of entities) {
        await this.validateEntityData(entityData, entityInfo, filePath, config);
      }
    } catch (error) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: filePath,
        message: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    // Collect errors and warnings for this file
    const currentFileErrors = this.errors.filter((e) => e.file === filePath);
    const currentFileWarnings = this.warnings.filter((w) => w.file === filePath);

    return {
      file: filePath,
      entityCount,
      errors: currentFileErrors,
      warnings: currentFileWarnings,
    };
  }

  /**
   * Validates a single entity data object
   */
  private async validateEntityData(
    entityData: EntityData,
    entityInfo: EntityInfo,
    filePath: string,
    config: EntitySyncConfig,
    parentContext?: { entity: string; field: string },
    depth: number = 0,
    ownerContext?: { entity: string },
  ): Promise<void> {
    // Validate top-level keys with did-you-mean (§5.1)
    const knownTopLevelKeys = [
      '$schema',
      'primaryKey',
      'fields',
      'collections',
      'embeds',
      'extension',
      'relatedEntities',
      'sync',
      '__mj_sync_notes',
      'deleteRecord',
      '_comments',
    ];
    for (const key of Object.keys(entityData)) {
      if (!knownTopLevelKeys.includes(key)) {
        const suggestion = this.findClosestKey(key, knownTopLevelKeys);
        const didYouMean = suggestion ? ` Did you mean "${suggestion}"?` : '';
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Unknown top-level property "${key}" in record.${didYouMean}`,
          suggestion: `Allowed top-level properties are: ${knownTopLevelKeys.join(', ')}`,
        });
      }
    }

    this.validatePrimaryKeyEnvReferences(entityData.primaryKey, entityInfo.Name, filePath);

    this.checkRecordClaim(entityData, entityInfo.Name, filePath);

    // Skip validation for deletion records - they don't need field validation or reference checks
    if ((entityData as any).deleteRecord?.delete === true) {
      // Only validate that primaryKey exists for deletion records
      if (!entityData.primaryKey) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: 'Deletion record is missing required "primaryKey" property',
          suggestion: 'Add primaryKey to identify the record to delete',
        });
      }
      return; // Skip all other validation for deletion records
    }

    // Check nesting depth
    if (depth > this.options.maxNestingDepth) {
      this.addWarning({
        type: 'nesting',
        severity: 'warning',
        entity: entityInfo.Name,
        file: filePath,
        message: `Nesting depth ${depth} exceeds recommended maximum of ${this.options.maxNestingDepth}`,
        suggestion: 'Consider flattening the data structure or increasing maxNestingDepth',
      });
    }

    // Validate that 'fields' property exists (required)
    if (!entityData.fields) {
      const context = parentContext
        ? `Related entity "${parentContext.field}" in ${parentContext.entity}`
        : `Record`;
      this.addError({
        type: 'field',
        severity: 'error',
        entity: entityInfo.Name,
        file: filePath,
        message: `${context} is missing required "fields" property. Did you mean "fields" instead of "field"?`,
        suggestion: 'Each record must have a "fields" object containing the entity field values',
      });
      return; // Can't continue validation without fields
    }

    // Validate fields. Pass whether this record already exists (has a primaryKey
    // block) so the required-field best-practice check can be limited to NEW
    // records — an existing record already holds the value in the DB, so a
    // missing NOT-NULL field in the file is not a problem and would only be noise.
    this.reportTemplateValues(entityData.fields, entityData, entityInfo.Name, filePath);
    await this.validateFields(entityData.fields, entityInfo, filePath, parentContext, !!entityData.primaryKey, ownerContext);

    // Track dependencies
    this.trackEntityDependencies(entityData, entityInfo.Name, filePath);

    // Validate extension (§4.1, §4.2)
    if (entityData.extension) {
      await this.validateExtension(entityData.extension, entityInfo, filePath, config, depth);
    }

    // Validate collections (§4.1, §8.1)
    if (entityData.collections) {
      await this.validateCollections(entityData.collections, entityInfo, filePath, config, depth);
    }

    // Validate embeds (§4.1)
    if (entityData.embeds) {
      await this.validateEmbeds(entityData.embeds, entityInfo, filePath, config, depth);
    }

    // Validate related entities
    if (entityData.relatedEntities) {
      for (const [relatedEntityName, relatedData] of Object.entries(entityData.relatedEntities)) {
        const relatedEntityInfo = this.metadata.EntityByName(relatedEntityName);
        if (!relatedEntityInfo) {
          this.addError({
            type: 'entity',
            severity: 'error',
            entity: entityInfo.Name,
            file: filePath,
            message: `Related entity "${relatedEntityName}" not found in metadata`,
          });
          continue;
        }

        // Section 4.5 diagnostics:
        // Check if related entity looks like an IsA child (shared PK / ParentID is this entity)
        if (
          UUIDsEqual(relatedEntityInfo.ParentID, entityInfo.ID) ||
          (relatedEntityInfo.ParentEntityInfo && relatedEntityInfo.ParentEntityInfo.Name.trim().toLowerCase() === entityInfo.Name.trim().toLowerCase())
        ) {
          this.addWarning({
            type: 'bestpractice',
            severity: 'warning',
            entity: entityInfo.Name,
            file: filePath,
            message: `relatedEntities['${relatedEntityName}'] looks like an IsA child (shared PK). Use extension — see §4.1.`,
          });
        }

        // Check if a RelatedRecordCollection exists whose related entity is this child
        const matchingCollectionRel = entityInfo.RelatedEntities?.find((rel: EntityRelationshipInfo) => {
          if (!rel.RelatedRecordCollection) return false;
          return rel.RelatedEntity?.trim().toLowerCase() === relatedEntityName.trim().toLowerCase();
        });
        if (matchingCollectionRel) {
          let colName = relatedEntityName;
          try {
            const parsed = JSON.parse(matchingCollectionRel.RelatedRecordCollection);
            if (parsed.Name) colName = parsed.Name;
          } catch {}
          this.addWarning({
            type: 'bestpractice',
            severity: 'warning',
            entity: entityInfo.Name,
            file: filePath,
            message: `relatedEntities['${relatedEntityName}'] could be collections['${colName}'].`,
          });
        }

        const relatedEntities = Array.isArray(relatedData) ? relatedData : [relatedData];
        for (const relatedEntity of relatedEntities) {
          await this.validateEntityData(relatedEntity, relatedEntityInfo, filePath, config, { entity: entityInfo.Name, field: relatedEntityName }, depth + 1);
        }
      }
    }
  }

  /**
   * Validates entity fields
   */
  private async validateFields(
    fields: Record<string, any>,
    entityInfo: EntityInfo,
    filePath: string,
    parentContext?: { entity: string; field: string },
    isExistingRecord: boolean = false,
    ownerContext?: { entity: string },
  ): Promise<void> {
    const entityFields = entityInfo.Fields;
    // Field names match the entity's fields without regard to case, as push matches them
    const fieldMap = new Map(entityFields.map((f) => [f.Name.toLowerCase(), f]));

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const fieldInfo = fieldMap.get(fieldName.toLowerCase());

      if (!fieldInfo) {
        // Check if this might be a virtual property (getter/setter)
        try {
          const entityInstance = await this.metadata.GetEntityObject(entityInfo.Name, GetSystemUser());
          // we use this approach instead of checking Entity Fields because
          // some sub-classes implement setter properties that allow you to set
          // values that are not physically in the database but are resolved by the sub-class
          // a good example is the sub-class for AI Prompts that has a property called TemplateText
          // that is automatically resolved into a separate record in the Templates/Template Contents entity
          const hasProperty = fieldName in entityInstance;

          if (!hasProperty) {
            this.addError({
              type: 'field',
              severity: 'error',
              entity: entityInfo.Name,
              field: fieldName,
              file: filePath,
              message: `Field "${fieldName}" does not exist on entity "${entityInfo.Name}"`,
            });
            continue;
          }

          continue;
        } catch (error) {
          // If we can't create an entity instance, fall back to error
          this.addError({
            type: 'field',
            severity: 'error',
            entity: entityInfo.Name,
            field: fieldName,
            file: filePath,
            message: `Field "${fieldName}" does not exist on entity "${entityInfo.Name}"`,
          });
          continue;
        }
      }

      const isSystemField = fieldInfo.Name.startsWith('__mj_');

      // A read-only field that push ignores (such as a joined display field that pull writes) is a warning
      if (fieldInfo.ReadOnly && !fieldInfo.IsPrimaryKey && !isSystemField) {
        const pullAdvice = fieldInfo.IsVirtual
          ? 'set pull.ignoreVirtualFields: true to stop pull writing it'
          : 'add it to pull.excludeFields to stop pull writing it';
        this.addWarning({
          type: 'validation',
          severity: 'warning',
          entity: entityInfo.Name,
          field: fieldName,
          file: filePath,
          message: `Field "${fieldName}" is read-only: push ignores it; ${pullAdvice}`,
        });
        continue;
      }

      // A system field or the primary key cannot be set in fields
      if (fieldInfo.ReadOnly || isSystemField) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          field: fieldName,
          file: filePath,
          message: `Field "${fieldName}" is a read-only or system field and cannot be set`,
          suggestion: 'Remove this field from your metadata file',
        });
        continue;
      }

      // Validate field value and references
      await this.validateFieldValue(fieldValue, fieldInfo, entityInfo, filePath, parentContext, ownerContext);
    }

    // Check for required fields — only for NEW records. An existing record
    // (identified by a primaryKey block) already has values persisted in the
    // DB for any NOT-NULL field; metadata files routinely set only a subset of
    // fields on an update, so warning about "missing" required fields there is
    // pure noise that masks genuine warnings. New records (no primaryKey) still
    // get the full check since their required fields must be supplied to insert.
    if (this.options.checkBestPractices && !isExistingRecord) {
      const recordFields = new RecordFieldNames(fields);
      for (const field of entityFields) {
        // Skip if field allows null or has a value already (use 'in' to handle falsy values like 0, false, "")
        if (field.AllowsNull || recordFields.Has(field.Name)) {
          continue;
        }

        // Skip if field has a default value
        if (field.DefaultValue !== null && field.DefaultValue !== undefined) {
          continue;
        }

        // Skip virtual/computed fields (foreign key reference fields)
        // These are typically named without 'ID' suffix but have a corresponding FK field
        const relatedEntityField = field.RelatedEntity;
        const correspondingFKField = entityFields.find((f: any) => f.Name === field.Name + 'ID' && f.IsForeignKey);
        if (relatedEntityField && correspondingFKField) {
          continue;
        }

        // Skip fields that are marked as AutoUpdateOnly or ReadOnly
        if (field.AutoIncrement || field.ReadOnly) {
          continue;
        }

        // Skip if this is a parent context and the field can be inherited
        if (parentContext && (field.Name === parentContext.field || field.Name === parentContext.field + 'ID')) {
          continue;
        }

        // Special case: Skip TemplateID if TemplateText is provided (virtual property)
        if (field.Name === 'TemplateID' && fields['TemplateText']) {
          continue;
        }

        // Skip Template field if TemplateText is provided
        if (field.Name === 'Template' && fields['TemplateText']) {
          continue;
        }

        // Skip Path on Applications - it is auto-calculated by the server on save
        if (field.Name === 'Path' && entityInfo.Name === 'MJ: Applications') {
          continue;
        }

        this.addWarning({
          type: 'bestpractice',
          severity: 'warning',
          entity: entityInfo.Name,
          field: field.Name,
          file: filePath,
          message: `Required field "${field.Name}" is missing`,
          suggestion: `Add "${field.Name}" to the fields object`,
        });
      }
    }
  }

  /**
   * Validates field values and references
   */
  private async validateFieldValue(
    value: any,
    fieldInfo: EntityFieldInfo,
    entityInfo: EntityInfo,
    filePath: string,
    parentContext?: { entity: string; field: string },
    ownerContext?: { entity: string },
  ): Promise<void> {
    if (typeof value === 'string' && this.isValidReference(value)) {
      await this.validateReference(value, fieldInfo, entityInfo, filePath, parentContext, ownerContext);
      // Skip further validation for references as they will be resolved later
      return;
    }

    // Validate field value against value list if applicable
    await this.validateFieldValueList(value, fieldInfo, entityInfo, filePath);

    // Validate UserID fields against allowed roles
    if (fieldInfo.Name === 'UserID' && typeof value === 'string' && value.length > 0) {
      // Get the sync config from the file's directory
      const dir = path.dirname(filePath);

      // Walk up to find the root sync config with userRoleValidation
      let currentDir = dir;
      let config = null;
      while (currentDir && currentDir !== path.parse(currentDir).root) {
        const currentConfigPath = path.join(currentDir, '.mj-sync.json');
        if (fs.existsSync(currentConfigPath)) {
          try {
            const currentConfig = JSON.parse(fs.readFileSync(currentConfigPath, 'utf8'));
            if (currentConfig.userRoleValidation) {
              config = currentConfig;
              break;
            }
          } catch {
            // Ignore parse errors
          }
        }
        currentDir = path.dirname(currentDir);
      }

      if (config?.userRoleValidation?.enabled) {
        await this.validateUserRole(value, entityInfo.Name, fieldInfo.Name, filePath, config);
      }
    }

    // Add other type validation here if needed
  }

  /**
   * Validates field value against the field's value list if applicable
   */
  private async validateFieldValueList(
    value: any,
    fieldInfo: EntityFieldInfo,
    entityInfo: EntityInfo,
    filePath: string
  ): Promise<void> {
    // Skip validation if value is null/undefined (handled by required field check)
    if (value === null || value === undefined || value === '') {
      return;
    }

    // Check if this field has a value list constraint
    if (fieldInfo.ValueListType !== 'List') {
      return;
    }

    // Get the allowed values from EntityFieldValues
    const entityFieldValues = fieldInfo.EntityFieldValues;
    if (!entityFieldValues || !Array.isArray(entityFieldValues) || entityFieldValues.length === 0) {
      // No values defined, skip validation
      return;
    }

    // Extract the allowed values
    const allowedValues = entityFieldValues.map((efv: any) => efv.Value);
    
    // Convert value to string for comparison (in case it's a number or boolean)
    const stringValue = String(value);

    // Support comma-delimited multi-value fields (e.g., "Data Expert, Requirements Expert").
    // Only treat as multi-value if the whole string isn't itself an allowed value and
    // every comma-separated segment matches an allowed value (case-insensitive).
    // This avoids incorrectly splitting values that legitimately contain commas.
    let valuesToCheck = [stringValue];
    if (stringValue.includes(',') && !allowedValues.includes(stringValue)) {
      const segments = stringValue.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0);
      const allSegmentsValid = segments.every((seg: string) =>
        allowedValues.some((av: string) => av.toLowerCase() === seg.toLowerCase())
      );
      if (allSegmentsValid) {
        valuesToCheck = segments;
      }
    }

    for (const singleValue of valuesToCheck) {
      if (!allowedValues.includes(singleValue)) {
        // Check case-insensitive match as a warning
        const caseInsensitiveMatch = allowedValues.find((av: string) =>
          av.toLowerCase() === singleValue.toLowerCase()
        );

        if (caseInsensitiveMatch) {
          this.addWarning({
            type: 'validation',
            severity: 'warning',
            entity: entityInfo.Name,
            field: fieldInfo.Name,
            file: filePath,
            message: `Field "${fieldInfo.Name}" has value "${singleValue}" which differs in case from allowed value "${caseInsensitiveMatch}"`,
            suggestion: `Use "${caseInsensitiveMatch}" for consistency`,
          });
        } else {
          // Format the allowed values list for display
          const allowedValuesList = allowedValues.length <= 10
            ? allowedValues.join(', ')
            : allowedValues.slice(0, 10).join(', ') + `, ... (${allowedValues.length - 10} more)`;

          this.addError({
            type: 'field',
            severity: 'error',
            entity: entityInfo.Name,
            field: fieldInfo.Name,
            file: filePath,
            message: `Field "${fieldInfo.Name}" has invalid value "${singleValue}"`,
            suggestion: `Allowed values are: ${allowedValuesList}`,
          });
        }
      }
    }
  }

  /** Reports each `@template:` value in a record's fields. Push saves that text unchanged instead of loading a file. */
  private reportTemplateValues(fields: Record<string, unknown>, record: object, entityName: string, filePath: string): void {
    const line = this.recordStartLines.get(record);
    for (const [fieldName, value] of Object.entries(fields)) {
      if (typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.TEMPLATE)) {
        this.addTemplateError(value, entityName, fieldName, filePath, line);
      }
    }
  }

  private addTemplateError(value: string, entityName: string, fieldName: string, filePath: string, line?: number): void {
    const location = line === undefined ? filePath : `${filePath}:${line}`;
    this.addError({
      type: 'reference',
      severity: 'error',
      entity: entityName,
      field: fieldName,
      file: filePath,
      message:
        `@template: is not supported by mj sync push; push would save the literal text "${value}" to ${entityName}.${fieldName} ` +
        `at ${location}. Use @file: instead.`,
    });
  }

  /**
   * Records an entry for its entity and primary key. Several entries may describe the same record,
   * but two entries that set the same field to different raw values give an error.
   * A key that holds an `@parent:`, `@owner:` or `@root:` reference anywhere, or an object value, is not
   * recorded.
   */
  private checkRecordClaim(entityData: EntityData, entityName: string, filePath: string): void {
    if (!entityData.primaryKey || Object.keys(entityData.primaryKey).length === 0 || this.hasRelativeKeyValue(entityData.primaryKey)) {
      return;
    }
    const fields = entityData.fields;
    const claim: RecordClaim = {
      Folder: this.entityFolder,
      Path: filePath,
      Line: this.recordStartLines.get(entityData),
      Fields: fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {},
    };
    const claimKey = `${entityName}:${JSON.stringify(entityData.primaryKey)}`;
    const claims = this.claimedPrimaryKeys.get(claimKey) ?? [];
    for (const earlier of claims) {
      const conflictingFields = Object.keys(claim.Fields).filter(
        (field) =>
          Object.prototype.hasOwnProperty.call(earlier.Fields, field) &&
          !this.jsonValuesEqual(earlier.Fields[field], claim.Fields[field]) &&
          !this.isDeclaredOverride(earlier, claim, field),
      );
      if (conflictingFields.length > 0) {
        this.addClaimConflictError(entityName, entityData.primaryKey, conflictingFields, earlier, claim);
      }
    }
    claims.push(claim);
    this.claimedPrimaryKeys.set(claimKey, claims);
  }

  /**
   * True when a key value can depend on the parent, owner or root record, so equal key text can name
   * different records: it holds one of these references (also inside a `@lookup:`), or it is an object.
   */
  private hasRelativeKeyValue(primaryKey: Record<string, unknown>): boolean {
    const relativePrefixes = [METADATA_KEYWORDS.PARENT, METADATA_KEYWORDS.OWNER, METADATA_KEYWORDS.ROOT];
    return Object.values(primaryKey).some(
      (value) =>
        (typeof value === 'object' && value !== null) ||
        (typeof value === 'string' && relativePrefixes.some((prefix) => value.includes(prefix))),
    );
  }

  /** Adds the error for two entries of one record that set fields to different values. */
  private addClaimConflictError(
    entityName: string,
    primaryKey: Record<string, unknown>,
    conflictingFields: string[],
    earlier: RecordClaim,
    later: RecordClaim,
  ): void {
    const earlierLocation = this.formatClaimLocation(earlier);
    const laterLocation = this.formatClaimLocation(later);
    const fieldText = conflictingFields
      .map(
        (field) =>
          `field "${field}" is ${this.formatClaimValue(earlier.Fields[field])} at ${earlierLocation} and ${this.formatClaimValue(later.Fields[field])} at ${laterLocation}`,
      )
      .join('; ');
    const fix =
      earlier.Folder === later.Folder
        ? 'Make both entries set the same value, or set the field in one entry only.'
        : 'Make both entries set the same value, set the field in one entry only, or, if the later folder changes it on purpose, ' +
          `list it in "overrides" in ${path.join(later.Folder, '.mj-sync.json')}.`;
    this.addError({
      type: 'field',
      severity: 'error',
      entity: entityName,
      field: conflictingFields.length === 1 ? conflictingFields[0] : undefined,
      file: later.Path,
      message: `Conflicting values for ${entityName} record ${JSON.stringify(primaryKey)}: ${fieldText}. ${fix}`,
    });
  }

  /** True when the later entry's folder lists the field in its `overrides` for the earlier entry's folder. */
  private isDeclaredOverride(earlier: RecordClaim, later: RecordClaim, field: string): boolean {
    if (earlier.Folder === later.Folder) {
      return false;
    }
    const fieldName = field.toLowerCase();
    return (this.folderOverrides.get(later.Folder) ?? []).some(
      (entry) => entry.folder === earlier.Folder && entry.fields.some((name) => name.toLowerCase() === fieldName),
    );
  }

  /**
   * Reads a folder's `overrides`. Reports an entry that is not `{ folder, fields }` or that names a
   * field the folder's entity does not have, and keeps the well-formed entries.
   */
  private readFolderOverrides(value: unknown, folder: string, entityInfo: EntityInfo, configPath: string): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      this.addOverrideError(configPath, '"overrides" must be a list of { "folder": "<earlier folder>", "fields": ["<field>", ...] }');
      return;
    }
    const kept: FolderOverride[] = [];
    for (const entry of value) {
      if (!this.isFolderOverride(entry)) {
        this.addOverrideError(configPath, 'Each "overrides" entry must be { "folder": "<earlier folder>", "fields": ["<field>", ...] }');
        continue;
      }
      for (const field of entry.fields) {
        if (!entityInfo.Fields.some((f) => f.Name.toLowerCase() === field.toLowerCase())) {
          this.addOverrideError(configPath, `"overrides" lists field "${field}", which entity "${entityInfo.Name}" does not have`);
        }
      }
      kept.push(entry);
    }
    this.folderOverrides.set(folder, kept);
  }

  private isFolderOverride(entry: unknown): entry is FolderOverride {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const { folder, fields } = entry as Record<string, unknown>;
    return (
      typeof folder === 'string' &&
      folder.trim() !== '' &&
      Array.isArray(fields) &&
      fields.length > 0 &&
      fields.every((field) => typeof field === 'string' && field.trim() !== '')
    );
  }

  /**
   * Checks that each folder in an `overrides` entry is another entity folder under the metadata
   * root, and that push runs it before the folder that declares the entry.
   */
  private validateOverrideFolders(rootDir: string, pushOrder: string[]): void {
    for (const [folder, entries] of this.folderOverrides) {
      const configPath = path.join(rootDir, folder, '.mj-sync.json');
      for (const entry of entries) {
        const message = this.overrideFolderProblem(rootDir, pushOrder, folder, entry.folder);
        if (message) {
          this.addOverrideError(configPath, message);
        }
      }
    }
  }

  /** What is wrong with `earlierFolder` as an override target of `folder`, or undefined. */
  private overrideFolderProblem(rootDir: string, pushOrder: string[], folder: string, earlierFolder: string): string | undefined {
    if (earlierFolder === folder) {
      return `"overrides" names this folder itself ("${folder}"); name the earlier folder that sets the values it changes`;
    }
    if (!fs.existsSync(path.join(rootDir, earlierFolder, '.mj-sync.json'))) {
      return `"overrides" names folder "${earlierFolder}", which is not an entity folder under ${rootDir}`;
    }
    const earlierIndex = pushOrder.indexOf(earlierFolder);
    const index = pushOrder.indexOf(folder);
    if (earlierIndex > index) {
      return `"overrides" names folder "${earlierFolder}", which push runs after "${folder}". Put "${earlierFolder}" before "${folder}" in directoryOrder`;
    }
    return undefined;
  }

  private addOverrideError(configPath: string, message: string): void {
    this.addError({ type: 'validation', severity: 'error', file: configPath, message });
  }

  private formatClaimLocation(claim: RecordClaim): string {
    return claim.Line === undefined ? claim.Path : `${claim.Path}:${claim.Line}`;
  }

  /** A raw field value as JSON text, cut to 80 characters. */
  private formatClaimValue(value: unknown): string {
    const text = JSON.stringify(value) ?? String(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }

  /** Deep equality of two parsed JSON values. Object key order does not matter. */
  private jsonValuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
      return true;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, index) => this.jsonValuesEqual(item, right[index]))
      );
    }
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }
    const leftEntries = Object.entries(left);
    const rightValues = new Map(Object.entries(right));
    return (
      leftEntries.length === rightValues.size &&
      leftEntries.every(([key, value]) => rightValues.has(key) && this.jsonValuesEqual(value, rightValues.get(key)))
    );
  }

  /**
   * Check if a string is actually a MetadataSync reference (not just any @ string)
   */
  private isValidReference(value: string): boolean {
    return IsMetadataKeyword(value);
  }

  /**
   * Validates special references (@file:, @lookup:, etc.)
   */
  private async validateReference(
    reference: string,
    fieldInfo: EntityFieldInfo,
    entityInfo: EntityInfo,
    filePath: string,
    parentContext?: { entity: string; field: string },
    ownerContext?: { entity: string },
  ): Promise<void> {
    const parsed = this.parseReference(reference);
    if (!parsed) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityInfo.Name,
        field: fieldInfo.Name,
        file: filePath,
        message: `Invalid reference format: "${reference}"`,
      });
      return;
    }

    switch (parsed.type) {
      case METADATA_KEYWORDS.FILE:
        await this.validateFileReference(parsed.value, filePath, this.entityDir, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.LOOKUP:
        await this.validateLookupReference(parsed, filePath, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.TEMPLATE:
        // Reported by reportTemplateValues: push does not load @template: files
        break;
      case METADATA_KEYWORDS.OWNER:
        this.validateOwnerReference(parsed.value, ownerContext, filePath, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.PARENT:
        this.validateParentReference(parsed.value, parentContext, filePath, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.ROOT:
        this.validateRootReference(parsed.value, parentContext, filePath, entityInfo.Name, fieldInfo.Name);
        break;
    }
  }

  /**
   * Parses a reference string.
   *
   * Delegates to the pure {@link parseMetadataReference} function so the real
   * parser is unit-testable without instantiating this service.
   */
  private parseReference(reference: string): ParsedReference | null {
    return ParseMetadataReference(reference);
  }

  /**
   * Validates @file: references. `baseDir` is the folder push resolves the path from: the entity
   * folder for a record field, or the folder of the JSON file that holds the reference.
   */
  private async validateFileReference(
    filePath: string,
    sourceFile: string,
    baseDir: string,
    entityName: string,
    fieldName: string,
    visitedFiles?: Set<string>
  ): Promise<void> {
    const resolvedPath = path.resolve(baseDir, filePath);

    // Initialize visited files set if not provided (for circular reference detection)
    const visited = visitedFiles || new Set<string>();
    
    // Check for circular references
    if (visited.has(resolvedPath)) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `Circular @file reference detected: "${filePath}"`,
        details: `Path ${resolvedPath} is already being processed`,
        suggestion: 'Restructure your file references to avoid circular dependencies',
      });
      return;
    }

    if (!fs.existsSync(resolvedPath)) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `File reference not found: "${filePath}"`,
        suggestion: `Create file at: ${resolvedPath}`,
      });
      return;
    }

    // Add to visited set
    visited.add(resolvedPath);

    // Read the file and check for references
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      
      // Check for {@include} references in all file types
      await this.validateIncludeReferences(content, resolvedPath, new Set([resolvedPath]));
      
      // If it's a JSON file, parse and validate nested @ references
      if (resolvedPath.endsWith('.json')) {
        try {
          const jsonContent = JSON.parse(content);
          
          // Check if JSON contains @include directives that need preprocessing
          const jsonString = JSON.stringify(jsonContent);
          const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');
          
          if (hasIncludes) {
            await this.validateJsonIncludes(jsonContent, resolvedPath);
          }
          
          // Recursively validate all @ references in the JSON structure
          await this.validateJsonReferences(jsonContent, resolvedPath, entityName, visited);
        } catch (parseError) {
          // Not valid JSON or error parsing, treat as text file (already validated {@include} above)
          if (this.options.verbose) {
            console.log(`File ${resolvedPath} is not valid JSON, treating as text file`);
          }
        }
      }
    } catch (error) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `Failed to read file reference: "${filePath}"`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validates @lookup: references
   */
  private async validateLookupReference(parsed: ParsedReference, sourceFile: string, entityName: string, fieldName: string): Promise<void> {
    if (parsed.UnknownFlags?.includes('optional')) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: LOOKUP_OPTIONAL_MESSAGE,
        suggestion: 'Remove ?optional. Use @env:VAR?optional only as a whole field value.',
      });
    }

    const lookupEntity = this.metadata.EntityByName(parsed.entity!);

    if (!lookupEntity) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `Lookup entity "${parsed.entity}" not found`,
        suggestion: 'Check entity name spelling and case',
      });
      return;
    }

    // For multi-field lookups, validate all fields
    if (parsed.fields && parsed.fields.length > 0) {
      for (const {field} of parsed.fields) {
        const lookupField = lookupEntity.Fields.find((f: any) => f.Name === field);
        if (!lookupField) {
          this.addError({
            type: 'reference',
            severity: 'error',
            entity: entityName,
            field: fieldName,
            file: sourceFile,
            message: `Lookup field "${field}" not found on entity "${parsed.entity}"`,
            suggestion: `Available fields: ${lookupEntity.Fields.map((f: any) => f.Name).join(', ')}`,
          });
        }
      }
    } else if (parsed.field) {
      // Fallback for single field lookup (backward compatibility)
      const lookupField = lookupEntity.Fields.find((f: any) => f.Name === parsed.field);
      if (!lookupField) {
        this.addError({
          type: 'reference',
          severity: 'error',
          entity: entityName,
          field: fieldName,
          file: sourceFile,
          message: `Lookup field "${parsed.field}" not found on entity "${parsed.entity}"`,
          suggestion: `Available fields: ${lookupEntity.Fields.map((f: any) => f.Name).join(', ')}`,
        });
      }
    }

    // Track dependency
    this.addEntityDependency(entityName, parsed.entity!);
  }

  /**
   * Validates @parent: references
   */
  private validateParentReference(
    _fieldName: string,
    parentContext: { entity: string; field: string } | undefined,
    sourceFile: string,
    entityName: string,
    currentFieldName: string,
  ): void {
    if (!parentContext) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: currentFieldName,
        file: sourceFile,
        message: `@parent: reference used but no parent context exists`,
        suggestion: '@parent: can only be used in nested/related entities',
      });
    }
  }

  /**
   * Validates @root: references
   */
  private validateRootReference(
    _fieldName: string,
    parentContext: { entity: string; field: string } | undefined,
    sourceFile: string,
    entityName: string,
    currentFieldName: string,
  ): void {
    if (!parentContext) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: currentFieldName,
        file: sourceFile,
        message: `@root: reference used but no root context exists`,
        suggestion: '@root: can only be used in nested/related entities',
      });
    }
  }

  /**
   * Track entity dependencies
   */
  private trackEntityDependencies(entityData: EntityData, entityName: string, filePath: string): void {
    if (!this.entityDependencies.has(entityName)) {
      this.entityDependencies.set(entityName, {
        entityName,
        dependsOn: new Set(),
        file: filePath,
      });
    }

    // Track dependencies from lookups in fields
    if (entityData.fields) {
      for (const value of Object.values(entityData.fields)) {
        if (typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.LOOKUP)) {
          const parsed = this.parseReference(value);
          if (parsed?.entity) {
            this.addEntityDependency(entityName, parsed.entity);
          }
        }
      }
    }
  }

  /**
   * Add an entity dependency
   */
  private addEntityDependency(from: string, to: string): void {
    // Don't add self-references as dependencies (e.g., ParentID in hierarchical structures)
    if (from === to) {
      return;
    }
    
    if (!this.entityDependencies.has(from)) {
      this.entityDependencies.set(from, {
        entityName: from,
        dependsOn: new Set(),
        file: '',
      });
    }
    this.entityDependencies.get(from)!.dependsOn.add(to);
  }

  /**
   * Validates dependency order
   */
  private async validateDependencyOrder(directoryOrder: string[]): Promise<void> {
    // Build a map of entity to directory
    const entityToDirectory = new Map<string, string>();

    for (const dir of directoryOrder) {
      // This is simplified - in reality we'd need to read the .mj-sync.json
      // to get the actual entity name
      entityToDirectory.set(dir, dir);
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const [entity] of this.entityDependencies) {
      if (!visited.has(entity)) {
        this.checkCircularDependency(entity, visited, recursionStack);
      }
    }

    // Check if current order satisfies dependencies
    const orderViolations = this.checkDependencyOrder(directoryOrder);
    if (orderViolations.length > 0) {
      // Suggest a corrected order
      const suggestedOrder = this.topologicalSort();

      for (const violation of orderViolations) {
        this.addError({
          type: 'dependency',
          severity: 'error',
          entity: violation.entity,
          file: violation.file,
          message: `Entity '${violation.entity}' depends on '${violation.dependency}' but is processed before it`,
          suggestion: `Reorder directories to: [${suggestedOrder.join(', ')}]`,
        });
      }
    }
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependency(entity: string, visited: Set<string>, recursionStack: Set<string>, path: string[] = []): boolean {
    visited.add(entity);
    recursionStack.add(entity);
    path.push(entity);

    const deps = this.entityDependencies.get(entity);
    if (deps) {
      for (const dep of deps.dependsOn) {
        if (!visited.has(dep)) {
          if (this.checkCircularDependency(dep, visited, recursionStack, [...path])) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // Found circular dependency
          const cycle = [...path, dep];
          const cycleStart = cycle.indexOf(dep);
          const cyclePath = cycle.slice(cycleStart).join(' → ');

          this.addError({
            type: 'circular',
            severity: 'error',
            entity: entity,
            file: deps.file,
            message: `Circular dependency detected: ${cyclePath}`,
            suggestion: 'Restructure your entities to avoid circular references',
          });
          return true;
        }
      }
    }

    recursionStack.delete(entity);
    return false;
  }

  /**
   * Get directories in order based on config
   */
  private async getDirectoriesInOrder(
    rootDir: string,
    config: Pick<DirectoryConfig, 'directoryOrder' | 'ignoreDirectories'>
  ): Promise<string[]> {
    // Apply include/exclude filters if specified
    return this.applyDirectoryFilters(this.orderFolders(rootDir, config));
  }

  /** The folders push visits, in push order, before --include and --exclude. */
  private orderFolders(rootDir: string, config: Pick<DirectoryConfig, 'directoryOrder' | 'ignoreDirectories'>): string[] {
    // The folders push visits: no dot folders, none that match ignoreDirectories
    const allDirs = fs
      .readdirSync(rootDir)
      .filter((f) => fs.statSync(path.join(rootDir, f)).isDirectory())
      .filter((d) => !d.startsWith('.'))
      .filter((d) => !IsIgnoredDirectoryName(d, config.ignoreDirectories));

    let orderedDirs: string[];
    if (config.directoryOrder && Array.isArray(config.directoryOrder)) {
      const ordered = config.directoryOrder.filter((d) => allDirs.includes(d));
      const remaining = allDirs.filter((d) => !ordered.includes(d)).sort();
      orderedDirs = [...ordered, ...remaining];
    } else {
      orderedDirs = allDirs.sort();
    }
    return orderedDirs;
  }

  /**
   * Checks a folder's pushWhen and reports a malformed value or an unreadable
   * .mj-sync.json as an error. Returns false when the config cannot be read, or when
   * HonorPushWhen is set and push would skip the folder.
   */
  private pushWhenAllows(dirPath: string): boolean {
    const configPath = path.join(dirPath, '.mj-sync.json');
    if (!fs.existsSync(configPath)) {
      return true;
    }
    let config: unknown;
    try {
      config = fse.readJsonSync(configPath);
    } catch (error) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: configPath,
        message: `Cannot read .mj-sync.json: ${this.readErrorReason(error, configPath)}`,
      });
      return false;
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: configPath,
        message: '.mj-sync.json must contain a JSON object',
      });
      return false;
    }
    const pushWhen = 'pushWhen' in config ? config.pushWhen : undefined;
    if (pushWhen === undefined) {
      return true;
    }
    const problem = PushWhenError(pushWhen);
    if (problem) {
      this.addError({
        type: 'entity',
        severity: 'error',
        file: configPath,
        message: problem,
        suggestion: 'Use "pushWhen": "@env:VARIABLE"',
      });
      return true;
    }
    return !this.options.HonorPushWhen || EvaluatePushWhen(pushWhen).Push;
  }

  /** The reason from a read error, without the leading `<path>: ` that fs-extra adds. */
  private readErrorReason(error: unknown, filePath: string): string {
    const message = error instanceof Error ? error.message : String(error);
    const prefix = `${filePath}: `;
    return message.startsWith(prefix) ? message.slice(prefix.length) : message;
  }

  /**
   * Apply include/exclude filters to directory list
   */
  private applyDirectoryFilters(directories: string[]): string[] {
    let filteredDirs = directories;

    // Apply include filter (whitelist)
    if (this.options.include && this.options.include.length > 0) {
      filteredDirs = directories.filter(dirName => {
        return this.options.include!.some(pattern =>
          minimatch(dirName, pattern, { nocase: true })
        );
      });
    }

    // Apply exclude filter (blacklist)
    if (this.options.exclude && this.options.exclude.length > 0) {
      filteredDirs = filteredDirs.filter(dirName => {
        return !this.options.exclude!.some(pattern =>
          minimatch(dirName, pattern, { nocase: true })
        );
      });
    }

    return filteredDirs;
  }

  /** The record files of an entity folder, found the way push finds them, as sorted absolute paths. */
  private async getMatchingFiles(dir: string, pattern: string | undefined): Promise<string[]> {
    const files = await fastGlob(pattern || '*.json', { ...RECORD_FILE_GLOB_OPTIONS, cwd: dir });
    return files.sort();
  }

  /**
   * Add an error
   */
  private addError(error: ValidationError): void {
    this.errors.push(error);
  }

  /**
   * Add a warning
   */
  private addWarning(warning: ValidationWarning): void {
    this.warnings.push(warning);
  }

  /**
   * Check if current directory order satisfies dependencies
   */
  private checkDependencyOrder(directoryOrder: string[]): Array<{ entity: string; dependency: string; file: string }> {
    const violations: Array<{ entity: string; dependency: string; file: string }> = [];
    const processedEntities = new Set<string>();

    for (const dir of directoryOrder) {
      // In real implementation, we'd read .mj-sync.json to get entity name
      const entityName = dir; // Simplified for now

      const deps = this.entityDependencies.get(entityName);
      if (deps) {
        for (const dep of deps.dependsOn) {
          if (!processedEntities.has(dep) && directoryOrder.includes(dep)) {
            violations.push({
              entity: entityName,
              dependency: dep,
              file: deps.file,
            });
          }
        }
      }

      processedEntities.add(entityName);
    }

    return violations;
  }

  /**
   * Perform topological sort on entity dependencies
   */
  private topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const tempStack = new Set<string>();

    const visit = (entity: string): boolean => {
      if (tempStack.has(entity)) {
        // Circular dependency, already handled by checkCircularDependency
        return false;
      }

      if (visited.has(entity)) {
        return true;
      }

      tempStack.add(entity);

      const deps = this.entityDependencies.get(entity);
      if (deps) {
        for (const dep of deps.dependsOn) {
          if (!visit(dep)) {
            return false;
          }
        }
      }

      tempStack.delete(entity);
      visited.add(entity);
      result.push(entity);

      return true;
    };

    // Visit all entities
    for (const entity of this.entityDependencies.keys()) {
      if (!visited.has(entity)) {
        visit(entity);
      }
    }

    return result;
  }

  /**
   * Reset validation state
   */
  private reset(): void {
    this.errors = [];
    this.warnings = [];
    this.entityDependencies.clear();
    this.processedEntities.clear();
    this.claimedPrimaryKeys.clear();
    this.folderOverrides.clear();
    this.entityFolder = '';
    this.recordStartLines = new WeakMap<object, number>();
    this.userRoleCache.clear();
  }

  /**
   * Get validation result
   */
  private getResult(): ValidationResult {
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        totalFiles: 0,
        totalEntities: 0,
        totalErrors: this.errors.length,
        totalWarnings: this.warnings.length,
        fileResults: new Map(),
      },
    };
  }

  /**
   * Load user roles from the database into cache
   */
  private async loadUserRoles(): Promise<void> {
    try {
      const rv = new RunView();
      const systemUser = GetSystemUser();

      // Load all user roles with role names
      const result = await rv.RunView(
        {
          EntityName: 'MJ: User Roles',
          ExtraFilter: '',
          OrderBy: 'UserID',
          MaxRows: 10000,
        },
        systemUser,
      );

      if (!result.Success) {
        this.addWarning({
          type: 'validation',
          severity: 'warning',
          file: 'system',
          message: 'Failed to load user roles for validation',
          details: result.ErrorMessage,
        });
        return;
      }

      // Group roles by UserID
      for (const userRole of result.Results || []) {
        const userId = userRole.UserID;
        const roleName = userRole.Role;

        if (!this.userRoleCache.has(userId)) {
          this.userRoleCache.set(userId, []);
        }
        this.userRoleCache.get(userId)!.push(roleName);
      }

      if (this.options.verbose) {
        console.log(`Loaded roles for ${this.userRoleCache.size} users`);
      }
    } catch (error) {
      this.addWarning({
        type: 'validation',
        severity: 'warning',
        file: 'system',
        message: 'Error loading user roles for validation',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate a UserID field value against allowed roles
   */
  private async validateUserRole(userId: string, entityName: string, fieldName: string, filePath: string, config: any): Promise<void> {
    // Skip if user role validation is not enabled
    if (!config.userRoleValidation?.enabled) {
      return;
    }

    const userRoles = this.userRoleCache.get(userId);
    const allowedRoles = config.userRoleValidation.allowedRoles || [];
    const allowUsersWithoutRoles = config.userRoleValidation.allowUsersWithoutRoles || false;

    if (!userRoles || userRoles.length === 0) {
      if (!allowUsersWithoutRoles) {
        this.addError({
          type: 'validation',
          severity: 'error',
          entity: entityName,
          field: fieldName,
          file: filePath,
          message: `UserID '${userId}' does not have any assigned roles`,
          suggestion:
            allowedRoles.length > 0
              ? `User must have one of these roles: ${allowedRoles.join(', ')}`
              : 'Assign appropriate roles to this user or set allowUsersWithoutRoles: true',
        });
      }
      return;
    }

    // Check if user has at least one allowed role
    if (allowedRoles.length > 0) {
      const hasAllowedRole = userRoles.some((role) => allowedRoles.includes(role));
      if (!hasAllowedRole) {
        this.addError({
          type: 'validation',
          severity: 'error',
          entity: entityName,
          field: fieldName,
          file: filePath,
          message: `UserID '${userId}' has roles [${userRoles.join(', ')}] but none are in allowed list`,
          suggestion: `Allowed roles: ${allowedRoles.join(', ')}`,
        });
      }
    }
  }

  /**
   * Validates `{@include}` references within file content
   *
   * Recursively checks all `{@include path}` references in file content to ensure:
   * - Referenced files exist
   * - No circular references occur
   * - Include paths are valid
   * 
   * @param content - The file content to validate
   * @param filePath - Path of the file being validated
   * @param visitedPaths - Set of already visited paths for circular reference detection
   */
  private async validateIncludeReferences(content: string, filePath: string, visitedPaths: Set<string>): Promise<void> {
    // Pattern to match {@include path} references
    const includePattern = /\{@include\s+([^\}]+)\s*\}/g;
    let match: RegExpExecArray | null;
    
    while ((match = includePattern.exec(content)) !== null) {
      const [fullMatch, includePath] = match;
      const trimmedPath = includePath.trim();
      
      // Resolve the include path relative to the current file's directory
      const currentDir = path.dirname(filePath);
      const resolvedPath = path.resolve(currentDir, trimmedPath);
      
      // Check for circular reference
      if (visitedPaths.has(resolvedPath)) {
        this.addError({
          type: 'reference',
          severity: 'error',
          file: filePath,
          message: `Circular {@include} reference detected: "${trimmedPath}"`,
          details: `Path ${resolvedPath} is already being processed`,
          suggestion: 'Restructure your includes to avoid circular references',
        });
        continue;
      }
      
      // Check if the included file exists
      if (!fs.existsSync(resolvedPath)) {
        this.addError({
          type: 'reference',
          severity: 'error',
          file: filePath,
          message: `{@include} file not found: "${trimmedPath}"`,
          suggestion: `Create file at: ${resolvedPath}`,
        });
        continue;
      }
      
      // Recursively validate the included file
      try {
        const includedContent = fs.readFileSync(resolvedPath, 'utf-8');
        const newVisitedPaths = new Set(visitedPaths);
        newVisitedPaths.add(resolvedPath);
        await this.validateIncludeReferences(includedContent, resolvedPath, newVisitedPaths);
      } catch (error) {
        this.addError({
          type: 'reference',
          severity: 'error',
          file: filePath,
          message: `Failed to read {@include} file: "${trimmedPath}"`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Validates @include directives in JSON files
   */
  private async validateJsonIncludes(jsonContent: any, sourceFile: string): Promise<void> {
    // Process based on data type
    if (Array.isArray(jsonContent)) {
      for (const item of jsonContent) {
        if (typeof item === 'string' && item.startsWith(`${METADATA_KEYWORDS.INCLUDE}:`)) {
          const includePath = ExtractKeywordValue(item) as string;
          await this.validateIncludeFile(includePath.trim(), sourceFile);
        } else if (item && typeof item === 'object') {
          await this.validateJsonIncludes(item, sourceFile);
        }
      }
    } else if (jsonContent && typeof jsonContent === 'object') {
      for (const [key, value] of Object.entries(jsonContent)) {
        if (key === METADATA_KEYWORDS.INCLUDE || key.startsWith(`${METADATA_KEYWORDS.INCLUDE}.`)) {
          let includeFile: string;
          if (typeof value === 'string') {
            includeFile = value;
          } else if (value && typeof value === 'object' && 'file' in value) {
            includeFile = (value as any).file;
          } else {
            this.addError({
              type: 'reference',
              severity: 'error',
              file: sourceFile,
              message: `Invalid @include directive format for key "${key}"`,
              suggestion: 'Use either a string path or an object with a "file" property',
            });
            continue;
          }
          await this.validateIncludeFile(includeFile, sourceFile);
        } else if (value && typeof value === 'object') {
          await this.validateJsonIncludes(value, sourceFile);
        }
      }
    }
  }

  /**
   * Validates a single include file path
   */
  private async validateIncludeFile(includePath: string, sourceFile: string): Promise<void> {
    const dir = path.dirname(sourceFile);
    const resolvedPath = path.resolve(dir, includePath);
    
    if (!fs.existsSync(resolvedPath)) {
      this.addError({
        type: 'reference',
        severity: 'error',
        file: sourceFile,
        message: `@include file not found: "${includePath}"`,
        suggestion: `Create file at: ${resolvedPath}`,
      });
    }
  }

  /** Checks an `@env:` reference inside a JSON file: its syntax, and whether a required variable is set. */
  private validateNestedEnvReference(value: string, sourceFile: string, entityName: string, key: string): void {
    const reference = ParseEnvReference(value);
    if (!reference) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: key,
        file: sourceFile,
        message: `Invalid reference format: "${value}"`,
      });
      return;
    }
    if (!reference.Optional && !process.env[reference.VariableName]) {
      this.addWarning({
        type: 'validation',
        severity: 'warning',
        entity: entityName,
        field: key,
        file: sourceFile,
        message: `Environment variable "${reference.VariableName}" is not currently set`,
        suggestion: `Ensure this variable is set before running push operations`,
      });
    }
  }

  /** Reports a primary key `@env:` reference that is malformed or uses `?optional`; push needs the value to find the record. */
  private validatePrimaryKeyEnvReferences(
    primaryKey: Record<string, unknown> | undefined,
    entityName: string,
    filePath: string
  ): void {
    for (const [field, value] of Object.entries(primaryKey ?? {})) {
      if (typeof value !== 'string' || !value.startsWith(METADATA_KEYWORDS.ENV)) {
        continue;
      }
      const reference = ParseEnvReference(value);
      if (!reference) {
        this.addError({
          type: 'reference',
          severity: 'error',
          entity: entityName,
          field,
          file: filePath,
          message: `Invalid reference format: "${value}"`,
          suggestion: 'Use @env:VARIABLE',
        });
      } else if (reference.Optional) {
        this.addError({
          type: 'reference',
          severity: 'error',
          entity: entityName,
          field,
          file: filePath,
          message: `Primary key field "${field}" cannot use ?optional: ${value}`,
          suggestion: 'Remove ?optional from the primary key reference',
        });
      }
    }
  }

  /**
   * Recursively validates all @ references in a JSON structure
   */
  private async validateJsonReferences(
    obj: any,
    sourceFile: string,
    entityName: string,
    visitedFiles: Set<string>,
    parentContext?: { entity: string; field: string },
    ownerContext?: { entity: string }
  ): Promise<void> {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        await this.validateJsonReferences(item, sourceFile, entityName, visitedFiles, parentContext, ownerContext);
      }
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && this.isValidReference(value)) {
          // Process different reference types
          if (value.startsWith(METADATA_KEYWORDS.FILE)) {
            const filePath = ExtractKeywordValue(value) as string;
            // Recursively validate the file reference (with circular detection)
            await this.validateFileReference(filePath, sourceFile, path.dirname(sourceFile), entityName, key, visitedFiles);
          } else if (value.startsWith(METADATA_KEYWORDS.LOOKUP)) {
            // Parse and validate lookup reference
            const parsed = this.parseReference(value);
            if (parsed) {
              await this.validateLookupReference(parsed, sourceFile, entityName, key);
            }
          } else if (value.startsWith(METADATA_KEYWORDS.TEMPLATE)) {
            this.addTemplateError(value, entityName, key, sourceFile);
          } else if (value.startsWith(METADATA_KEYWORDS.PARENT)) {
            const parsed = this.parseReference(value);
            if (parsed) {
              this.validateParentReference(parsed.value, parentContext, sourceFile, entityName, key);
            }
          } else if (value.startsWith(METADATA_KEYWORDS.OWNER)) {
            const parsed = this.parseReference(value);
            if (parsed) {
              this.validateOwnerReference(parsed.value, ownerContext, sourceFile, entityName, key);
            }
          } else if (value.startsWith(METADATA_KEYWORDS.ROOT)) {
            const parsed = this.parseReference(value);
            if (parsed) {
              this.validateRootReference(parsed.value, parentContext, sourceFile, entityName, key);
            }
          } else if (value.startsWith(METADATA_KEYWORDS.ENV)) {
            this.validateNestedEnvReference(value, sourceFile, entityName, key);
          }
        } else if (value && typeof value === 'object') {
          // Recursively process nested objects
          await this.validateJsonReferences(value, sourceFile, entityName, visitedFiles, parentContext, ownerContext);
        }
      }
    }
  }

  /**
   * Validates an @owner: reference
   */
  private validateOwnerReference(
    ownerFieldName: string,
    ownerContext: { entity: string; record?: RecordData } | undefined,
    filePath: string,
    entityName: string,
    currentFieldName: string
  ): void {
    if (!ownerContext) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: currentFieldName,
        file: filePath,
        message: `@owner: cannot be used at root level or outside an embedded/extension/collection context`,
        suggestion: 'Use @owner: only within extension, embeds, or collections where an enclosing owner entity is present',
      });
      return;
    }

    const ownerEntityInfo = this.metadata.EntityByName(ownerContext.entity);
    if (ownerEntityInfo) {
      const ownerField = ownerEntityInfo.Fields.find(
        (f) => f.Name.toLowerCase() === ownerFieldName.toLowerCase()
      );
      if (!ownerField) {
        this.addError({
          type: 'reference',
          severity: 'error',
          entity: entityName,
          field: currentFieldName,
          file: filePath,
          message: `Field "${ownerFieldName}" does not exist on owner entity "${ownerContext.entity}"`,
          suggestion: `Verify that "${ownerContext.entity}" has a field named "${ownerFieldName}"`,
        });
      }
    }
  }

  /**
   * Finds closest matching key using Levenshtein distance
   */
  private findClosestKey(target: string, candidates: string[]): string | null {
    let closestKey: string | null = null;
    let minDistance = 3;
    const lowerTarget = target.toLowerCase();
    for (const candidate of candidates) {
      const distance = this.levenshteinDistance(lowerTarget, candidate.toLowerCase());
      if (distance < minDistance) {
        minDistance = distance;
        closestKey = candidate;
      }
    }
    return closestKey;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Validates an extension block (§4.1, §4.2, §4.5)
   */
  private async validateExtension(
    extensionData: unknown,
    parentEntityInfo: EntityInfo,
    filePath: string,
    config: EntityConfig,
    depth: number
  ): Promise<void> {
    if (!extensionData || typeof extensionData !== 'object') {
      this.addError({
        type: 'field',
        severity: 'error',
        entity: parentEntityInfo.Name,
        file: filePath,
        message: '"extension" must be an object',
      });
      return;
    }

    const extObj = extensionData as Record<string, unknown>;

    // Case 1: Shorthand form with explicit 'fields' object
    if ('fields' in extObj && typeof extObj.fields === 'object' && extObj.fields !== null) {
      let childEntityName: string | undefined;
      if (typeof extObj.entity === 'string' && extObj.entity.trim().length > 0) {
        childEntityName = extObj.entity.trim();
      } else {
        // Look up registered subtypes
        const childSubtypes = this.metadata.Entities.filter(
          (e) => UUIDsEqual(e.ParentID, parentEntityInfo.ID) || UUIDsEqual(e.ParentEntityInfo?.ID, parentEntityInfo.ID)
        );
        if (childSubtypes.length === 1) {
          childEntityName = childSubtypes[0].Name;
        } else if (childSubtypes.length === 0) {
          this.addError({
            type: 'entity',
            severity: 'error',
            entity: parentEntityInfo.Name,
            file: filePath,
            message: `Entity "${parentEntityInfo.Name}" has no registered IsA child subtypes`,
          });
          return;
        } else if (parentEntityInfo.AllowMultipleSubtypes) {
          this.addError({
            type: 'entity',
            severity: 'error',
            entity: parentEntityInfo.Name,
            file: filePath,
            message: `Entity "${parentEntityInfo.Name}" allows multiple subtypes. Shorthand extension form is ambiguous; use map form keyed by subtype entity name.`,
          });
          return;
        }
      }

      if (!childEntityName) {
        return;
      }

      const childEntityInfo = this.metadata.EntityByName(childEntityName);
      if (!childEntityInfo) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: parentEntityInfo.Name,
          file: filePath,
          message: `Extension entity "${childEntityName}" not found in metadata`,
        });
        return;
      }

      const isSubtype =
        UUIDsEqual(childEntityInfo.ParentID, parentEntityInfo.ID) ||
        UUIDsEqual(childEntityInfo.ParentEntityInfo?.ID, parentEntityInfo.ID);
      if (!isSubtype) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: parentEntityInfo.Name,
          file: filePath,
          message: `"${childEntityName}" is not an IsA subtype of "${parentEntityInfo.Name}"`,
        });
        return;
      }

      await this.validateExtensionFields(
        extObj.fields as Record<string, unknown>,
        extObj,
        parentEntityInfo,
        childEntityInfo,
        filePath,
        config,
        depth
      );
      return;
    }

    // Case 2: Map form where keys are subtype entity names (e.g. { "Event Order Lines": { fields: { ... } } })
    for (const [subKey, subVal] of Object.entries(extObj)) {
      if (subKey === '$schema' || subKey === 'sync' || subKey === '__mj_sync_notes') continue;
      const childEntityInfo = this.metadata.EntityByName(subKey);
      if (!childEntityInfo) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: parentEntityInfo.Name,
          file: filePath,
          message: `Extension subtype entity "${subKey}" not found in metadata`,
        });
        continue;
      }

      const isSubtype =
        UUIDsEqual(childEntityInfo.ParentID, parentEntityInfo.ID) ||
        UUIDsEqual(childEntityInfo.ParentEntityInfo?.ID, parentEntityInfo.ID);
      if (!isSubtype) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: parentEntityInfo.Name,
          file: filePath,
          message: `"${subKey}" is not an IsA subtype of "${parentEntityInfo.Name}"`,
        });
        continue;
      }

      if (!subVal || typeof subVal !== 'object') {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: childEntityInfo.Name,
          file: filePath,
          message: `Extension for "${subKey}" must be an object with "fields"`,
        });
        continue;
      }

      const subRecord = subVal as Record<string, unknown>;
      if ('fields' in subRecord && typeof subRecord.fields === 'object' && subRecord.fields !== null) {
        await this.validateExtensionFields(
          subRecord.fields as Record<string, unknown>,
          subRecord,
          parentEntityInfo,
          childEntityInfo,
          filePath,
          config,
          depth
        );
      }
    }
  }

  /**
   * Validates leaf fields within an extension block (§4.1, §4.5, §9)
   */
  private async validateExtensionFields(
    fields: Record<string, unknown>,
    extensionRecord: object,
    parentEntityInfo: EntityInfo,
    childEntityInfo: EntityInfo,
    filePath: string,
    config: EntityConfig,
    depth: number
  ): Promise<void> {
    for (const fieldName of Object.keys(fields)) {
      const isParentField = parentEntityInfo.Fields.some(
        (f) => f.Name.toLowerCase() === fieldName.toLowerCase()
      );
      if (isParentField) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: childEntityInfo.Name,
          field: fieldName,
          file: filePath,
          message: `Field "${fieldName}" is owned by parent entity "${parentEntityInfo.Name}". Leaf extension must only contain subtype-specific fields.`,
          suggestion: `Move "${fieldName}" to the root record fields object`,
        });
      }
    }

    this.reportTemplateValues(fields, extensionRecord, childEntityInfo.Name, filePath);
    await this.validateFields(
      fields,
      childEntityInfo,
      filePath,
      { entity: parentEntityInfo.Name, field: 'extension' },
      false,
      { entity: parentEntityInfo.Name }
    );
  }

  /**
   * Validates a collections block (§4.1, §8.1)
   */
  private async validateCollections(
    collectionsData: unknown,
    entityInfo: EntityInfo,
    filePath: string,
    config: EntityConfig,
    depth: number
  ): Promise<void> {
    if (!collectionsData || typeof collectionsData !== 'object' || Array.isArray(collectionsData)) {
      this.addError({
        type: 'field',
        severity: 'error',
        entity: entityInfo.Name,
        file: filePath,
        message: '"collections" must be an object map of collection names to record arrays',
      });
      return;
    }

    const colMap = collectionsData as Record<string, unknown>;
    for (const [colName, colItems] of Object.entries(colMap)) {
      if (!Array.isArray(colItems)) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Collection "${colName}" must be an array of records. Per-record mode wrappers (e.g. {"mode": "authoritative", "items": [...]}) are forbidden; mode is directory-level only.`,
        });
        continue;
      }

      const resolved = ResolveCollectionRelationship(entityInfo, colName) ?? (await this.resolveDeclaredCollection(entityInfo, colName));
      if (!resolved) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Collection "${colName}" is not declared on entity "${entityInfo.Name}" or has no valid relationship join field`,
        });
        continue;
      }

      const childEntityInfo = this.metadata.EntityByName(resolved.relatedEntity);
      if (!childEntityInfo) {
        this.addError({
          type: 'entity',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Collection "${colName}" refers to related entity "${resolved.relatedEntity}" which is not found in metadata`,
        });
        continue;
      }

      for (const item of colItems) {
        if (!item || typeof item !== 'object') {
          this.addError({
            type: 'field',
            severity: 'error',
            entity: childEntityInfo.Name,
            file: filePath,
            message: `Collection item in "${colName}" must be an object`,
          });
          continue;
        }

        await this.validateEntityData(
          item as RecordData,
          childEntityInfo,
          filePath,
          config,
          { entity: entityInfo.Name, field: colName },
          depth + 1,
          { entity: entityInfo.Name }
        );
      }
    }
  }

  /**
   * Resolves a collection the entity's registered class declares in code (with
   * `DeclareRelatedRecords`) rather than through relationship metadata, the way push finds it: by
   * the companion's name on an entity object.
   *
   * @returns The related entity, or `null` when the class declares no collection by that name.
   */
  private async resolveDeclaredCollection(entityInfo: EntityInfo, colName: string): Promise<{ relatedEntity: string } | null> {
    try {
      const entity = await this.metadata.GetEntityObject(entityInfo.Name, GetSystemUser());
      const target = colName.trim().toLowerCase();
      const collection = entity.Companions.find(
        (c): c is RelatedRecordCollection => c instanceof RelatedRecordCollection && c.Name.toLowerCase() === target
      );
      return collection ? { relatedEntity: collection.RelatedEntityName } : null;
    } catch {
      return null;
    }
  }

  /**
   * Validates an embeds block (§4.1)
   */
  private async validateEmbeds(
    embedsData: unknown,
    entityInfo: EntityInfo,
    filePath: string,
    config: EntityConfig,
    depth: number
  ): Promise<void> {
    if (!embedsData || typeof embedsData !== 'object' || Array.isArray(embedsData)) {
      this.addError({
        type: 'field',
        severity: 'error',
        entity: entityInfo.Name,
        file: filePath,
        message: '"embeds" must be an object map of foreign key field names to record objects',
      });
      return;
    }

    const embedsMap = embedsData as Record<string, unknown>;
    for (const [key, embedVal] of Object.entries(embedsMap)) {
      if (!embedVal || typeof embedVal !== 'object') {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Embedded record for "${key}" must be an object`,
        });
        continue;
      }

      const field = entityInfo.Fields.find(
        (f) =>
          f.Name.toLowerCase() === key.toLowerCase() ||
          (f.Name + 'ID').toLowerCase() === key.toLowerCase() ||
          (key + 'ID').toLowerCase() === f.Name.toLowerCase()
      );

      let targetEntityName = field?.RelatedEntity;
      if (!targetEntityName) {
        const direct = this.metadata.EntityByName(key);
        if (direct) targetEntityName = direct.Name;
      }

      const targetEntityInfo = targetEntityName ? this.metadata.EntityByName(targetEntityName) : null;
      if (!targetEntityInfo) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Embedded reference "${key}" does not correspond to a foreign key or relationship on entity "${entityInfo.Name}"`,
        });
        continue;
      }

      await this.validateEntityData(
        embedVal as RecordData,
        targetEntityInfo,
        filePath,
        config,
        { entity: entityInfo.Name, field: key },
        depth + 1,
        { entity: entityInfo.Name }
      );
    }
  }
}
