import { EntityFieldInfo, EntityInfo, EntityRelationshipInfo, Metadata, RunView } from '@memberjunction/core';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
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
import { getSystemUser } from '../lib/provider-utils';
import { parseMetadataReference } from '../lib/reference-parser';
import {
  METADATA_KEYWORDS,
  isMetadataKeyword,
  extractKeywordValue
} from '../constants/metadata-keywords';
import { EntityConfig } from '../config';
import { resolveCollectionRelationship } from '../lib/collection-resolver';

// Type aliases for clarity
type EntityData = RecordData;
type EntitySyncConfig = EntityConfig;

export class ValidationService {
  private metadata: Metadata;
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private entityDependencies: Map<string, EntityDependency> = new Map();
  private processedEntities: Set<string> = new Set();
  private claimedPrimaryKeys: Map<string, string> = new Map();
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
  public async validateDirectory(dir: string): Promise<ValidationResult> {
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

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Load user role configuration and cache if enabled
    if (config.userRoleValidation?.enabled) {
      await this.loadUserRoles();
    }

    const directories = await this.getDirectoriesInOrder(dir, config);

    let totalFiles = 0;
    let totalEntities = 0;
    const fileResults = new Map<string, FileValidationResult>();

    for (const subDir of directories) {
      const subDirPath = path.join(dir, subDir);
      const result = await this.validateEntityDirectory(subDirPath);
      if (result) {
        totalFiles += result.files;
        totalEntities += result.entities;
        for (const [file, fileResult] of result.fileResults) {
          fileResults.set(file, fileResult);
        }
      }
    }

    // Validate dependency order
    await this.validateDependencyOrder(directories);

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

  /**
   * Validates a single entity directory
   */
  private async validateEntityDirectory(dir: string): Promise<{ files: number; entities: number; fileResults: Map<string, FileValidationResult> } | null> {
    // Check for .mj-folder.json first (new format)
    let configPath = path.join(dir, '.mj-folder.json');
    let config: any;
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // .mj-folder.json uses entityName field
      if (!config.entityName) {
        this.addError({
          type: 'validation',
          severity: 'error',
          file: configPath,
          message: 'Missing entityName field in .mj-folder.json',
        });
        return null;
      }
      config.entity = config.entityName; // Normalize to entity field
    } else {
      // Fall back to .mj-sync.json (legacy format)
      configPath = path.join(dir, '.mj-sync.json');
      if (!fs.existsSync(configPath)) {
        return null;
      }
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

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

    const entityInfo = this.metadata.EntityByName(config.entity);

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

    const files = await this.getMatchingFiles(dir, config.filePattern);
    let totalEntities = 0;
    const fileResults = new Map<string, FileValidationResult>();

    for (const file of files) {
      const result = await this.validateFile(file, entityInfo, config);
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
    const fileErrors: ValidationError[] = [];
    let entityCount = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const entities = Array.isArray(data) ? data : [data];
      entityCount = entities.length;

      for (const entityData of entities) {
        await this.validateEntityData(entityData, entityInfo, filePath, config);
      }
    } catch (error) {
      fileErrors.push({
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

    // Check for double ownership across metadata files (§6)
    if (entityData.primaryKey && Object.keys(entityData.primaryKey).length > 0) {
      const claimKey = `${entityInfo.Name}:${JSON.stringify(entityData.primaryKey)}`;
      const existingFile = this.claimedPrimaryKeys.get(claimKey);
      if (existingFile && existingFile !== filePath) {
        this.addError({
          type: 'field',
          severity: 'error',
          entity: entityInfo.Name,
          file: filePath,
          message: `Record with primaryKey ${JSON.stringify(entityData.primaryKey)} on entity "${entityInfo.Name}" is already claimed by "${existingFile}". Double ownership is not allowed.`,
          suggestion: 'Ensure records are owned by only one sync file or collection',
        });
      } else {
        this.claimedPrimaryKeys.set(claimKey, filePath);
      }
    }

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
          relatedEntityInfo.ParentID === entityInfo.ID ||
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
    const fieldMap = new Map(entityFields.map((f) => [f.Name, f]));

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const fieldInfo = fieldMap.get(fieldName);

      if (!fieldInfo) {
        // Check if this might be a virtual property (getter/setter)
        try {
          const entityInstance = await this.metadata.GetEntityObject(entityInfo.Name, getSystemUser());
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

      // Check if field is settable (not system field)
      if (fieldInfo.ReadOnly || fieldName.startsWith('__mj_')) {
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
      for (const field of entityFields) {
        // Skip if field allows null or has a value already (use 'in' to handle falsy values like 0, false, "")
        if (field.AllowsNull || field.Name in fields) {
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

  /**
   * Check if a string is actually a MetadataSync reference (not just any @ string)
   */
  private isValidReference(value: string): boolean {
    return isMetadataKeyword(value);
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
        await this.validateFileReference(parsed.value, filePath, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.LOOKUP:
        await this.validateLookupReference(parsed, filePath, entityInfo.Name, fieldInfo.Name);
        break;
      case METADATA_KEYWORDS.TEMPLATE:
        await this.validateTemplateReference(parsed.value, filePath, entityInfo.Name, fieldInfo.Name);
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
    return parseMetadataReference(reference);
  }

  /**
   * Validates @file: references
   */
  private async validateFileReference(filePath: string, sourceFile: string, entityName: string, fieldName: string, visitedFiles?: Set<string>): Promise<void> {
    const dir = path.dirname(sourceFile);
    const resolvedPath = path.resolve(dir, filePath);

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
   * Validates @template: references
   */
  private async validateTemplateReference(templatePath: string, sourceFile: string, entityName: string, fieldName: string): Promise<void> {
    const dir = path.dirname(sourceFile);
    const resolvedPath = path.resolve(dir, templatePath);

    if (!fs.existsSync(resolvedPath)) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `Template file not found: "${templatePath}"`,
        suggestion: `Create template at: ${resolvedPath}`,
      });
      return;
    }

    // Validate template is valid JSON
    try {
      JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch (error) {
      this.addError({
        type: 'reference',
        severity: 'error',
        entity: entityName,
        field: fieldName,
        file: sourceFile,
        message: `Template file is not valid JSON: "${templatePath}"`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
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
  private async getDirectoriesInOrder(rootDir: string, config: any): Promise<string[]> {
    const allDirs = fs
      .readdirSync(rootDir)
      .filter((f) => fs.statSync(path.join(rootDir, f)).isDirectory())
      .filter((d) => !d.startsWith('.'));

    let orderedDirs: string[];
    if (config.directoryOrder && Array.isArray(config.directoryOrder)) {
      const ordered = config.directoryOrder.filter((d: string) => allDirs.includes(d));
      const remaining = allDirs.filter((d) => !ordered.includes(d)).sort();
      orderedDirs = [...ordered, ...remaining];
    } else {
      orderedDirs = allDirs.sort();
    }

    // Apply include/exclude filters if specified
    return this.applyDirectoryFilters(orderedDirs);
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

  /**
   * Get files matching pattern
   */
  private async getMatchingFiles(dir: string, pattern: string): Promise<string[]> {
    const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());

    // Strip leading **/ from glob patterns (we only match in current directory)
    const normalizedPattern = pattern.replace(/^\*\*\//, '');

    // Simple glob pattern matching
    if (normalizedPattern === '*.json') {
      return files.filter((f) => f.endsWith('.json') && !f.startsWith('.mj-'));
    } else if (normalizedPattern === '.*.json') {
      return files.filter((f) => f.startsWith('.') && f.endsWith('.json') && !f.startsWith('.mj-'));
    }

    return files;
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
      const systemUser = getSystemUser();

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
          const includePath = extractKeywordValue(item) as string;
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
            const filePath = extractKeywordValue(value) as string;
            // Recursively validate the file reference (with circular detection)
            await this.validateFileReference(filePath, sourceFile, entityName, key, visitedFiles);
          } else if (value.startsWith(METADATA_KEYWORDS.LOOKUP)) {
            // Parse and validate lookup reference
            const parsed = this.parseReference(value);
            if (parsed) {
              await this.validateLookupReference(parsed, sourceFile, entityName, key);
            }
          } else if (value.startsWith(METADATA_KEYWORDS.TEMPLATE)) {
            const templatePath = extractKeywordValue(value) as string;
            await this.validateTemplateReference(templatePath, sourceFile, entityName, key);
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
            const envVar = extractKeywordValue(value) as string;
            if (!process.env[envVar]) {
              this.addWarning({
                type: 'validation',
                severity: 'warning',
                entity: entityName,
                field: key,
                file: sourceFile,
                message: `Environment variable "${envVar}" is not currently set`,
                suggestion: `Ensure this variable is set before running push operations`,
              });
            }
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
          (e) => e.ParentID === parentEntityInfo.ID || e.ParentEntityInfo?.ID === parentEntityInfo.ID
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
        childEntityInfo.ParentID === parentEntityInfo.ID ||
        childEntityInfo.ParentEntityInfo?.ID === parentEntityInfo.ID;
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
        childEntityInfo.ParentID === parentEntityInfo.ID ||
        childEntityInfo.ParentEntityInfo?.ID === parentEntityInfo.ID;
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

      const resolved = resolveCollectionRelationship(entityInfo, colName);
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
