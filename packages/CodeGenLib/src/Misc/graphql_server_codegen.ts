import { EntityInfo, EntityFieldInfo, TypeScriptTypeFromSQLType, TypeScriptTypeFromSQLTypeWithNullableOption, getGraphQLTypeNameBase } from '@memberjunction/core';
import {
    IsBinarySQLType,
    IsBooleanSQLType,
    IsCurrencySQLType,
    IsDateSQLType,
    IsFloatSQLType,
    IsStringSQLType,
    IsUuidSQLType,
} from '@memberjunction/sql-dialect';
import fs from 'fs';
import path from 'path';
import { logError, logStatus } from './status_logging';
import { configInfo, mjCoreSchema, resolveEntityPackageName } from '../Config/config';
import { makeDir, sortBySequenceAndCreatedAt } from './util';
import { writeFileIfChanged } from './file-write';
import { EmitStats } from './emit-stats';
import {
  SchemaEmitOptions,
  buildSchemaBarrel,
  groupEntitiesBySchema,
  pruneOrphanedSchemaFiles,
  sanitizeSchemaFileName,
  schemasToEmit,
} from './schema-emit';


/**
 * This class is responsible for generating the GraphQL Server resolvers and types for the entities, you can sub-class this class to extend/modify the logic, make sure to use @memberjunction/global RegisterClass decorator
 * so that your class is used.
 */
export class GraphQLServerGeneratorBase {
  public generateGraphQLServerCode(
    entities: EntityInfo[],
    outputDirectory: string,
    generatedEntitiesImportLibrary: string,
    excludeRelatedEntitiesExternalToSchema: boolean,
    options?: SchemaEmitOptions,
  ): boolean {
    try {
      const emit = this.resolveEmitOptions(options);
      makeDir(outputDirectory);

      if (!emit.perSchema) {
        const content = this.assembleGraphQLServerFile(
          entities,
          generatedEntitiesImportLibrary,
          excludeRelatedEntitiesExternalToSchema,
        );
        this.emitFile(path.join(outputDirectory, 'generated.ts'), content, emit.writeIfChanged);
        return true;
      }

      const grouped = groupEntitiesBySchema(entities);
      const schemas = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
      const schemasDir = path.join(outputDirectory, 'graphql-schemas');
      makeDir(schemasDir);

      const toEmit = schemasToEmit(schemas, emit.dirtySchemas, (schemaName) =>
        fs.existsSync(path.join(schemasDir, `${sanitizeSchemaFileName(schemaName)}.ts`)),
      );
      const emitSet = new Set(toEmit);
      for (const schemaName of schemas) {
        EmitStats.RecordSchemaEmit(emitSet.has(schemaName));
      }

      const assembleStarted = Date.now();
      for (const schemaName of toEmit) {
        const schemaEntities = grouped.get(schemaName) ?? [];
        const content = this.assembleGraphQLServerFile(
          schemaEntities,
          generatedEntitiesImportLibrary,
          excludeRelatedEntitiesExternalToSchema,
          true,
        );
        this.emitFile(
          path.join(schemasDir, `${sanitizeSchemaFileName(schemaName)}.ts`),
          content,
          emit.writeIfChanged,
        );
      }
      EmitStats.AddAssembleMs(Date.now() - assembleStarted);

      // Before the barrel, so the directory and the barrel always agree.
      const pruned = pruneOrphanedSchemaFiles(schemasDir, schemas);
      if (pruned.length > 0) {
        logStatus(`   Removed ${pruned.length} orphaned GraphQL schema file(s): ${pruned.join(', ')}`);
      }

      const barrel = buildSchemaBarrel(
        schemas,
        'graphql-schemas',
        `/********************************************************************************
* GraphQL server barrel — AUTO GENERATED. Do not edit.
* Re-exports one file per schema.
*
**********************************************************************************/
`,
      );
      this.emitFile(path.join(outputDirectory, 'generated.ts'), barrel, emit.writeIfChanged);
      return true;
    } catch (err) {
      logError(err as string);
      return false;
    }
  }

  /**
   * Build one GraphQL server file — a single schema, or the legacy monolith when
   * per-schema emit is turned off.
   */
  public assembleGraphQLServerFile(
    entities: EntityInfo[],
    generatedEntitiesImportLibrary: string,
    excludeRelatedEntitiesExternalToSchema: boolean,
    fromSchemaSubdir: boolean = false,
  ): string {
    const isInternal = generatedEntitiesImportLibrary.trim().toLowerCase().startsWith('@memberjunction/');
    let sRet = this.generateAllEntitiesServerFileHeader(entities, generatedEntitiesImportLibrary, isInternal, fromSchemaSubdir);
    for (const entity of entities) {
      sRet += this.generateServerEntityString(
        entity,
        false,
        generatedEntitiesImportLibrary,
        excludeRelatedEntitiesExternalToSchema,
      );
    }
    return sRet;
  }

  protected resolveEmitOptions(options?: SchemaEmitOptions): Required<SchemaEmitOptions> {
    const defaults = configInfo?.fileEmit;
    return {
      perSchema: options?.perSchema ?? defaults?.perSchema ?? true,
      dirtySchemas: options?.dirtySchemas ?? 'all',
      parallel: options?.parallel ?? defaults?.parallel ?? true,
      concurrency: options?.concurrency ?? defaults?.concurrency ?? 8,
      writeIfChanged: options?.writeIfChanged ?? defaults?.writeIfChanged ?? true,
    };
  }

  protected emitFile(filePath: string, content: string, useWriteIfChanged: boolean): void {
    if (useWriteIfChanged) {
      writeFileIfChanged(filePath, content);
      return;
    }
    makeDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
  }

  protected _graphQLTypeSuffix = '_';
  /**
   * The suffix to append to the GraphQL Type name, default is an underscore, override this property in your sub-class to change the suffix
   */
  public get GraphQLTypeSuffix(): string {
    return this._graphQLTypeSuffix;
  }

  /**
   * Generates the base GraphQL type name for an entity using SchemaBaseTable pattern.
   * Preserves original capitalization. Special case: MJ core schema uses "MJ" prefix.
   * This ensures unique type names across different schemas.
   * @param entity - The entity to generate the type name for
   * @returns The base GraphQL type name (without suffix)
   */
  protected getServerGraphQLTypeNameBase(entity: EntityInfo): string {
    return getGraphQLTypeNameBase(entity);
  }

  /**
   * Generates the full server GraphQL type name for an entity (with suffix).
   * @param entity - The entity to generate the type name for
   * @returns The full GraphQL type name (with suffix)
   */
  protected getServerGraphQLTypeName(entity: EntityInfo): string {
    return this.getServerGraphQLTypeNameBase(entity) + this.GraphQLTypeSuffix;
  }

  public generateServerEntityString(
    entity: EntityInfo,
    includeFileHeader: boolean,
    generatedEntitiesImportLibrary: string,
    _excludeRelatedEntitiesExternalToSchema: boolean
  ): string {
    const isInternal = generatedEntitiesImportLibrary.trim().toLowerCase() === '@memberjunction/core-entities';
    let sEntityOutput: string = '';
    try {
      const fields: EntityFieldInfo[] = sortBySequenceAndCreatedAt(entity.Fields);
      const serverGraphQLTypeName: string = this.getServerGraphQLTypeName(entity);

      if (includeFileHeader) {
        const resolvedLib = isInternal
          ? generatedEntitiesImportLibrary
          : resolveEntityPackageName(entity.SchemaName);
        sEntityOutput = this.generateEntitySpecificServerFileHeader(entity, resolvedLib);
      }

      sEntityOutput += this.generateServerEntityHeader(entity, serverGraphQLTypeName);

      // now generate the fields by looping through the fields collection from the database
      for (let j: number = 0; j < fields.length; ++j) {
        sEntityOutput += this.generateServerField(fields[j]);
      }

      // Child-array GraphQL fields (`Foo_BarIDArray`) are deliberately not emitted.
      // They resolved with per-parent `SELECT *` (N+1). Load children via RunView
      // or DeclareRelatedRecords; mutation responses that already have the graph
      // should put children on a hand-written result type.

      // finally, close it up with the footer
      sEntityOutput += this.generateServerEntityFooter(entity);

      sEntityOutput += this.generateServerGraphQLResolver(entity, serverGraphQLTypeName);
    } catch (err) {
      logError(err as string);
    } finally {
      return sEntityOutput;
    }
  }

  public generateAllEntitiesServerFileHeader(entities: EntityInfo[], importLibrary: string, isInternal: boolean, fromSchemaSubdir: boolean = false): string {
    let sRet: string = `/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
${
  isInternal
    ? `import { mj_core_schema } from '${fromSchemaSubdir ? '../../config.js' : '../config.js'}';\n`
    : `import * as mj_core_schema_server_object_types from '@memberjunction/server'`
}


${this.generateEntityImports(entities, importLibrary, isInternal)}
    `;
    return sRet;
  }

  /**
   * Generates import statements for entity classes, grouping by package when
   * entityPackageName is a schema-to-package map.
   */
  protected generateEntityImports(entities: EntityInfo[], defaultLibrary: string, isInternal: boolean): string {
    if (entities.length === 0) return 'export {}';

    if (isInternal) {
      // Core entities always import from the single library
      return `import { ${entities.map((e) => `${e.ClassName}Entity`).join(', ')} } from '${defaultLibrary}';`;
    }

    // Group entities by their resolved package
    const packageGroups = new Map<string, string[]>();
    for (const entity of entities) {
      const pkg = resolveEntityPackageName(entity.SchemaName);
      const existing = packageGroups.get(pkg) ?? [];
      existing.push(`${entity.ClassName}Entity`);
      packageGroups.set(pkg, existing);
    }

    // Generate one import line per package
    const imports: string[] = [];
    for (const [pkg, classNames] of packageGroups) {
      imports.push(`import { ${classNames.join(', ')} } from '${pkg}';`);
    }
    return imports.join('\n');
  }

  public generateEntitySpecificServerFileHeader(
    entity: EntityInfo,
    importLibrary: string
  ): string {
    let sRet: string = `/********************************************************************************
* ${entity.Name} TypeGraphQL Type Class Definition - AUTO GENERATED FILE
*
* GENERATED: ${new Date().toLocaleString()}
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { MaxLength } from 'class-validator';
import { Field, ${entity._floatCount > 0 ? 'Float, ' : ''}Int, ObjectType, GetReadOnlyProvider, GetReadWriteProvider } from '@memberjunction/server';
import { ${`${entity.ClassName}Entity`} } from '${importLibrary}';
    `;
    // Sibling imports for related GraphQL types used to exist so reverse-relationship
    // `@Field(() => [Related_])` members could resolve. Those members are no longer
    // emitted, so the imports would be unused.
    return sRet;
  }

  protected generateServerEntityHeader(entity: EntityInfo, serverGraphQLTypeName: string): string {
    let sDescription: string = entity.Description?.trim().length > 0 ? entity.Description : '';
    if (sDescription.includes("'")) sDescription = sDescription.replace(/'/g, "\\'");

    return `

//****************************************************************************
// ENTITY CLASS for ${entity.Name}
//****************************************************************************
@ObjectType(${sDescription.length > 0 ? `{ description: \`${sDescription.replace(/`/g, "\\`")}\` }` : ''})
export class ${serverGraphQLTypeName} {`;
  }

  protected generateServerEntityFooter(entity: EntityInfo): string {
    if (!entity) logError('entity parameter must be passed in to generateServerEntityFooter()');

    return `\n}`;
  }

  protected generateServerField(fieldInfo: EntityFieldInfo): string {
    const fieldString: string = this.getTypeGraphQLFieldString(fieldInfo);
    // use a special codename for graphql because if we start with __mj we will replace with _mj_ as we can't start with __ it has meaning in graphql
    const codeName: string = fieldInfo.CodeName.startsWith('__mj') ? '_mj_' + fieldInfo.CodeName.substring(4) : fieldInfo.CodeName;
    let fieldOptions: string = '';
    if (fieldInfo.AllowsNull) fieldOptions += 'nullable: true';
    if (fieldInfo.Description !== null && fieldInfo.Description.trim().length > 0)
      fieldOptions += (fieldOptions.length > 0 ? ', ' : '') + `description: \`${fieldInfo.Description.replace(/`/g, "\\`")}\``;

    return `
    @Field(${fieldString}${fieldOptions.length > 0 ? (fieldString == '' ? '' : ', ') + `{${fieldOptions}}` : ''}) ${fieldInfo.MaxLength > 0 && fieldString == '' /*string*/ ? '\n    @MaxLength(' + fieldInfo.MaxLength + ')' : ''}
    ${codeName}${fieldInfo.AllowsNull ? '?' : ''}: ${TypeScriptTypeFromSQLType(fieldInfo.Type)};
        `;
  }

  /**
   * Maps a column's SQL type to the TypeGraphQL `@Field(...)` type-fn argument.
   *
   * Categories that emit an empty string fall through to TypeGraphQL's
   * automatic inference based on the field's TypeScript type — appropriate
   * for string, Date, and binary-as-string columns. Boolean / Float require
   * an explicit type fn, and anything else defaults to Int.
   *
   * The category checks come from `@memberjunction/sql-dialect` so that the
   * list of recognized type names lives in exactly one place per category.
   */
  protected getTypeGraphQLFieldString(fieldInfo: EntityFieldInfo): string {
    const t = fieldInfo.Type;

    // String-shaped (text, varchar, char-family, citext, uuid, bytea-as-string,
    // and SQL Server's `rowversion`/`timestamp` which are 8-byte binary surfaced
    // as base64 string at the GraphQL layer) — TypeGraphQL infers String from TS.
    if (IsStringSQLType(t) || IsUuidSQLType(t) || IsBinarySQLType(t)) return '';

    // Date / time — TypeGraphQL infers Date from the TS type.
    if (IsDateSQLType(t)) return '';

    if (IsBooleanSQLType(t)) return '() => Boolean';

    if (IsFloatSQLType(t) || IsCurrencySQLType(t)) {
      fieldInfo.IsFloat = true; // calling functions use this to decide whether to import Float
      return '() => Float';
    }

    return '() => Int';
  }

  protected generateServerGraphQLResolver(
    entity: EntityInfo,
    serverGraphQLTypeName: string
  ): string {
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    let sRet = '';

    // we only generate resolvers for entities that have a primary key field
    if (entity.PrimaryKeys.length > 0) {
      // first add in the base resolver query to lookup by ID for all entities
      const auditAccessCode: string = entity.AuditRecordAccess
        ? `
        this.createRecordAccessAuditLogRecord(provider, userPayload, '${entity.Name}', ${entity.FirstPrimaryKey.Name})`
        : '';

      sRet = `
//****************************************************************************
// RESOLVER for ${entity.Name}
//****************************************************************************
@ObjectType()
export class Run${typeNameBase}ViewResult {
    @Field(() => [${serverGraphQLTypeName}])
    Results: ${serverGraphQLTypeName}[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(${serverGraphQLTypeName})
export class ${typeNameBase}Resolver${entity.CustomResolverAPI ? 'Base' : ''} extends ResolverBase {
    @Query(() => Run${typeNameBase}ViewResult)
    async Run${typeNameBase}ViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Run${typeNameBase}ViewResult)
    async Run${typeNameBase}ViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Run${typeNameBase}ViewResult)
    async Run${typeNameBase}DynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = '${entity.Name}';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }`;
      let graphQLPKEYArgs = '';
      let whereClause = '';
      const pkParamNames: string[] = [];
      for (let i = 0; i < entity.PrimaryKeys.length; i++) {
        const pk = entity.PrimaryKeys[i];
        graphQLPKEYArgs += graphQLPKEYArgs.length > 0 ? ', ' : '';
        // GraphQL forbids arg/field names starting with '__' (reserved for introspection). A PK whose DB
        // column starts with '__mj' — e.g. the materialization surrogate '__mj_MaterializedRowID' (the first
        // and only '__'-prefixed primary key in the system) — must have its GraphQL ARG name sanitized the
        // same way field names are (see the '_mj_' + substring(4) rule for field CodeNames above); otherwise
        // buildSchemaSync throws "Name ... must not begin with __" and the ENTIRE API fails to boot. The TS
        // parameter name, WHERE clause, bound value, and composite key all keep pk.CodeName (the real column).
        const pkGraphQLArgName = pk.CodeName.startsWith('__mj') ? '_mj_' + pk.CodeName.substring(4) : pk.CodeName;
        graphQLPKEYArgs += `@Arg('${pkGraphQLArgName}', () => ${pk.GraphQLType}) `;
        graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        whereClause += whereClause.length > 0 ? ' AND ' : '';
        whereClause += `\${provider.QuoteIdentifier('${pk.CodeName}')}=\${provider.BuildParameterPlaceholder(${i})}`;
        pkParamNames.push(pk.CodeName);
      }
      const pkParamsList = pkParamNames.join(', ');
      // CompositeKey.Validate() matches FieldName against entity.Fields…Name (the DB field name), so the
      // key MUST use pk.Name — not pk.CodeName, which diverges for PKs whose DB name needs sanitizing
      // (spaces, leading digit, reserved word). The bound value still comes from the CodeName arg variable.
      const pkCompositeKeyPairs = entity.PrimaryKeys.map((pk) => `{ FieldName: '${pk.Name}', Value: ${pk.CodeName} }`).join(', ');

      if (entity.ExternalDataSourceID) {
        // External-data-source entities have no MJ base view to query — proxy the single-record
        // load through a BaseEntity object, which the provider dispatches to the external read
        // router (same path as the grid's RunView). RLS + field post-processing are applied there.
        sRet += `
    @Query(() => ${serverGraphQLTypeName}, { nullable: true })
    async ${typeNameBase}(${graphQLPKEYArgs}, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });${auditAccessCode}
        const compositeKey = new CompositeKey([${pkCompositeKeyPairs}]);
        return this.LoadExternalRecordByKey<${serverGraphQLTypeName}>('${entity.Name}', compositeKey, provider, userPayload);
    }
    `;
      } else {
        sRet += `
    @Query(() => ${serverGraphQLTypeName}, { nullable: true })
    async ${typeNameBase}(${graphQLPKEYArgs}, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM \${provider.QuoteSchemaAndView(${this.schemaNameExpression(entity)}, '${entity.BaseView}')} WHERE ${whereClause} \` + this.getRowLevelSecurityWhereClause(provider, '${entity.Name}', userPayload, EntityPermissionType.Read, 'AND');${auditAccessCode}
        const rows = await provider.ExecuteSQL(sSQL, [${pkParamsList}], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('${entity.Name}', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    `;
      }
      if (entity.AllowAllRowsAPI) {
        if (entity.ExternalDataSourceID) {
          // External-data-source entities have no MJ base view, so `SELECT * FROM <baseView>` cannot run.
          // The equivalent "all rows" capability is available via Run${typeNameBase}DynamicView (the same
          // provider→external-read-router path the grid uses), so we skip the redundant All query here
          // rather than emit a resolver that would fail at runtime.
          sRet += `\n    // All${entity.CodeName}() intentionally not generated: external-data-source entity has no base view. Use Run${typeNameBase}DynamicView to retrieve external rows.\n`;
        } else {
          // this entity allows a query to return all rows, so include that type of query next
          sRet += `
    @Query(() => [${serverGraphQLTypeName}])
    async All${entity.CodeName}(@Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM \${provider.QuoteSchemaAndView(${this.schemaNameExpression(entity)}, '${entity.BaseView}')}\` + this.getRowLevelSecurityWhereClause(provider, '${entity.Name}', userPayload, EntityPermissionType.Read, ' WHERE');
        const rows = await provider.ExecuteSQL(sSQL, undefined, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('${entity.Name}', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
    `;
        }
      }

      // Reverse-relationship FieldResolvers (`Foo_BarIDArray`) are not generated.
      // They issued a per-parent `SELECT *` with no DataLoader and were unused in-tree.
      // Load children via RunView or a DeclareRelatedRecords collection; for a
      // mutation that already has the graph in memory, put the children on a
      // hand-written result type (see QueryMutationResultType).
      // now do the mutations
      const sInputType: string = this.generateServerGraphQLInputType(entity);
      if (sInputType !== '') {
        // only generate mutations if we have input type, because otherwsie we don't need em
        sRet += this.generateServerGraphQLMutations(entity, serverGraphQLTypeName);
      }
      sRet += `\n}`;
      if (sInputType !== '') {
        sRet = sInputType + sRet; // put the input type before the resolver as the decorators have to be evaluated ahead of their use in the resolver
      }
    }
    return sRet;
  }

  /**
   * Returns a JavaScript expression string (for use in generated code) that resolves
   * to the schema name at runtime. Core schema uses the dynamic config lookup;
   * non-core schemas use a literal string.
   */
  protected schemaNameExpression(entity: EntityInfo): string {
    if (entity.SchemaName === mjCoreSchema) {
      return 'Metadata.Provider.ConfigData.MJCoreSchemaName'; // global-provider-ok: codegen runs offline against a single provider
    }
    return `'${entity.SchemaName}'`;
  }

  protected generateServerGraphQLInputType(entity: EntityInfo): string {
    let sRet: string = '';
    if (entity.AllowCreateAPI) sRet += this.generateServerGraphQLInputTypeInner(entity, 'Create', true);
    if (entity.AllowUpdateAPI) sRet += this.generateServerGraphQLInputTypeInner(entity, 'Update', true);
    return sRet;
  }

  protected generateServerGraphQLInputTypeInner(entity: EntityInfo, classPrefix: 'Create' | 'Update', nonPKEYFieldsOptional: boolean): string {
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    let sRet: string = '';
    sRet += `\n
//****************************************************************************
// INPUT TYPE for ${entity.Name}
//****************************************************************************
@InputType()
export class ${classPrefix}${typeNameBase}Input {`;
    // first, filter the fields
    const fieldsToInclude = entity.Fields.filter((f) => {
      // include primary key for updates and also for creates if it is not an autoincrement field
      const includePrimaryKey = classPrefix === 'Update' || !f.AutoIncrement;
      // IS-A parent fields are virtual but writable through the child entity's ORM routing
      const isISAParentField = f.IsVirtual && f.AllowUpdateAPI && entity.IsChildType;
      return (includePrimaryKey && f.IsPrimaryKey) || !f.ReadOnly || isISAParentField;
    });

    // sort the fields by sequence and created date for consistent ordering
    const sortedFieldsToInclude = sortBySequenceAndCreatedAt(fieldsToInclude);

    // now iterate through the filtered fields
    for (const f of sortedFieldsToInclude) {
      const sTypeGraphQLString: string = this.getTypeGraphQLFieldString(f);
      // use a special codename for graphql because if we start with __mj we will replace with _mj_ as we can't start with __ it has meaning in graphql
      const codeName: string = f.CodeName.startsWith('__mj') ? '_mj_' + f.CodeName.substring(4) : f.CodeName;

      // next - decide if we allow this field to be undefined or not - for UPDATES, we only allow undefined if the field is not a primary key and the param to this function is on,
      // for CREATES, we allow undefined if the field is not a primary key and either the field allows null or has a default value
      // ALSO, for CREATES, primary keys that are not auto-increment should be nullable to allow optional override
      const fieldUndefined = classPrefix === 'Update' ? 
        nonPKEYFieldsOptional && !f.IsPrimaryKey : 
        (f.IsPrimaryKey && !f.AutoIncrement) || (nonPKEYFieldsOptional && !f.IsPrimaryKey && (!f.AllowsNull || f.HasDefaultValue));
      const sNull: string = f.AllowsNull || fieldUndefined ? '{ nullable: true }' : '';
      const sFullTypeGraphQLString: string = sTypeGraphQLString + (sNull === '' || sTypeGraphQLString === '' ? '' : ', ') + sNull;
        sRet += `
    @Field(${sFullTypeGraphQLString})
    ${codeName}${fieldUndefined ? '?' : ''}: ${TypeScriptTypeFromSQLTypeWithNullableOption(f.Type, f.AllowsNull)};
`;
    }

    // if the classPrefix is UPDATE, we need to add an optional OldValues array which will simply be an array of
    // KeyValuePairInputs that can be used to pass in the old values for all fields
    if (classPrefix.trim().toLowerCase() === 'update') {
      sRet += `
    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
`;
    }

    // RestoreContext___: present on BOTH Create and Update inputs so user-initiated
    // restores from a deleted record (Create path) and from a live record (Update path)
    // can both carry lineage to the server. The server-side resolver detects this blob
    // and calls BaseEntity.SetRestoreContext() before Save() so the data provider
    // writes the resulting RecordChange row with Source='Restore' and lineage columns.
    sRet += `
    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
`;

    sRet += `}
    `;
    return sRet;
  }

  protected generateServerGraphQLMutations(entity: EntityInfo, serverGraphQLTypeName: string): string {
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    let sRet: string = '';

    // MUTATIONS
    // First, determine if the entity has either Create/Edit allowed, if either, we need to generate a InputType
    //
    // External-data-source entities intentionally generate mutations like any other entity (gated only
    // by Allow*API + !VirtualEntity). The generated resolver routes through CreateRecord/UpdateRecord/
    // DeleteRecord → entity.Save()/.Delete(), and an external entity extends ReadOnlyExternalBaseEntity
    // whose Save/Delete reject (returning false + LatestResult) BEFORE any sproc is reached — so the
    // mutation fails loudly with the read-only reason rather than silently not existing. (No sproc is
    // generated for these entities, but none is ever called.)
    if (entity.AllowCreateAPI && !entity.VirtualEntity) {
      // generate a create mutation
      sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Create${typeNameBase}(
        @Arg('input', () => Create${typeNameBase}Input) input: Create${typeNameBase}Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('${entity.Name}', input, provider, userPayload, pubSub)
    }
        `;
    }
    if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
      // generate an edit mutation
      const loadParamString: string = entity.PrimaryKeys.map((f) => `input.${f.CodeName}`).join(', ');
      sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Update${typeNameBase}(
        @Arg('input', () => Update${typeNameBase}Input) input: Update${typeNameBase}Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('${entity.Name}', input, provider, userPayload, pubSub);
    }
    `;
    }
    if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
      let graphQLPKEYArgs = '';
      let compositeKeyString = '';
      for (let i = 0; i < entity.PrimaryKeys.length; i++) {
        const pk = entity.PrimaryKeys[i];
        graphQLPKEYArgs += graphQLPKEYArgs.length > 0 ? ', ' : '';
        // Sanitize a '__mj'-prefixed PK's GraphQL arg name (same rule as the read resolver above). Read-only
        // virtual entities (the only ones with a '__mj_MaterializedRowID' PK) don't reach this Delete path,
        // but keep the handling uniform so no '__'-prefixed arg can ever leak into the schema.
        const pkGraphQLArgName = pk.CodeName.startsWith('__mj') ? '_mj_' + pk.CodeName.substring(4) : pk.CodeName;
        graphQLPKEYArgs += `@Arg('${pkGraphQLArgName}', () => ${pk.GraphQLType}) `;
        graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        compositeKeyString += compositeKeyString.length > 0 ? ', ' : '';
        compositeKeyString += `{FieldName: '${pk.Name}', Value: ${pk.CodeName}}`;
      }

      sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Delete${typeNameBase}(${graphQLPKEYArgs}, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([${compositeKeyString}]);
        return this.DeleteRecord('${entity.Name}', key, options, provider, userPayload, pubSub);
    }
    `;
    }
    return sRet;
  }
}
