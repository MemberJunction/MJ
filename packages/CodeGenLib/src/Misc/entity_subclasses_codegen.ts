import { BaseEntity, EntityFieldExtendedType, EntityFieldInfo, EntityFieldValueListType, EntityInfo, Metadata, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { makeDir, sortBySequenceAndCreatedAt } from '../Misc/util';
import { logError, logStatus } from './status_logging';
import { ValidatorResult, ManageMetadataBase } from '../Database/manage-metadata';
import { mj_core_schema } from '../Config/config';
import { SQLLogging } from './sql_logging';
import { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

/**
 * Dynamically collects all own property names from BaseEntity's prototype chain
 * (excluding Object.prototype). Any entity field whose CodeName matches one of
 * these is suffixed with `_` to avoid shadowing base-class members at the
 * getter/setter level. Computed once at module load time.
 */
function getBaseEntityMemberNames(): Set<string> {
    const names = new Set<string>();
    let proto = BaseEntity.prototype;
    while (proto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            if (name !== 'constructor') {
                names.add(name);
            }
        }
        proto = Object.getPrototypeOf(proto);
    }
    return names;
}

const BASE_ENTITY_RESERVED_NAMES = getBaseEntityMemberNames();

/**
 * Returns a safe property name for a generated field getter/setter.
 * If the field's CodeName collides with a BaseEntity member, appends `_` to avoid shadowing.
 */
function SafeCodeName(field: EntityFieldInfo): string {
    const raw = field.CodeName;
    return BASE_ENTITY_RESERVED_NAMES.has(raw) ? `${raw}_` : raw;
}

/**
 * Base class for generating entity sub-classes, you can sub-class this class to modify/extend your own entity sub-class generator logic
 */
export class EntitySubClassGeneratorBase {
  /**
   * Escapes sequences in description text that would break generated code.
   * Handles JSDoc comment terminators, nested comment openers, backticks,
   * and template literal interpolation sequences.
   */
  protected static SanitizeDescription(text: string): string {
    if (text && text.length > 0){
      return text.replace(/\*\//g, '*\\/').replace(/\/\*/g, '/\\*').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    }
    else {
      return '';
    }
  }

  /**
   * Validates that a JSONTypeDefinition string contains valid TypeScript and (optionally)
   * exports the expected type name. Uses the TypeScript compiler API to parse without
   * writing any files to disk.
   *
   * @param definition - The raw TypeScript code from EntityField.JSONTypeDefinition
   * @param expectedTypeName - The JSONType name that should be defined/exported in the definition
   * @param entityName - Entity name for error messages
   * @param fieldName - Field name for error messages
   * @returns An object with `valid` boolean and optional `errors` array of diagnostic messages
   */
  protected static ValidateJSONTypeDefinition(
      definition: string,
      expectedTypeName: string,
      entityName: string,
      fieldName: string
  ): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      const prefix = `[JSONType] ${entityName}.${fieldName}`;

      // Parse the definition as a TypeScript source file
      const sourceFile = ts.createSourceFile(
          'jsontype-validation.ts',
          definition,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
      );

      // Check for syntax errors using a minimal compiler program
      const compilerHost = ts.createCompilerHost({});
      const originalGetSourceFile = compilerHost.getSourceFile;
      compilerHost.getSourceFile = (fileName: string, languageVersion: ts.ScriptTarget) => {
          if (fileName === 'jsontype-validation.ts') return sourceFile;
          return originalGetSourceFile.call(compilerHost, fileName, languageVersion);
      };

      const program = ts.createProgram(
          ['jsontype-validation.ts'],
          { noEmit: true, strict: false, skipLibCheck: true },
          compilerHost
      );

      const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
      for (const diag of syntacticDiagnostics) {
          const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
          errors.push(`${prefix}: Syntax error — ${message}`);
      }

      if (errors.length > 0) {
          return { valid: false, errors };
      }

      // Check that the expected type name is defined in the source
      const definedNames = new Set<string>();
      ts.forEachChild(sourceFile, (node) => {
          if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
              ts.isEnumDeclaration(node) || ts.isClassDeclaration(node)) {
              if (node.name) {
                  definedNames.add(node.name.text);
              }
          }
      });

      if (!definedNames.has(expectedTypeName)) {
          errors.push(
              `${prefix}: JSONType "${expectedTypeName}" is not defined in JSONTypeDefinition. ` +
              `Found: ${definedNames.size > 0 ? Array.from(definedNames).join(', ') : '(none)'}`
          );
          return { valid: false, errors };
      }

      return { valid: true, errors: [] };
  }

  /**
   *
   * @param pool
   * @param entities
   * @param directory 
   * @param skipDBUpdate - when set to true, no updates are written back to the database - which happens after code generation when newly generated code from AI has been generated, but in the case where this flag is true, we don't ever write back to the DB because the assumption is we are only emitting code to the file that was already in the DB.
   * @returns 
   */
  public async generateAllEntitySubClasses(pool: CodeGenConnection, entities: EntityInfo[], directory: string, skipDBUpdate: boolean): Promise<boolean> {
    try {
      // Entities are already sorted by name in PostProcessEntityMetadata (see providerBase.ts)
      const zodContent: string = entities.map((entity: EntityInfo) => this.GenerateSchemaAndType(entity)).join('');
      let sContent: string = "";
      for (const e of entities) {
        sContent += await this.generateEntitySubClass(pool, e, false, skipDBUpdate);
      }
      const allContent = `${this.generateEntitySubClassFileHeader()} \n ${zodContent} \n ${sContent}`;

      makeDir(directory);
      fs.writeFileSync(path.join(directory, 'entity_subclasses.ts'), allContent);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  public generateEntitySubClassFileHeader(): string {
    return `import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

    `;
  }

  /**
   *
   * @param entity
   * @param includeFileHeader
   */
  public async generateEntitySubClass(pool: CodeGenConnection, entity: EntityInfo, includeFileHeader: boolean = false, skipDBUpdate: boolean = false): Promise<string> {
    if (entity.PrimaryKeys.length === 0) {
      console.warn(`SKIPPING TYPESCRIPT GENERATION: Entity ${entity.Name} has no primary keys in metadata. If using soft primary keys, ensure metadata was refreshed after applySoftPKFKConfig().`);
      return '';
    } else {
      // Sort fields by Sequence, then by __mj_CreatedAt for consistent ordering
      const sortedFields = sortBySequenceAndCreatedAt(entity.Fields);
      const sClassName: string = `${entity.ClassName}Entity`;

      const fields: string = sortedFields.map((e) => {
        let values: string = '';
        let valueList: string = '';
        if (e.ValueListType && e.ValueListType.length > 0 && e.ValueListType.trim().toLowerCase() !== 'none') {
          // Sort by Sequence to ensure consistent ordering in comments
          const sortedValues = sortBySequenceAndCreatedAt([...e.EntityFieldValues]);
          values = sortedValues.map(
            (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + EntitySubClassGeneratorBase.SanitizeDescription(v.Description) : ''}`
          ).join('');
          valueList = `\n    * * Value List Type: ${e.ValueListType}\n    * * Possible Values ` + values;
        }
        // JSONType: when a field has JSONType metadata, we emit the standard string getter/setter
        // unchanged, plus an additional typed "Object" accessor (e.g., DefaultNavItemsObject) that
        // handles JSON.parse/stringify with caching. Interface names are entity-prefixed for safety.
        const hasJSONType = e.JSONType && e.JSONType.trim().length > 0;
        let typeString: string = TypeScriptTypeFromSQLType(e.Type) + (e.AllowsNull ? ' | null' : '');
        // Build the typed accessor info (used later for the Object suffix property)
        let jsonTypeAccessorInfo: { prefixedTypeName: string; fullTypeString: string; isArray: boolean } | null = null;
        if (hasJSONType) {
          const originalTypeName = e.JSONType.trim();
          const prefixedTypeName = `${sClassName}_${originalTypeName}`;
          const isArray = e.JSONTypeIsArray === true;
          const fullTypeString = isArray ? `Array<${prefixedTypeName}>` : prefixedTypeName;
          jsonTypeAccessorInfo = { prefixedTypeName, fullTypeString: fullTypeString + (e.AllowsNull ? ' | null' : ''), isArray };
          // typeString stays as the standard SQL-mapped type (string | null) for the base getter
        }
        if (!hasJSONType && e.ValueListTypeEnum !== EntityFieldValueListType.None && e.EntityFieldValues && e.EntityFieldValues.length > 0) {
          // construct a typeString that is a union of the possible values
          const quotes = e.NeedsQuotes ? "'" : '';
          // Sort deterministically by Sequence, CreatedAt, then Value to prevent flip-flopping across runs
          const sortedValues = sortBySequenceAndCreatedAt([...e.EntityFieldValues]);
          typeString = sortedValues.map((v) => `${quotes}${v.Value}${quotes}`).join(' | ');
          if (e.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
            // special case becuase a user can enter whatever they want
            typeString += ' | ' + TypeScriptTypeFromSQLType(e.Type);
          }
          // finally, add the null type if it allows null
          if (e.AllowsNull) {
            typeString += ' | null';
          }
        }
        const fieldDeprecatedFlag: string = e.Status === 'Deprecated' || e.Status === 'Disabled' ?
            `\n    * * @deprecated This field is deprecated and will be removed in a future version. Using it will result in console warnings.` : '';
        const fieldDisabledFlag: string = e.Status === 'Disabled' ?
            `\n    * * @disabled This field is disabled and will not be available in the application. Attempting to use it will result in exceptions being thrown` : '';

        // IS-A parent field detection: virtual fields with AllowUpdateAPI on child entities
        const isISAParentField = e.IsVirtual && e.AllowUpdateAPI && entity.IsChildType;
        const isaSourceComment = isISAParentField
            ? `\n    * * IS-A Source: Inherited from ${this.getISAFieldSourceEntity(entity, e)}`
            : '';

        const jsonTypeComment = hasJSONType && jsonTypeAccessorInfo
            ? `\n    * * JSON Type: ${jsonTypeAccessorInfo.isArray ? `Array<${jsonTypeAccessorInfo.prefixedTypeName}>` : jsonTypeAccessorInfo.prefixedTypeName}`
            : '';

        const safeName = SafeCodeName(e);
        const conflictNote = safeName !== e.CodeName
            ? `\n    * * NOTE: Property renamed to \`${safeName}\` to avoid conflict with BaseEntity.${e.CodeName}`
            : '';

        // Standard getter/setter (always uses raw string, even for JSONType fields)
        const getterBody = `return this.Get('${e.Name}');`;
        const setterBody = `this.Set('${e.Name}', value);`;

        let sRet: string = `    /**
    * * Field Name: ${e.Name}${e.DisplayName && e.DisplayName.length > 0 ? '\n    * * Display Name: ' + e.DisplayName : ''}
    * * ${fieldDeprecatedFlag}${fieldDisabledFlag}SQL Data Type: ${e.SQLFullType}${e.RelatedEntity ? '\n    * * Related Entity/Foreign Key: ' + e.RelatedEntity + ' (' + e.RelatedEntityBaseView + '.' + e.RelatedEntityFieldName + ')' : ''}${e.DefaultValue && e.DefaultValue.length > 0 ? '\n    * * Default Value: ' + e.DefaultValue : ''}${valueList}${jsonTypeComment}${e.Description && e.Description.length > 0 ? '\n    * * Description: ' + EntitySubClassGeneratorBase.SanitizeDescription(e.Description) : ''}${isaSourceComment}${conflictNote}
    */
    get ${safeName}(): ${typeString} {
        ${getterBody}
    }`;
        if (!e.ReadOnly || (e.IsPrimaryKey && !e.AutoIncrement) || isISAParentField) {
          sRet += `
    set ${safeName}(value: ${typeString}) {
        ${setterBody}
    }`;
        }

        // JSONType: emit additional typed "Object" accessor with caching
        if (hasJSONType && jsonTypeAccessorInfo) {
          const objName = `${safeName}Object`;
          const cachedField = `_${objName}_cached`;
          const lastRawField = `_${objName}_lastRaw`;
          const ft = jsonTypeAccessorInfo.fullTypeString;

          sRet += `

    private ${cachedField}: ${ft} | undefined = undefined;
    private ${lastRawField}: string | null = null;
    /**
    * Typed accessor for ${e.Name} — returns parsed JSON as ${jsonTypeAccessorInfo.isArray ? `Array<${jsonTypeAccessorInfo.prefixedTypeName}>` : jsonTypeAccessorInfo.prefixedTypeName}.
    * Uses lazy parsing with cache invalidation when the underlying raw value changes.
    */
    get ${objName}(): ${ft} {
        const raw = this.${safeName};
        if (raw !== this.${lastRawField}) {
            this.${cachedField} = raw ? JSON.parse(raw) : null;
            this.${lastRawField} = raw;
        }
        return this.${cachedField}!;
    }
    set ${objName}(value: ${ft}) {
        const raw = value ? JSON.stringify(value) : null;
        this.${safeName} = raw;
        this.${cachedField} = value;
        this.${lastRawField} = raw;
    }`;
        }

        return sRet;
      }).join('\n\n');

      const subClass: string = entity.EntityObjectSubclassName ? entity.EntityObjectSubclassName : '';
      const subClassImport: string = entity.EntityObjectSubclassImport ? entity.EntityObjectSubclassImport : '';
      const sBaseClass: string = subClass.length > 0 && subClassImport.length > 0 ? `${subClass}` : 'BaseEntity';
      const subClassImportStatement: string =
        subClass.length > 0 && subClassImport.length > 0 ? `import { ${subClass} } from '${subClassImport}';\n` : '';
      const loadFieldString: string = entity.PrimaryKeys.map((f) => `${f.CodeName}: ${f.TSType}`).join(', ');
      const loadFunction: string = `    /**
    * Loads the ${entity.Name} record from the database
    ${entity.PrimaryKeys.map((f) => `* @param ${f.CodeName}: ${f.TSType} - primary key value to load the ${entity.Name} record.`).join('\n    ')}
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ${sClassName}
    * @method
    * @override
    */
    public async Load(${loadFieldString}, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        ${entity.PrimaryKeys.map((f) => `compositeKey.KeyValuePairs.push({ FieldName: '${f.Name}', Value: ${f.CodeName} });`).join('\n        ')}
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }`;
      let deleteFunction: string = '';
      if (!entity.AllowDeleteAPI) {
        // Entity doesn't allow delete at all
        deleteFunction = `    /**
    * ${entity.Name} - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.');
    }`;
      } else if (entity.CascadeDeletes) {
        // Entity has cascading deletes, wrap in transaction
        deleteFunction = `    /**
    * ${entity.Name} - Delete method override to wrap in transaction since CascadeDeletes is true.
    * Wrapping in a transaction ensures that all cascade delete operations are handled atomically.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @returns {Promise<boolean>} - true if successful, false otherwise
    */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (Metadata.Provider.ProviderType === ProviderType.Database) { // global-provider-ok: codegen runs offline against a single provider
            // For database providers, use the transaction methods directly
            const provider = Metadata.Provider as DatabaseProviderBase; // global-provider-ok: codegen runs offline against a single provider
            
            try {
                await provider.BeginTransaction();
                const result = await super.Delete(options);
                
                if (result) {
                    await provider.CommitTransaction();
                    return true;
                } else {
                    await provider.RollbackTransaction();
                    return false;
                }
            } catch (error) {
                await provider.RollbackTransaction();
                throw error;
            }
        } else {
            // For network providers, cascading deletes are handled server-side
            return super.Delete(options);
        }
    }`;
      }

      const saveFunction: string =
        entity.AllowCreateAPI || entity.AllowUpdateAPI
          ? ''
          : `    /**
    * ${entity.Name} - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public override async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }`;

    const validateFunction: string | null = await this.LogAndGenerateValidateFunction(pool, entity, skipDBUpdate);

    const status = entity.Status.trim().toLowerCase();
    const deprecatedFlag: string = status === 'deprecated' || status === 'disabled' ? 
        `\n * @deprecated This entity is deprecated and will be removed in a future version. Using it will result in console warnings.` : '';
    const disabledFlag: string = status === 'disabled' ? 
        `\n * @disabled This entity is disabled and will not be available in the application. Attempting to use it will result in exceptions being thrown` : '';
      // Collect and deduplicate JSONTypeDefinitions for this entity.
      // These are raw TypeScript interface/type definitions (from EntityField.JSONTypeDefinition)
      // that get emitted above the entity class so the typed getters/setters can reference them.
      // A Set is used because multiple fields may share the same definition (e.g., a shared config type).
      // Each definition is validated via the TypeScript compiler API before inclusion.
      const jsonTypeDefinitions = new Set<string>();
      for (const field of sortedFields) {
          if (field.JSONTypeDefinition && field.JSONTypeDefinition.trim().length > 0) {
              const definition = field.JSONTypeDefinition.trim();
              if (field.JSONType && field.JSONType.trim().length > 0) {
                  const validation = EntitySubClassGeneratorBase.ValidateJSONTypeDefinition(
                      definition, field.JSONType.trim(), entity.Name, field.Name
                  );
                  if (!validation.valid) {
                      for (const err of validation.errors) {
                          logError(err);
                      }
                      logError(`[JSONType] Skipping JSONTypeDefinition for ${entity.Name}.${field.Name} due to validation errors. The field will use a plain string getter/setter instead.`);
                      (field as unknown as Record<string, unknown>).JSONType = null;
                      continue;
                  }
              }
              // Prefix all type names defined in this definition block with the entity class name
              // to avoid naming conflicts across entities. Uses AST to find all defined type names.
              let rewrittenDef = definition;
              const sourceFile = ts.createSourceFile('temp.ts', definition, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
              ts.forEachChild(sourceFile, (node) => {
                  if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
                       ts.isEnumDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
                      const originalName = node.name.text;
                      const prefixedName = `${sClassName}_${originalName}`;
                      rewrittenDef = rewrittenDef.replace(new RegExp('\\b' + originalName + '\\b', 'g'), prefixedName);
                  }
              });
              jsonTypeDefinitions.add(rewrittenDef);
          }
      }
      const jsonTypeBlock = jsonTypeDefinitions.size > 0
          ? '\n' + Array.from(jsonTypeDefinitions).join('\n\n') + '\n'
          : '';

      let sRet: string = `
${jsonTypeBlock}
/**
 * ${entity.Name} - strongly typed entity sub-class
 * * Schema: ${entity.SchemaName}
 * * Base Table: ${entity.BaseTable}
 * * Base View: ${entity.BaseView}${entity.Description && entity.Description.length > 0 ? '\n * * @description ' + EntitySubClassGeneratorBase.SanitizeDescription(entity.Description) : ''}
 * * Primary Key${entity.PrimaryKeys.length > 1 ? 's' : ''}: ${entity.PrimaryKeys.map((f) => f.Name).join(', ')}
 * @extends {BaseEntity}
 * @class${disabledFlag}
 * @public${deprecatedFlag}
 */
${subClassImportStatement}@RegisterClass(BaseEntity, '${entity.Name}')
export class ${sClassName} extends ${sBaseClass}<${sClassName}Type> {${loadFunction ? '\n' + loadFunction : ''}${saveFunction ? '\n\n' + saveFunction : ''}${deleteFunction ? '\n\n' + deleteFunction : ''}${validateFunction ? '\n\n' + validateFunction : ''}

${fields}
}
`;
      if (includeFileHeader) sRet = this.generateEntitySubClassFileHeader() + sRet;

      return sRet;
    }
  }

  /**
   * Finds the source parent entity for an IS-A inherited field by walking the parent chain.
   * Returns the name of the parent entity that originally defines the field (as a non-virtual column).
   */
  protected getISAFieldSourceEntity(entity: EntityInfo, field: EntityFieldInfo): string {
    for (const parent of entity.ParentChain) {
      const parentField = parent.Fields.find(
        pf => pf.Name === field.Name && !pf.IsVirtual
      );
      if (parentField) {
        return parent.Name;
      }
    }
    // Fallback: return the immediate parent entity name
    return entity.ParentEntityInfo?.Name ?? 'parent entity';
  }

  public async LogAndGenerateValidateFunction(pool: CodeGenConnection, entity: EntityInfo, skipDBUpdate: boolean): Promise<string | null> {
    // first generate the validate function
    const ret = this.GenerateValidateFunction(entity);
    if (ret && ret.code) {
      // logging the generated function means that we want to EMIT SQL that will update the EntityField table for the fields that had emitted validation functions
      // so that we have a record of what was generated
      // we need to update the database for each of the generated field validators where there was a change in the CHECK constraint for the generation results
      const md = new Metadata(); // global-provider-ok: codegen runs offline against a single provider
      const entityFieldsEntityID = md.EntityByName('MJ: Entity Fields')?.ID;
      const entitiesEntityID = md.EntityByName('MJ: Entities')?.ID;

      if (!skipDBUpdate) {
        // only do the database update stuff if we are not skipping the DB update, of course the .justGenerated flag SHOULD be false in all of the records
        // we have in the ret.validators array but this is an explicit flag to ensure we don't even bother checking
        // Build SQL through the dialect rather than hardcoding T-SQL syntax — `[brackets]` and
        // `GETUTCDATE()` are SS-only and PG's strict parser rejects both.
        const dialect = pool.Dialect;
        const qi = (n: string) => dialect.QuoteIdentifier(n);
        const lit = (v: string) => dialect.QuoteStringLiteral(v);
        const utcNow = dialect.CurrentTimestampUTC();
        const generatedCodeTbl = dialect.QuoteSchema(mj_core_schema(), 'GeneratedCode');
        const generatedCodeCatsView = dialect.QuoteSchema(mj_core_schema(), 'vwGeneratedCodeCategories');
        const validatorCodeCategoryID = `(SELECT ${qi('ID')} FROM ${generatedCodeCatsView} WHERE ${qi('Name')}=${lit('CodeGen: Validators')})`;

        let sSQL: string  = '';
        const justGenerated = ret.validators.filter((f) => f.wasGenerated);
        for (const v of justGenerated) {
          // only update the DB for the fields that were actually generated/regenerated, otherwise not needed
          const f = entity.Fields.find((f) => f.Name.trim().toLowerCase() === v.fieldName?.trim().toLowerCase());
          sSQL += `-- CHECK constraint for ${entity.Name}${f ? ': Field: ' + f.Name : ' @ Table Level'} was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function\n`
          if (v.generatedCodeId) {
            // need to update the existing record in the __mj.GeneratedCode table
            sSQL += `UPDATE ${generatedCodeTbl} SET
                        ${qi('Source')}=${lit(v.sourceCheckConstraint)},
                        ${qi('Code')}=${lit(v.functionText)},
                        ${qi('Description')}=${lit(v.functionDescription)},
                        ${qi('Name')}=${lit(v.functionName)},
                        ${qi('GeneratedAt')}=${utcNow},
                        ${qi('GeneratedByModelID')}=${lit(v.aiModelID)}
                     WHERE
                        ${qi('ID')}=${lit(v.generatedCodeId)};`
          }
          else {
            // need to create a row inside the __mj.GeneratedCode table
            const linkedEntityID = f ? entityFieldsEntityID : entitiesEntityID;
            const linkedRecordPK = f ? f.ID : entity.ID;
            sSQL += `INSERT INTO ${generatedCodeTbl} (${qi('CategoryID')}, ${qi('GeneratedByModelID')}, ${qi('GeneratedAt')}, ${qi('Language')}, ${qi('Status')}, ${qi('Source')}, ${qi('Code')}, ${qi('Description')}, ${qi('Name')}, ${qi('LinkedEntityID')}, ${qi('LinkedRecordPrimaryKey')})
                      VALUES (${validatorCodeCategoryID}, ${lit(v.aiModelID)}, ${utcNow}, ${lit('TypeScript')}, ${lit('Approved')}, ${lit(v.sourceCheckConstraint)}, ${lit(v.functionText)}, ${lit(v.functionDescription)}, ${lit(v.functionName)}, ${lit(linkedEntityID ?? '')}, ${lit(linkedRecordPK)});

            `
          }
        }

        // now Log and Execute the SQL
        try {
          await SQLLogging.LogSQLAndExecute(pool, sSQL, `Generated Validation Functions for ${entity.Name}`, false);
        }
        catch (e) {
          logError(`Error logging and executing SQL for ${entity.Name}: ${e}`);
        }
      }

      return ret.code;
    }
    else {
      return null;
    }
  }
  public GenerateValidateFunction(entity: EntityInfo): null | { code: string, validators: ValidatorResult[] } {
    // go through the ManageMetadataBase.generatedFieldValidators to see if we have anything to generate
    const unsortedValidators = ManageMetadataBase.generatedValidators.filter((f) => f.entityName.trim().toLowerCase() === entity.Name.trim().toLowerCase());
    const sortedValidators = unsortedValidators.sort((a, b) => {
      // sort by field name, then by function name, then by generatedCodeId as last-resort tiebreaker
      if (a.fieldName && b.fieldName) {
        const cmp = a.fieldName.localeCompare(b.fieldName) || a.functionName.localeCompare(b.functionName);
        if (cmp !== 0) return cmp;
      } else if (a.fieldName) {
        return -1; // a comes first
      } else if (b.fieldName) {
        return 1; // b comes first
      } else {
        const cmp = a.functionName.localeCompare(b.functionName); // both are table-level, sort by function name
        if (cmp !== 0) return cmp;
      }
      // last-resort tiebreaker for absolute determinism
      return a.generatedCodeId.localeCompare(b.generatedCodeId);
    });

    // Deduplicate by functionName — duplicate GeneratedCode records can exist if the view JOIN
    // previously failed to match (e.g., whitespace differences in CHECK constraint text).
    // Keep the first occurrence of each functionName (which is the earliest by sort order).
    const seenFunctionNames = new Set<string>();
    const validators = sortedValidators.filter((v) => {
      if (seenFunctionNames.has(v.functionName)) {
        return false;
      }
      seenFunctionNames.add(v.functionName);
      return true;
    });

    if (validators.length === 0) {
      return null;
    }
    else {
      const validationFunctions = validators.map((f) => {
        // output the function text and the function description in a JSDoc block

        // first format the function text to ensure that escaped \n, \t, and \" are replaced with actual characters
        const cleansedText = f.functionText.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
        // next up, format the function text to have proper indentation with 4 spaces preceding the start of each line
        const formattedText = cleansedText.split('\n').map((l) => `    ${l}`).join('\n');

        return `    /**
    * ${EntitySubClassGeneratorBase.SanitizeDescription(f.functionDescription)}
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
${formattedText}`
      }).join('\n\n')

      const ret = `    /**
    * Validate() method override for ${entity.Name} entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
${validators.map((f) => `    * * ${f.fieldName ? f.fieldName : 'Table-Level'}: ${EntitySubClassGeneratorBase.SanitizeDescription(f.functionDescription)}`).join('\n')}
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
${validators.map((f) => `        this.${f.functionName}(result);`).join('\n')}
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

${validationFunctions}`
      return {code: ret, validators: validators};
  }
}

  public GenerateSchemaAndType(entity: EntityInfo): string {
    let content: string = '';
    if (entity.PrimaryKeys.length === 0) {
      logStatus(`SKIPPING SCHEMA GENERATION: Entity ${entity.Name} has no primary keys in metadata. If using soft primary keys, ensure metadata was refreshed after applySoftPKFKConfig().`);
    } else {
      // Sort fields by Sequence, then by __mj_CreatedAt for consistent ordering
      const sortedFields = sortBySequenceAndCreatedAt(entity.Fields);
      
      const fields: string = sortedFields.map((e) => {
        let values: string = '';
        let valueList: string = '';
        if (e.ValueListType && e.ValueListType.length > 0 && e.ValueListType.trim().toLowerCase() !== 'none') {
          // Sort by Sequence to ensure consistent ordering in comments
          const sortedValues = sortBySequenceAndCreatedAt([...e.EntityFieldValues]);
          values = sortedValues.map(
            (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`
          ).join('');
          valueList = `\n    * * Value List Type: ${e.ValueListType}\n    * * Possible Values ` + values;
        }
        // JSONType fields use z.any() in the Zod schema since the actual validation is
        // handled by the TypeScript interface (full Zod schema generation is a future phase).
        const hasJSONType = e.JSONType && e.JSONType.trim().length > 0;
        let typeString: string = `${TypeScriptTypeFromSQLType(e.Type).toLowerCase()}()` + (e.AllowsNull ? '.nullable()' : '');
        if (hasJSONType) {
          typeString = `any()${e.AllowsNull ? '.nullable()' : ''}`;
        } else if (e.ValueListTypeEnum !== EntityFieldValueListType.None && e.EntityFieldValues && e.EntityFieldValues.length > 0) {
          // construct a typeString that is a union of the possible values
          const quotes = e.NeedsQuotes ? "'" : '';
          // Sort deterministically by Sequence, CreatedAt, then Value to prevent flip-flopping across runs
          const sortedValues = sortBySequenceAndCreatedAt([...e.EntityFieldValues]);
          // z.union() requires at least 2 members. When there's only one allowed
          // value (single-value CHECK constraint), emit z.literal() directly.
          const literals = sortedValues.map((v) => `z.literal(${quotes}${v.Value}${quotes})`);
          typeString = literals.length === 1
            ? literals[0].substring(2) // strip leading 'z.' since caller prepends it
            : `union([${literals.join(', ')}])`;
          if (e.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
            // special case becuase a user can enter whatever they want
            typeString += `.or(z.${TypeScriptTypeFromSQLType(e.Type)}()) `;
          }

          // finally, add the null type if it allows null
          if (e.AllowsNull) {
            typeString += '.nullable()';
          }
        }
        let sRet: string = `    ${SafeCodeName(e)}: z.${typeString}.describe(\`\n${this.GenerateZodDescription(e, entity)}\`),`;
        return sRet;
      }).join('\n');

      const schemaName: string = `${entity.ClassName}Schema`;
      content = `
/**
 * zod schema definition for the entity ${entity.Name}
 */
export const ${schemaName} = z.object({
${fields}
});

export type ${entity.ClassName}EntityType = z.infer<typeof ${schemaName}>;
`;
    }

    return content;
  }

  /**
   * Generates the description string for a Zod schema field, including field metadata,
   * value list documentation, and JSONType annotations with entity-prefixed type names.
   * @param entityField - The entity field to generate a description for
   * @param entity - Optional entity context, used to compute the entity-prefixed JSONType name
   * @returns A formatted description string for the Zod `.describe()` call
   */
  public GenerateZodDescription(entityField: EntityFieldInfo, entity?: EntityInfo): string {
    let result: string = '';

    let valueList: string = '';
    if (entityField.ValueListType && entityField.ValueListType.length > 0 && entityField.ValueListType.trim().toLowerCase() !== 'none') {
      // Sort by Sequence to ensure consistent ordering in comments
      const sortedValues = sortBySequenceAndCreatedAt([...entityField.EntityFieldValues]);
      let values = sortedValues.map(
        (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + EntitySubClassGeneratorBase.SanitizeDescription(v.Description) : ''}`
      ).join('');
      valueList = `\n    * * Value List Type: ${entityField.ValueListType}\n    * * Possible Values ` + values;
    }

    result += `        * * Field Name: ${entityField.Name}${entityField.DisplayName && entityField.DisplayName.length > 0 ? '\n        * * Display Name: ' + entityField.DisplayName : ''}\n`;
    let jsonTypeAnnotation = '';
    if (entityField.JSONType && entityField.JSONType.trim().length > 0) {
        const prefix = entity ? `${entity.ClassName}Entity_` : '';
        const prefixedName = `${prefix}${entityField.JSONType.trim()}`;
        jsonTypeAnnotation = entityField.JSONTypeIsArray
            ? `\n        * * JSON Type: Array<${prefixedName}>`
            : `\n        * * JSON Type: ${prefixedName}`;
    }
    result += `        * * SQL Data Type: ${entityField.SQLFullType}${entityField.RelatedEntity ? '\n        * * Related Entity/Foreign Key: ' + entityField.RelatedEntity + ' (' + entityField.RelatedEntityBaseView + '.' + entityField.RelatedEntityFieldName + ')' : ''}${entityField.DefaultValue && entityField.DefaultValue.length > 0 ? '\n        * * Default Value: ' + entityField.DefaultValue : ''}${jsonTypeAnnotation}${valueList}${entityField.Description && entityField.Description.length > 0 ? '\n        * * Description: ' + EntitySubClassGeneratorBase.SanitizeDescription(entityField.Description) : ''}`;
    return result;
  }

}
