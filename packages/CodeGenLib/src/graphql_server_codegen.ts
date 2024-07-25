import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo, TypeScriptTypeFromSQLType, Metadata } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { logError } from './Misc/logging';
import { mjCoreSchema } from './Config/config';
import { makeDir } from './Misc/util';
import { RegisterClass } from '@memberjunction/global';

/**
 * This class is responsible for generating the GraphQL Server resolvers and types for the entities, you can sub-class this class to extend/modify the logic, make sure to use @memberjunction/global RegisterClass decorator
 * so that your class is used.
 */
@RegisterClass(GraphQLServerGeneratorBase)
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
      const fields: EntityFieldInfo[] = entity.Fields;
      const serverGraphQLTypeName: string = entity.ClassName + this.GraphQLTypeSuffix;

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

      for (let j: number = 0; j < entity.RelatedEntities.length; ++j) {
        const r = entity.RelatedEntities[j];
        const re = md.Entities.find((e) => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase())!;
        // only include the relationship if we are IncludeInAPI for the related entity
        if (re.IncludeInAPI) {
          if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
            // only include the relationship if either we are NOT excluding related entities external to the schema
            // or if the related entity is in the same schema as the current entity
            sEntityOutput += this.generateServerRelationship(md, entity.RelatedEntities[j], isInternal);
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
* GENERATED: ${new Date().toLocaleString()}
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
${
  isInternal
    ? `import { mj_core_schema } from '../config';\n`
    : `import * as mj_core_schema_server_object_types from '@memberjunction/server'`
}


import { ${entities.map((e) => `${e.ClassName}Entity`).join(', ')} } from '${importLibrary}';
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
* ${entity.Name} TypeORM/TypeGraphQL Type Class Definition - AUTO GENERATED FILE
*
* GENERATED: ${new Date().toLocaleString()}
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { MaxLength } from 'class-validator';
import { Field, ${entity._floatCount > 0 ? 'Float, ' : ''}Int, ObjectType } from '@memberjunction/server';
import { ${`${entity.ClassName}Entity`} } from '${importLibrary}';
    `;
    for (let i: number = 0; i < entity.RelatedEntities.length; ++i) {
      const r = entity.RelatedEntities[i];
      const re = md.Entities.find((e) => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase())!;
      if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
        // we only include entities that are in the same schema as the current entity
        // OR if we are not excluding related entities external to the schema
        const tableName = entity.RelatedEntities[i].RelatedEntityBaseTableCodeName;
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
@ObjectType(${sDescription.length > 0 ? `{ description: '${sDescription}' }` : ''})
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
      fieldOptions += (fieldOptions.length > 0 ? ', ' : '') + `description: '${fieldInfo.Description.replace(/'/g, "\\'")}'`;

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
    const relatedClassName = classPackagePrefix + r.RelatedEntityBaseTableCodeName;

    if (r.Type.toLowerCase().trim() == 'one to many') {
      return `
    @Field(() => [${relatedClassName + this.GraphQLTypeSuffix}])
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + this.GraphQLTypeSuffix}[]; // Link to ${r.RelatedEntityCodeName}
    `;
    } else {
      // many to many
      return `
    @Field(() => [${relatedClassName + this.GraphQLTypeSuffix}])
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + this.GraphQLTypeSuffix}[]; // Link to ${r.RelatedEntity}
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
    let sRet = '';

    // we only generate resolvers for entities that have a primary key field
    if (entity.PrimaryKeys.length > 0) {
      // first add in the base resolver query to lookup by ID for all entities
      const auditAccessCode: string = entity.AuditRecordAccess
        ? `
        this.createRecordAccessAuditLogRecord(userPayload, '${entity.Name}', ${entity.FirstPrimaryKey.Name})`
        : '';

      sRet = `
//****************************************************************************
// RESOLVER for ${entity.Name}
//****************************************************************************
@ObjectType()
export class Run${entity.BaseTableCodeName}ViewResult {
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
export class ${entity.BaseTableCodeName}Resolver${entity.CustomResolverAPI ? 'Base' : ''} extends ResolverBase {
    @Query(() => Run${entity.BaseTableCodeName}ViewResult)
    async Run${entity.BaseTableCodeName}ViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => Run${entity.BaseTableCodeName}ViewResult)
    async Run${entity.BaseTableCodeName}ViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => Run${entity.BaseTableCodeName}ViewResult)
    async Run${entity.BaseTableCodeName}DynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = '${entity.Name}';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
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
    async ${entity.BaseTableCodeName}(${graphQLPKEYArgs}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = \`SELECT * FROM [${this.schemaName(entity)}].[${entity.BaseView}] WHERE ${whereClause} \` + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, 'AND');${auditAccessCode}
        const result = this.MapFieldNamesToCodeNames('${entity.Name}', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    `;
      if (entity.AllowAllRowsAPI) {
        // this entity allows a query to return all rows, so include that type of query next
        sRet += `
    @Query(() => [${serverGraphQLTypeName}])
    async All${entity.CodeName}(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = \`SELECT * FROM [${this.schemaName(entity)}].[${entity.BaseView}]\` + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('${entity.Name}', await dataSource.query(sSQL));
        return result;
    }
    `;
      }

      // now, generate the FieldResolvers for each of the one-to-many relationships
      for (let i = 0; i < entity.RelatedEntities.length; i++) {
        const r = entity.RelatedEntities[i];
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
    if (entity.AllowCreateAPI) sRet += this.generateServerGraphQLInputTypeInner(entity, false, 'Create');
    if (entity.AllowUpdateAPI) sRet += this.generateServerGraphQLInputTypeInner(entity, true, 'Update');
    return sRet;
  }

  protected generateServerGraphQLInputTypeInner(entity: EntityInfo, isUpdate: boolean, classPrefix: string): string {
    let sRet: string = '';
    sRet += `\n
//****************************************************************************
// INPUT TYPE for ${entity.Name}
//****************************************************************************
@InputType()
export class ${classPrefix}${entity.BaseTableCodeName}Input {`;
    for (let i = 0; i < entity.Fields.length; i++) {
      const f = entity.Fields[i];
      const sTypeGraphQLString: string = this.getTypeGraphQLFieldString(f);
      // use a special codename for graphql because if we start with __mj we will replace with _mj_ as we can't start with __ it has meaning in graphql
      const codeName: string = f.CodeName.startsWith('__mj') ? '_mj_' + f.CodeName.substring(4) : f.CodeName;

      const sNull: string = f.AllowsNull ? '{ nullable: true }' : '';
      const sFullTypeGraphQLString: string = sTypeGraphQLString + (sNull === '' || sTypeGraphQLString === '' ? '' : ', ') + sNull;
      // always include ID becuase it is used for UPDATES
      const includePrimaryKey = isUpdate || (!f.AutoIncrement && f.Type !== 'uniqueidentifier'); // include primary key for updates and also for creates if it is not an autoincrement field or a uniqueidentifier
      if ((includePrimaryKey && f.IsPrimaryKey) || !f.ReadOnly) {
        sRet += `
    @Field(${sFullTypeGraphQLString})
    ${codeName}${f.AllowsNull ? '?' : ''}: ${TypeScriptTypeFromSQLType(f.Type)};
`;
      }
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
    let sRet: string = '';

    // MUTATIONS
    // First, determine if the entity has either Create/Edit allowed, if either, we need to generate a InputType
    if (entity.AllowCreateAPI && !entity.VirtualEntity) {
      // generate a create mutation
      sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Create${entity.BaseTableCodeName}(
        @Arg('input', () => Create${entity.BaseTableCodeName}Input) input: Create${entity.BaseTableCodeName}Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('${entity.Name}', input, dataSource, userPayload, pubSub)
    }
        `;
    }
    if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
      // generate an edit mutation
      const loadParamString: string = entity.PrimaryKeys.map((f) => `input.${f.CodeName}`).join(', ');
      sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Update${entity.BaseTableCodeName}(
        @Arg('input', () => Update${entity.BaseTableCodeName}Input) input: Update${entity.BaseTableCodeName}Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('${entity.Name}', input, dataSource, userPayload, pubSub);
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
    async Delete${entity.BaseTableCodeName}(${graphQLPKEYArgs}, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([${compositeKeyString}]);
        return this.DeleteRecord('${entity.Name}', key, options, dataSource, userPayload, pubSub);
    }
    `;
    }
    return sRet;
  }

  protected generateOneToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo, isInternal: boolean): string {
    const md = new Metadata();
    const re = md.Entities.find((e) => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase())!;
    const instanceName = entity.BaseTableCodeName.toLowerCase() + this.GraphQLTypeSuffix;

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
    const serverClassName = serverPackagePrefix + r.RelatedEntityBaseTableCodeName + this.GraphQLTypeSuffix;
    return `
    @FieldResolver(() => [${serverClassName}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + this.GraphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${this.schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${r.RelatedEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes} \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', await dataSource.query(sSQL));
        return result;
    }
        `;
  }

  protected generateManyToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    const md = new Metadata();
    const re = md.Entities.find((e) => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase())!;
    const instanceName = entity.BaseTableCodeName.toLowerCase() + this.GraphQLTypeSuffix;
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
    const serverClassName = serverPackagePrefix + r.RelatedEntityBaseTableCodeName + this.GraphQLTypeSuffix;

    return `
    @FieldResolver(() => [${serverClassName}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + this.GraphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${this.schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${re.FirstPrimaryKey.Name}] IN (SELECT [${r.JoinEntityInverseJoinField}] FROM [${this.schemaName(re)}].[${r.JoinView}] WHERE [${r.JoinEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes}) \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', await dataSource.query(sSQL));
        return result;
    }
        `;
  }
}
