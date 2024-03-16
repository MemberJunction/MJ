import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo, TypeScriptTypeFromSQLType, Metadata } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { logError } from './logging';
import { mjCoreSchema } from './config';
import { makeDir } from './util';

export function generateGraphQLServerCode(entities: EntityInfo[], outputDirectory: string, generatedEntitiesImportLibrary: string, excludeRelatedEntitiesExternalToSchema: boolean): boolean {
    let sRet: string = '';
    try {
        sRet = generateAllEntitiesServerFileHeader(entities, generatedEntitiesImportLibrary);

        for (let i:number = 0; i < entities.length; ++i) {
            sRet += generateServerEntityString(entities[i], false, generatedEntitiesImportLibrary, excludeRelatedEntitiesExternalToSchema);
        }
        makeDir(outputDirectory);
        fs.writeFileSync(path.join(outputDirectory, 'generated.ts'), sRet);

        return true;
    } catch (err) {
        logError(err);
        return false
    }  
}

const _graphQLTypeSuffix = '_';
export function generateServerEntityString(entity: EntityInfo, includeFileHeader: boolean, generatedEntitiesImportLibrary: string, excludeRelatedEntitiesExternalToSchema: boolean) : string { 
    let sEntityOutput: string = '';
    try {
        const md = new Metadata();
        const fields: EntityFieldInfo[] = entity.Fields;
        const serverGraphQLTypeName: string = entity.ClassName + _graphQLTypeSuffix

        if (includeFileHeader)
            sEntityOutput = generateEntitySpecificServerFileHeader(entity, generatedEntitiesImportLibrary, excludeRelatedEntitiesExternalToSchema);

        sEntityOutput +=  generateServerEntityHeader(entity, serverGraphQLTypeName);

        // now generate the fields by looping through the fields collection from the database
        for (let j:number = 0; j < fields.length; ++j) {
            sEntityOutput += generateServerField(fields[j]);
        }

        for (let j:number = 0; j < entity.RelatedEntities.length; ++j) {
            const r = entity.RelatedEntities[j];
            const re = md.Entities.find(e => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase());
            // only include the relationship if we are IncludeInAPI for the related entity
            if (re.IncludeInAPI) {
                if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
                    // only include the relationship if either we are NOT excluding related entities external to the schema
                    // or if the related entity is in the same schema as the current entity
                    sEntityOutput += generateServerRelationship(md, entity.RelatedEntities[j]);
                }    
            }
            else {
                sEntityOutput += `// Relationship to ${r.RelatedEntity} is not included in the API because it is not marked as IncludeInAPI\n`
            }
        }

        // finally, close it up with the footer
        sEntityOutput += generateServerEntityFooter(entity);

        sEntityOutput += generateServerGraphQLResolver(entity, serverGraphQLTypeName, excludeRelatedEntitiesExternalToSchema);
    } catch (err) {
        logError(err);
    } finally {
        return sEntityOutput;
    }
}

export function generateAllEntitiesServerFileHeader(entities: EntityInfo[], importLibrary: string): string {
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
         PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType } from '@memberjunction/core'
import { AppContext } from '@memberjunction/server';

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
${importLibrary.trim().toLowerCase() === '@memberjunction/core-entities' ? `import { mj_core_schema } from '../config';\n` : ''}
import * as mj_core_schema_server_object_types from '@memberjunction/server'

import { ${entities.map(e => `${e.ClassName}Entity`).join(', ')} } from '${importLibrary}';
`
    return sRet;    
}

export function generateEntitySpecificServerFileHeader(entity: EntityInfo, importLibrary: string, excludeRelatedEntitiesExternalToSchema: boolean): string {
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
`
    for (let i:number = 0; i < entity.RelatedEntities.length; ++i) {
        const r = entity.RelatedEntities[i];
        const re = md.Entities.find(e => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase());
        if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
            // we only include entities that are in the same schema as the current entity
            // OR if we are not excluding related entities external to the schema
            const tableName = entity.RelatedEntities[i].RelatedEntityBaseTableCodeName;
            sRet += `\nimport ${tableName} from './${tableName}';`
        }
    }
    return sRet;
}
    
function generateServerEntityHeader (entity: EntityInfo, serverGraphQLTypeName: string): string {
    let sDescription: string = entity.Description?.trim().length > 0 ? entity.Description : '';
    if (sDescription.includes("'"))
        sDescription = sDescription.replace(/'/g, "\\'")

    return `

//****************************************************************************
// ENTITY CLASS for ${entity.Name}
//****************************************************************************
@ObjectType(${sDescription.length > 0 ? `{ description: '${sDescription}' }` : ''})
export class ${serverGraphQLTypeName} {`;
}
    
    
function generateServerEntityFooter(entity: EntityInfo): string {
    if (!entity)
        logError("entity parameter must be passed in to generateServerEntityFooter()")  

    return `\n}`
}
    
function generateServerField(fieldInfo: EntityFieldInfo): string {
    const fieldString: string = getTypeGraphQLFieldString(fieldInfo);
    let fieldOptions:  string = '';
    if (fieldInfo.AllowsNull)
        fieldOptions += 'nullable: true';
    if (fieldInfo.Description !== null && fieldInfo.Description.trim().length > 0) 
        fieldOptions += (fieldOptions.length > 0 ? ', ' : '') + `description: '${fieldInfo.Description.replace(/'/g, "\\'")}'`;

    return `  
    @Field(${fieldString}${fieldOptions.length > 0 ? (fieldString == '' ?  '' : ', ') + `{${fieldOptions}}` : ''}) ${fieldInfo.Length > 0 && fieldString == '' /*string*/ ? '\n    @MaxLength(' + fieldInfo.Length + ')' : ''}
    ${fieldInfo.CodeName}${fieldInfo.AllowsNull ? '?' : ''}: ${TypeScriptTypeFromSQLType(fieldInfo.Type)};
    `         
}
    
function getTypeGraphQLFieldString(fieldInfo: EntityFieldInfo): string {
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
            return "() => Boolean";
        case 'decimal':
        case 'numeric':
        case 'float':
        case 'real':
        case 'money':
        case 'smallmoney':
            fieldInfo.IsFloat = true; // used by calling functions to determine if we need to import Float
            return '() => Float'
        default:
            return '() => Int';      
    }
}



function generateServerRelationship (md: Metadata, r: EntityRelationshipInfo): string {
    const re = md.Entities.find(e => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase());
    const classPackagePrefix: string = re.SchemaName === mjCoreSchema ? 'mj_core_schema_server_object_types.' : '';
    const relatedClassName = classPackagePrefix + r.RelatedEntityBaseTableCodeName;

    if (r.Type.toLowerCase().trim() == 'one to many') {
        return `
    @Field(() => [${relatedClassName + _graphQLTypeSuffix}])
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + _graphQLTypeSuffix}[]; // Link to ${r.RelatedEntityCodeName}
`
    }
    else { // many to many
        return `
    @Field(() => [${relatedClassName + _graphQLTypeSuffix}])
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + _graphQLTypeSuffix}[]; // Link to ${r.RelatedEntity}
`
    }
}

function generateServerGraphQLResolver(entity: EntityInfo, serverGraphQLTypeName: string, excludeRelatedEntitiesExternalToSchema: boolean): string {
    const md = new Metadata();
    let sRet = '';

        // we only generate resolvers for entities that have a primary key field
    if (entity.PrimaryKeys.length > 0) {
        // first add in the base resolver query to lookup by ID for all entities
        const auditAccessCode: string = entity.AuditRecordAccess ? `
        this.createRecordAccessAuditLogRecord(userPayload, '${entity.Name}', ${entity.PrimaryKey.Name})` : '';
        
        sRet = `
//****************************************************************************
// RESOLVER for ${entity.Name}
//****************************************************************************
@ObjectType()
export class Run${entity.BaseTableCodeName}ViewResult {
    @Field(() => [${serverGraphQLTypeName}])
    Results: ${serverGraphQLTypeName}[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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
    }`
    let graphQLPKEYArgs = '';
    let whereClause = '';
    for (let i = 0; i < entity.PrimaryKeys.length; i++) {
        const pk = entity.PrimaryKeys[i];
        const idQuotes = pk.NeedsQuotes ? "'" : '';
        graphQLPKEYArgs += (graphQLPKEYArgs.length > 0 ? ', ' : '');
        graphQLPKEYArgs += `@Arg('${pk.CodeName}', () => ${pk.GraphQLType}) `;
        graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

        whereClause += (whereClause.length > 0 ? ' AND ' : '');
        whereClause += `[${pk.CodeName}]=${idQuotes}\${${pk.CodeName}}${idQuotes}`;
    }

sRet += `
    @Query(() => ${serverGraphQLTypeName}, { nullable: true })
    async ${entity.BaseTableCodeName}(${graphQLPKEYArgs}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = \`SELECT * FROM [${schemaName(entity)}].[${entity.BaseView}] WHERE ${whereClause} \` + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, 'AND');${auditAccessCode}
        const result = this.MapFieldNamesToCodeNames('${entity.Name}', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
`
        if (entity.AllowAllRowsAPI) {
            // this entity allows a query to return all rows, so include that type of query next
            sRet += `
    @Query(() => [${serverGraphQLTypeName}])
    async All${entity.CodeName}(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = \`SELECT * FROM [${schemaName(entity)}].[${entity.BaseView}]\` + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('${entity.Name}', await dataSource.query(sSQL));
        return result;
    }
`;
        }

        // now, generate the FieldResolvers for each of the one-to-many relationships
        for (let i = 0; i < entity.RelatedEntities.length; i++) {
            const r = entity.RelatedEntities[i];
            const re = md.Entities.find(e => e.Name.toLowerCase() === r.RelatedEntity.toLowerCase());

            // only include the relationship if we are IncludeInAPI for the related entity
            if (re.IncludeInAPI) {
                if (!excludeRelatedEntitiesExternalToSchema || re.SchemaName === entity.SchemaName) {
                    // only include the relationship if either we are NOT excluding related entities external to the schema
                    // or if the related entity is in the same schema as the current entity
                    if (r.Type.toLowerCase().trim() == 'many to many') 
                        sRet += generateManyToManyFieldResolver(entity, r);
                    else 
                        sRet += generateOneToManyFieldResolver(entity, r);
                }    
            }
            else {
                sRet += `// Relationship to ${r.RelatedEntity} is not included in the API because it is not marked as IncludeInAPI\n`
            }
        }
        // now do the mutations
        const sInputType: string = generateServerGraphQLInputType(entity);
        if (sInputType !== '') {
            // only generate mutations if we have input type, because otherwsie we don't need em
            sRet += generateServerGraphQLMutations(entity, serverGraphQLTypeName);        
        }
        sRet += `\n}`    
        if (sInputType !== '') {
            sRet = sInputType + sRet; // put the input type before the resolver as the decorators have to be evaluated ahead of their use in the resolver
        }
    }
    return sRet;
}

function schemaName(entity: EntityInfo): string {
    if (entity.SchemaName === mjCoreSchema) {
        return '${mj_core_schema}'
    }
    else
        return entity.SchemaName // put the actual schema name in
}

function generateServerGraphQLInputType(entity: EntityInfo): string {
    let sRet: string = '';
    if (entity.AllowCreateAPI) 
        sRet += generateServerGraphQLInputTypeInner(entity, false, 'Create');
    if (entity.AllowUpdateAPI) 
        sRet += generateServerGraphQLInputTypeInner(entity, true, 'Update');
    return sRet;
}

function generateServerGraphQLInputTypeInner(entity: EntityInfo, isUpdate: boolean, classPrefix: string): string {
    let sRet: string = ''
    sRet += `\n        
//****************************************************************************
// INPUT TYPE for ${entity.Name}   
//****************************************************************************
@InputType()
export class ${classPrefix}${entity.BaseTableCodeName}Input {`
    for (let i = 0; i < entity.Fields.length; i++) {
        const f = entity.Fields[i];
        const sTypeGraphQLString: string = getTypeGraphQLFieldString(f);
        const sNull: string = f.AllowsNull ? '{ nullable: true }' : '';
        const sFullTypeGraphQLString: string = sTypeGraphQLString + (sNull === '' || sTypeGraphQLString === '' ? '' : ', ') + sNull;
        // always include ID becuase it is used for UPDATES
        const includePrimaryKey = isUpdate || (!f.AutoIncrement && f.Type !=='uniqueidentifier') // include primary key for updates and also for creates if it is not an autoincrement field or a uniqueidentifier
        if ( (includePrimaryKey && f.IsPrimaryKey) || (!f.IsPrimaryKey && !f.IsVirtual && f.AllowUpdateAPI && f.Type.trim().toLowerCase() !== 'uniqueidentifier') ) {
            sRet += `
    @Field(${sFullTypeGraphQLString})
    ${f.CodeName}: ${TypeScriptTypeFromSQLType(f.Type)};
`
        }
    }
    sRet+=`}
`
    return sRet;
}

function generateServerGraphQLMutations(entity: EntityInfo, serverGraphQLTypeName: string): string {
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
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <${`${entity.ClassName}Entity`}>await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: Create${entity.BaseTableCodeName}Input): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: Create${entity.BaseTableCodeName}Input) {
    }
    `
    }
    if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
        // generate an edit mutation
        const loadParamString: string = entity.PrimaryKeys.map(f => `input.${f.CodeName}`).join(', ');
        sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Update${entity.BaseTableCodeName}(
        @Arg('input', () => Update${entity.BaseTableCodeName}Input) input: Update${entity.BaseTableCodeName}Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <${`${entity.ClassName}Entity`}>await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
            ${entity.TrackRecordChanges ? `await entityObject.Load(${loadParamString}) // Track Changes is turned on, so we need to get the latest data from DB first before we save` : 
                                           `entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for ${entity.Name}` }
            ${entity.TrackRecordChanges ? 'entityObject.SetMany(input);' : ''}
            if (await entityObject.Save(${entity.TrackRecordChanges ? '' : '{ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ }' })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: Update${entity.BaseTableCodeName}Input): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: Update${entity.BaseTableCodeName}Input) {
        const i = input, d = dataSource; // prevent error
    }
`
    }
    if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
        let graphQLPKEYArgs = '';
        let simplePKEYArgs = '';
        let pkeys = '';
        let whereClause = '';
        for (let i = 0; i < entity.PrimaryKeys.length; i++) {
            const pk = entity.PrimaryKeys[i];
            const idQuotes = pk.NeedsQuotes ? "'" : '';
            graphQLPKEYArgs += (graphQLPKEYArgs.length > 0 ? ', ' : '');
            graphQLPKEYArgs += `@Arg('${pk.CodeName}', () => ${pk.GraphQLType}) `;
            graphQLPKEYArgs += `${pk.CodeName}: ${pk.TSType}`;
    
            simplePKEYArgs += (simplePKEYArgs.length > 0 ? ', ' : '');
            simplePKEYArgs += `${pk.CodeName}: ${pk.TSType}`;

            pkeys += (pkeys.length > 0 ? ', ' : '');
            pkeys += `${pk.CodeName}`;

            whereClause += (whereClause.length > 0 ? ' AND ' : '');
            whereClause += `[${pk.CodeName}]=${idQuotes}\${${pk.CodeName}}${idQuotes}`;
        }

sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Delete${entity.BaseTableCodeName}(${graphQLPKEYArgs}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ${pkeys})) { // fire event and proceed if it wasn't cancelled
            const entityObject = <${`${entity.ClassName}Entity`}>await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
            await entityObject.Load(${pkeys});
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ${pkeys}); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ${simplePKEYArgs}): Promise<boolean> {
        const i = ${entity.PrimaryKey.Name}, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ${simplePKEYArgs}) {
        const i = ${entity.PrimaryKey.Name}, d = dataSource; // prevent error
    }
`        
    }
    return sRet;
}

// function generateSPParams(entity: EntityInfo, isUpdate: boolean): string {
//     let sRet: string = '',bFirst: boolean = true;
//     for (let i = 0; i < entity.Fields.length; i++) {
//         const f = entity.Fields[i];
//         if (!f.IsVirtual) {
//             switch (f.Name.toLowerCase()) {
//                 case 'id':
//                     if (isUpdate) {
//                         sRet += generateSingleSPParam(f, bFirst);
//                         bFirst = false;
//                     }
//                     break;
//                 case 'createdat':
//                 case 'updatedat':
//                     // do nothing
//                     break;
//                 default:
//                     if (f.Type.trim().toLowerCase() !== 'uniqueidentifier') {
//                         // DO NOT INCLUDE UNIQUEIDENTIFIER FIELDS
//                         // FOR CREATE/UPDATE, THEY ARE GENERATED BY THE DB
//                         sRet += generateSingleSPParam(f, bFirst);
//                         bFirst = false;
//                     }
//                     break;
//             }    
//         }
//     }
//     return sRet;
// }

// function generateSingleSPParam(f: EntityFieldInfo, isFirst: boolean): string {
//     let sRet: string = '';
//     let quotes: string = '';
//     switch  ( TypeScriptTypeFromSQLType(f.Type).toLowerCase() ) {
//         case 'string':
//         case 'date':
//             quotes = "'";
//             break;
//         default:
//             break;
//     }
//     if (!isFirst) 
//         sRet += ',\n                ';

//     sRet += `@${f.Name}=\${this.packageSPParam(input.${f.Name},"${quotes}")}`

//     return sRet;
// }

function generateOneToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    // let keyFieldTS: string = 'number';
    // if (r.EntityKeyField) { 
    //     const keyField = entity.Fields.find(f => f.Name.toLowerCase() == r.EntityKeyField.toLowerCase())
    //     keyFieldTS = keyField ? TypeScriptTypeFromSQLType(keyField.Type)  : 'int';    
    // }
    const md = new Metadata();
    const re = md.Entities.find(e => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase());
    const instanceName = entity.BaseTableCodeName.toLowerCase() + _graphQLTypeSuffix
    const filterFieldName = !r.EntityKeyField ? entity.PrimaryKey.Name : r.EntityKeyField;
    const filterField = entity.Fields.find(f => f.Name.toLowerCase() == filterFieldName.toLowerCase());
    if (!filterField)
        throw new Error(`Field ${filterFieldName} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`);

    const quotes = filterField.NeedsQuotes ? "'" : '';
    const serverPackagePrefix = re.SchemaName === mjCoreSchema ? 'mj_core_schema_server_object_types.' : '';
    const serverClassName = serverPackagePrefix + r.RelatedEntityBaseTableCodeName + _graphQLTypeSuffix
    return `  
    @FieldResolver(() => [${serverClassName}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + _graphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${r.RelatedEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes} \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', await dataSource.query(sSQL));
        return result;
    }
    `    
}
function generateManyToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    const md = new Metadata();
    const re = md.Entities.find(e => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase());
    const instanceName = entity.BaseTableCodeName.toLowerCase() + _graphQLTypeSuffix
    const filterFieldName = !r.EntityKeyField ? entity.PrimaryKey.Name : r.EntityKeyField;
    const filterField = entity.Fields.find(f => f.Name.toLowerCase() == filterFieldName.toLowerCase());
    if (!filterField)
        throw new Error(`Field ${filterFieldName} not found in entity ${entity.Name} - check the relationship ${r.ID} and the EntityKeyField property`);
    
    const quotes = filterField.NeedsQuotes ? "'" : '';
    const serverPackagePrefix = re.SchemaName === mjCoreSchema ? 'mj_core_schema_server_object_types.' : '';
    const serverClassName = serverPackagePrefix + r.RelatedEntityBaseTableCodeName + _graphQLTypeSuffix

    return `
    @FieldResolver(() => [${serverClassName}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + _graphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${schemaName(re)}].[${r.RelatedEntityBaseView}]\ WHERE [${re.PrimaryKey.Name}] IN (SELECT [${r.JoinEntityInverseJoinField}] FROM [${schemaName(re)}].[${r.JoinView}] WHERE [${r.JoinEntityJoinField}]=${quotes}\${${instanceName}.${filterFieldName}}${quotes}) \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('${r.RelatedEntity}', await dataSource.query(sSQL));
        return result;
    }
    `;
}