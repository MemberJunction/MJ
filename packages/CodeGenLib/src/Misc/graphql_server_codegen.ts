import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo, TypeScriptTypeFromSQLType, Metadata, TypeScriptTypeFromSQLTypeWithNullableOption, getGraphQLTypeNameBase } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { logError } from './status_logging';
import { mjCoreSchema } from '../Config/config';
import { makeDir, sortBySequenceAndCreatedAt } from './util';

/**
 * This class is responsible for generating the GraphQL Server resolvers and types for the entities, you can sub-class this class to extend/modify the logic, make sure to use @memberjunction/global RegisterClass decorator
 * so that your class is used.
 */
export class GraphQLServerGeneratorBase {
  public generateGraphQLServerCode(
    entities: EntityInfo[],
    outputDirectory: string,
    generatedEntitiesImportLibrary: string,
    excludeRelatedEntitiesExternalToSchema: boolean
  ): boolean {
    const isInternal = generatedEntitiesImportLibrary.trim().toLowerCase().startsWith('@memberjunction/');
    let sRet: string = '';
    try {
      sRet = this.generateAllEntitiesServerFileHeader(entities, generatedEntitiesImportLibrary, isInternal);

      for (let i: number = 0; i < entities.length; ++i) {
        sRet += this.generateServerEntityString(entities[i], false, generatedEntitiesImportLibrary, excludeRelatedEntitiesExternalToSchema);
      }
      makeDir(outputDirectory);
      fs.writeFileSync(path.join(outputDirectory, 'generated.ts'), sRet);

      return true;
    } catch (err) {
      logError(err as string);
      return false;
    }
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
    excludeRelatedEntitiesExternalToSchema: boolean
  ): string {
    const isInternal = generatedEntitiesImportLibrary.trim().toLowerCase() === '@memberjunction/core-entities';
    let sEntityOutput: string = '';
    try {
      const md = new Metadata();
      const fields: EntityFieldInfo[] = sortBySequenceAndCreatedAt(entity.Fields);
      const serverGraphQLTypeName: string = this.getServerGraphQLTypeName(entity);

      if (includeFileHeader)
        sEntityOutput = this.generateEntitySpecificServerFileHeader(
          entity,
          generatedEntitiesImportLibrary,
          excludeRelatedEntitiesExternalToSchema
        );

      sEntityOutput += this.generateServerEntityHeader(entity, serverGraphQLTypeName);

      // now generate the fields by looping through the fields collection from the database
      for (let j: number = 0; j < fields.length; ++j) {
        sEntityOutput += this.generateServerField(fields[j]);
      }

      // Sort related entities by Sequence, then by __mj_CreatedAt for consistent ordering
      const sortedRelatedEntities = sortBySequenceAndCreatedAt(entity.RelatedEntities);

      for (let j: number = 0; j < sortedRelatedEntities.length; ++j) {
        const r = sortedRelatedEntities[j];
        const re = md.Entities.find((e) => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase())!;
        // only include the relationship if we are IncludeInAPI for the related entity
        if (re.IncludeInAPI) {
          if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
            // only include the relationship if either we are NOT excluding related entities external to the schema
            // or if the related entity is in the same schema as the current entity
            sEntityOutput += this.generateServerRelationship(md, sortedRelatedEntities[j], isInternal);
          }
        } else {
          sEntityOutput += `// Relationship to ${r.RelatedEntity} is not included in the API because it is not marked as IncludeInAPI\n`;
        }
      }

      // finally, close it up with the footer
      sEntityOutput += this.generateServerEntityFooter(entity);

      sEntityOutput += this.generateServerGraphQLResolver(
        entity,
        serverGraphQLTypeName,
        excludeRelatedEntitiesExternalToSchema,
        isInternal
      );
    } catch (err) {
      logError(err as string);
    } finally {
      return sEntityOutput;
    }
  }

  public generateAllEntitiesServerFileHeader(entities: EntityInfo[], importLibrary: string, isInternal: boolean): string {
    let sRet: string = `/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyDataSource, GetReadWriteDataSource, GetReadOnlyProvider, GetReadWriteProvider } from '@memberjunction/server';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
${
  isInternal
    ? `import { mj_core_schema } from '../config.js';\n`
    : `import * as mj_core_schema_server_object_types from '@memberjunction/server'`
}


${entities.length > 0 ? `import { ${entities.map((e) => `${e.ClassName}Entity`).join(', ')} } from '${importLibrary}';` : `export {}`}
    `;
    return sRet;
  }

  public generateEntitySpecificServerFileHeader(
    entity: EntityInfo,
    importLibrary: string,
    excludeRelatedEntitiesExternalToSchema: boolean
  ): string {
    const md = new Metadata();
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
import { Field, ${entity._floatCount > 0 ? 'Float, ' : ''}Int, ObjectType, GetReadOnlyDataSource, GetReadWriteDataSource } from '@memberjunction/server';
import { ${`${entity.ClassName}Entity`} } from '${importLibrary}';
    `;
    // Sort related entities by Sequence, then by __mj_CreatedAt for consistent ordering
    const sortedRelatedEntities = sortBySequenceAndCreatedAt(entity.RelatedEntities);

    for (let i: number = 0; i < sortedRelatedEntities.length; ++i) {
      const r = sortedRelatedEntities[i];
      const re = md.Entities.find((e) => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase())!;
      if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
        // we only include entities that are in the same schema as the current entity
        // OR if we are not excluding related entities external to the schema
        const tableName = sortedRelatedEntities[i].RelatedEntityBaseTableCodeName;
        sRet += `\nimport ${tableName} from './${tableName}';`;
      }
    }
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
    @Field(${fieldString}${fieldOptions.length > 0 ? (fieldString == '' ? '' : ', ') + `{${fieldOptions}}` : ''}) ${fieldInfo.Length > 0 && fieldString == '' /*string*/ ? '\n    @MaxLength(' + fieldInfo.Length + ')' : ''}
    ${codeName}${fieldInfo.AllowsNull ? '?' : ''}: ${TypeScriptTypeFromSQLType(fieldInfo.Type)};
        `;
  }

  protected getTypeGraphQLFieldString(fieldInfo: EntityFieldInfo): string {
    switch (fieldInfo.Type.toLowerCase()) {
      case 'text':
      case 'char':
      case 'varchar':
      case 'ntext':
      case 'nchar':
      case 'nvarchar':
      case 'uniqueidentifier': //treat this as a string
        return '';
      case 'datetime':
      case 'datetime2':
      case 'smalldatetime':
      case 'datetimeoffset':
      case 'date':
      case 'time':
        return '';
      case 'bit':
        return '() => Boolean';
      case 'decimal':
      case 'numeric':
      case 'float':
      case 'real':
      case 'money':
      case 'smallmoney':
        fieldInfo.IsFloat = true; // used by calling functions to determine if we need to import Float
        return '() => Float';
      case 'timestamp':
      case 'rowversion':
        return '';
      default:
        return '() => Int';
    }
  }

  protected generateServerRelationship(md: Metadata, r: EntityRelationshipInfo, isInternal: boolean): string {
    const re = md.Entities.find((e) => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase())!;
    const classPackagePrefix: string = re.SchemaName === mjCoreSchema && !isInternal ? 'mj_core_schema_server_object_types.' : '';
    const relatedTypeName = this.getServerGraphQLTypeName(re);
    const relatedClassName = classPackagePrefix + relatedTypeName;

    // create a code name that is the combination of the relatedentitycode name plus the relatedentityjoinfield that has spaces stripped
    // and replace all special characters with an underscore
    const uniqueCodeName = `${r.RelatedEntityCodeName}_${r.RelatedEntityJoinField.replace(/ /g, '')}`.replace(/[^a-zA-Z0-9]/g, '_');

    if (r.Type.toLowerCase().trim() == 'one to many') {
      return `
    @Field(() => [${relatedClassName}])
    ${uniqueCodeName}Array: ${relatedClassName}[]; // Link to ${r.RelatedEntityCodeName}
    `;
    } else {
      // many to many
      return `
    @Field(() => [${relatedClassName}])
    ${uniqueCodeName}Array: ${relatedClassName}[]; // Link to ${r.RelatedEntity}
    `;
    }
  }

  protected generateServerGraphQLResolver(
    entity: EntityInfo,
    serverGraphQLTypeName: string,
    excludeRelatedEntitiesExternalToSchema: boolean,
    isInternal: boolean
  ): string {
    const md = new Metadata();
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
      for (let i = 0; i < entity.PrimaryKeys.length; i++) {
        const pk = entity.PrimaryKeys[i];
        const idQuotes = pk.NeedsQuotes ? "'" : '';
        graphQLPKEYArgs += graphQLPKEYArgs.length > 0 ? ', ' : '';
        graphQLPKEYArgs += `@Arg('${pk.CodeName}', () => ${pk.GraphQLType}) `;
        graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        whereClause += whereClause.length > 0 ? ' AND ' : '';
        whereClause += `[${pk.CodeName}]=${idQuotes}\${${pk.CodeName}}${idQuotes}`;
      }

      sRet += `
    @Query(() => ${serverGraphQLTypeName}, { nullable: true })
    async ${typeNameBase}(${graphQLPKEYArgs}, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM [${this.schemaName(entity)}].[${entity.BaseView}] WHERE ${whereClause} \` + this.getRowLevelSecurityWhereClause(provider, '${entity.Name}', userPayload, EntityPermissionType.Read, 'AND');${auditAccessCode}
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('${entity.Name}', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    `;
      if (entity.AllowAllRowsAPI) {
        // this entity allows a query to return all rows, so include that type of query next
        sRet += `
    @Query(() => [${serverGraphQLTypeName}])
    async All${entity.CodeName}(@Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM [${this.schemaName(entity)}].[${entity.BaseView}]\` + this.getRowLevelSecurityWhereClause(provider, '${entity.Name}', userPayload, EntityPermissionType.Read, ' WHERE');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('${entity.Name}', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
    `;
      }

      // now, generate the FieldResolvers for each of the one-to-many relationships
      // Sort related entities by Sequence, then by __mj_CreatedAt for consistent ordering
      const sortedRelatedEntities = sortBySequenceAndCreatedAt(entity.RelatedEntities);

      for (let i = 0; i < sortedRelatedEntities.length; i++) {
        const r = sortedRelatedEntities[i];
        const re = md.Entities.find((e) => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase())!;

        // only include the relationship if we are IncludeInAPI for the related entity
        if (re.IncludeInAPI) {
          if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
            // only include the relationship if either we are NOT excluding related entities external to the schema
            // or if the related entity is in the same schema as the current entity
            if (r.Type.toLowerCase().trim() == 'many to many') sRet += this.generateManyToManyFieldResolver(entity, r);
            else sRet += this.generateOneToManyFieldResolver(entity, r, isInternal);
          }
        } else {
          sRet += `// Relationship to ${r.RelatedEntity} is not included in the API because it is not marked as IncludeInAPI\n`;
        }
      }
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

  protected schemaName(entity: EntityInfo): string {
    if (entity.SchemaName === mjCoreSchema) {
      return '${Metadata.Provider.ConfigData.MJCoreSchemaName}';
    } else return entity.SchemaName; // put the actual schema name in
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
    sRet += `}
    `;
    return sRet;
  }

  protected generateServerGraphQLMutations(entity: EntityInfo, serverGraphQLTypeName: string): string {
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    let sRet: string = '';

    // MUTATIONS
    // First, determine if the entity has either Create/Edit allowed, if either, we need to generate a InputType
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
      let simplePKEYArgs = '';
      let compositeKeyString = '';
      let pkeys = '';
      let whereClause = '';
      for (let i = 0; i < entity.PrimaryKeys.length; i++) {
        const pk = entity.PrimaryKeys[i];
        const idQuotes = pk.NeedsQuotes ? "'" : '';
        graphQLPKEYArgs += graphQLPKEYArgs.length > 0 ? ', ' : '';
        graphQLPKEYArgs += `@Arg('${pk.CodeName}', () => ${pk.GraphQLType}) `;
        graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        simplePKEYArgs += simplePKEYArgs.length > 0 ? ', ' : '';
        simplePKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        compositeKeyString += compositeKeyString.length > 0 ? ', ' : '';
        compositeKeyString += `{FieldName: '${pk.Name}', Value: ${pk.CodeName}}`;

        pkeys += pkeys.length > 0 ? ', ' : '';
        pkeys += `${pk.CodeName}`;

        whereClause += whereClause.length > 0 ? ' AND ' : '';
        whereClause += `[${pk.CodeName}]=${idQuotes}\${${pk.CodeName}}${idQuotes}`;
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

  protected generateOneToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo, isInternal: boolean): string {
    const md = new Metadata();
    const re = md.EntityByName(r.RelatedEntity);
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    const instanceName = typeNameBase.toLowerCase() + this.GraphQLTypeSuffix;

    let filterFieldName: string = '';
    if (!r.EntityKeyField) {
      filterFieldName = entity.FirstPrimaryKey.CodeName;
    } else {
      const field: EntityFieldInfo = entity.Fields.find((f) => f.Name.trim().toLowerCase() === r.EntityKeyField.trim().toLowerCase())!;
      if (field) {
        filterFieldName = field.CodeName;
      } else {
        logError(
          `GenerateOneToManyFieldResolver: EntityRelationshipInfo Field ${r.EntityKeyField} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`
        );
        return '';
      }
    }

    const filterField = entity.Fields.find((f) => f.CodeName.toLowerCase() === filterFieldName.toLowerCase());
    if (!filterField) {
      logError(
        `GenerateOneToManyFieldResolver: Field ${filterFieldName} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`
      );
      return '';
    }

    const quotes = filterField.NeedsQuotes ? "'" : '';
    const serverPackagePrefix = re.SchemaName === mjCoreSchema && !isInternal ? 'mj_core_schema_server_object_types.' : '';
    const relatedTypeName = this.getServerGraphQLTypeName(re);
    const serverClassName = serverPackagePrefix + relatedTypeName;

    // create a code name that is the combination of the relatedentitycode name plus the relatedentityjoinfield that has spaces stripped
    // and replace all special characters with an underscore
    const uniqueCodeName = `${r.RelatedEntityCodeName}_${r.RelatedEntityJoinField.replace(/ /g, '')}`.replace(/[^a-zA-Z0-9]/g, '_');

    return `
    @FieldResolver(() => [${serverClassName}])
    async ${uniqueCodeName}Array(@Root() ${instanceName}: ${typeNameBase + this.GraphQLTypeSuffix}, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM [${this.schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${r.RelatedEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes} \` + this.getRowLevelSecurityWhereClause(provider, '${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        `;
  }

  protected generateManyToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    const md = new Metadata();
    const re = md.Entities.find((e) => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase())!;
    const typeNameBase = this.getServerGraphQLTypeNameBase(entity);
    const instanceName = typeNameBase.toLowerCase() + this.GraphQLTypeSuffix;
    let filterFieldName: string = '';
    if (!r.EntityKeyField) {
      filterFieldName = entity.FirstPrimaryKey.CodeName;
    } else {
      const field: EntityFieldInfo = entity.Fields.find((f) => f.Name.trim().toLowerCase() === r.EntityKeyField.trim().toLowerCase())!;
      if (field) {
        filterFieldName = field.CodeName;
      } else {
        logError(
          `GenerateManyToManyFieldResolver: EntityRelationshipInfo Field ${r.EntityKeyField} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`
        );
        return '';
      }
    }

    const filterField = entity.Fields.find((f) => f.CodeName.toLowerCase() === filterFieldName.toLowerCase());
    if (!filterField) {
      logError(
        `GenerateManyToManyFieldResolver: Field ${filterFieldName} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`
      );
      return '';
    }

    const quotes = filterField.NeedsQuotes ? "'" : '';
    const serverPackagePrefix = re.SchemaName === mjCoreSchema ? 'mj_core_schema_server_object_types.' : '';
    const relatedTypeName = this.getServerGraphQLTypeName(re);
    const serverClassName = serverPackagePrefix + relatedTypeName;

    // create a code name that is the combination of the relatedentitycode name plus the relatedentityjoinfield that has spaces stripped
    // and replace all special characters with an underscore
    const uniqueCodeName = `${r.RelatedEntityCodeName}_${r.JoinEntityJoinField.replace(/ /g, '')}`.replace(/[^a-zA-Z0-9]/g, '_');

    return `
    @FieldResolver(() => [${serverClassName}])
    async ${uniqueCodeName}Array(@Root() ${instanceName}: ${typeNameBase + this.GraphQLTypeSuffix}, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = \`SELECT * FROM [${this.schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${re.FirstPrimaryKey.Name}] IN (SELECT [${r.JoinEntityInverseJoinField}] FROM [${this.schemaName(re)}].[${r.JoinView}] WHERE [${r.JoinEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes}) \` + this.getRowLevelSecurityWhereClause(provider, '${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        `;
  }
}
