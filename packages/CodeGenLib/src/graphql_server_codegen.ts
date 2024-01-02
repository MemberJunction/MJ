import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo, TypeScriptTypeFromSQLType, Metadata } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { logError } from './logging';

export function generateGraphQLServerCode(entities: EntityInfo[], outputDirectory: string): boolean {
    let sRet: string = '';
    try {
        sRet = generateAllEntitiesServerFileHeader();

        for (let i:number = 0; i < entities.length; ++i) {
            sRet += generateServerEntityString(entities[i], false);
        }
        fs.writeFileSync(path.join(outputDirectory, 'generated.ts'), sRet);

        return true;
    } catch (err) {
        console.error(err);
        return false
    }  
}

const _graphQLTypeSuffix = '_';
export function generateServerEntityString(entity: EntityInfo, includeFileHeader: boolean ) : string { 
    let sEntityOutput: string = '';
    try {
        const fields: EntityFieldInfo[] = entity.Fields;
        const serverGraphQLTypeName: string = entity.ClassName + _graphQLTypeSuffix

        if (includeFileHeader)
            sEntityOutput = generateEntitySpecificServerFileHeader(entity);

        sEntityOutput +=  generateServerEntityHeader(entity, serverGraphQLTypeName);

        // now generate the fields by looping through the fields collection from the database
        for (let j:number = 0; j < fields.length; ++j) {
            sEntityOutput += generateServerField(fields[j]);
        }

        for (let j:number = 0; j < entity.RelatedEntities.length; ++j) {
            sEntityOutput += generateServerRelationship(entity.RelatedEntities[j]);
        }

        // finally, close it up with the footer
        sEntityOutput += generateServerEntityFooter(entity);

        sEntityOutput += generateServerGraphQLResolver(entity, serverGraphQLTypeName);
    } catch (err) {
        console.error(err);
    } finally {
        return sEntityOutput;
    }
}

export function generateAllEntitiesServerFileHeader(): string {
    let sRet: string = `/********************************************************************************
* ALL ENTITIES - TypeORM/TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
* 
* GENERATED: ${new Date().toLocaleString()}
* 
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
* 
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation, PubSub, PubSubEngine } from '@memberjunction/server';
import { AppContext } from '@memberjunction/server';
import { MaxLength } from 'class-validator';
import { ResolverBase } from '../generic/ResolverBase';
import { RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput } from '../generic/RunViewResolver';
import {
  BaseEntity,
  PrimaryGeneratedColumn,
  JoinTable,
  ViewEntity,
  ManyToMany,
  OneToMany,
  Column,
  ViewColumn,
  DataSource
} from 'typeorm';
import * as MJGeneratedEntities from 'mj_generatedentities'
import { Metadata, EntityPermissionType } from '@memberjunction/core'
`
    return sRet;    
}

export function generateEntitySpecificServerFileHeader(entity: EntityInfo): string {
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
import {
  BaseEntity,${entity._hasIdField ? '\n  PrimaryGeneratedColumn,' : ''}${entity._manyToManyCount > 0 ? '\n  JoinTable,' : ''}
  ViewEntity,${entity._manyToManyCount > 0 ? '\n  ManyToMany,' : ''}${entity._oneToManyCount > 0 ? '\n  OneToMany,' : ''}
  Column,${entity._virtualCount > 0 ? '\n  ViewColumn,' : ''}
} from 'typeorm';
`
    for (let i:number = 0; i < entity.RelatedEntities.length; ++i) {
        const tableName = entity.RelatedEntities[i].RelatedEntityBaseTableCodeName;
        sRet += `\nimport ${tableName} from './${tableName}';`
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
@ViewEntity({
   name: '${entity.BaseView.trim().length > 0 ? entity.BaseView : 
                                         (entity.SchemaName.trim().length > 0 ? entity.SchemaName + '.' : '') + entity.BaseTable }',
   schema: '${entity.SchemaName}',
   synchronize: false,
})
@ObjectType(${sDescription.length > 0 ? `{ description: '${sDescription}' }` : ''})
export class ${serverGraphQLTypeName} extends BaseEntity {`;
}
    
    
function generateServerEntityFooter(entity: EntityInfo): string {
    if (!entity)
        logError("entity parameter must be passed in to generateServerEntityFooter()")  

    return `\n}`
}
    
function generateServerField(fieldInfo: EntityFieldInfo): string {
    const fieldString: string = getTypeORMFieldString(fieldInfo);
    let fieldOptions:  string = '';
    if (fieldInfo.AllowsNull)
        fieldOptions += 'nullable: true';
    if (fieldInfo.Description !== null && fieldInfo.Description.trim().length > 0) 
        fieldOptions += (fieldOptions.length > 0 ? ', ' : '') + `description: '${fieldInfo.Description.replace(/'/g, "\\'")}'`;

    if (fieldInfo.Name.trim().toUpperCase() === 'ID') {
            return `
    @Field(() => Int)
    @PrimaryGeneratedColumn()
    ID: number;
`
        }
        else {
            return `  
    @Field(${fieldString}${fieldOptions.length > 0 ? (fieldString == '' ?  '' : ', ') + `{${fieldOptions}}` : ''}) ${fieldInfo.Length > 0 && fieldString == '' /*string*/ ? '\n    @MaxLength(' + fieldInfo.Length + ')' : ''}
    ${fieldInfo.IsVirtual ? '@ViewColumn()' : '@Column()'}
    ${fieldInfo.Name}${fieldInfo.AllowsNull ? '?' : ''}: ${TypeScriptTypeFromSQLType(fieldInfo.Type)};
    `         
        }
}
    
function getTypeORMFieldString(fieldInfo: EntityFieldInfo): string {
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
        case 'money':
            fieldInfo.IsFloat = true; // used by calling functions to determine if we need to import Float
            return '() => Float'
        default:
            return '() => Int';      
    }
}



function generateServerRelationship (r: EntityRelationshipInfo): string {
    let relatedClassName = r.RelatedEntityBaseTableCodeName;

    if (r.Type.toLowerCase().trim() == 'one to many') {
        return `
    @Field(() => [${relatedClassName + _graphQLTypeSuffix}])
    @OneToMany(() => ${relatedClassName + _graphQLTypeSuffix}, () => null)
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + _graphQLTypeSuffix}[]; // Link to ${r.RelatedEntityCodeName}
`
    }
    else { // many to many
        return `
    @Field(() => [${relatedClassName + _graphQLTypeSuffix}])
    @ManyToMany(() => ${relatedClassName + _graphQLTypeSuffix}, (${relatedClassName.toLowerCase()}) => ${relatedClassName.toLowerCase()}.${r.Entity})
    @JoinTable({
        name: '${r.JoinView}',
        joinColumn: { name: '${r.JoinEntityJoinField}', referencedColumnName: '${r.RelatedEntityJoinField}' },
        inverseJoinColumn: { name: '${r.JoinEntityInverseJoinField}', referencedColumnName: 'ID' },
    })
    ${r.RelatedEntityCodeName}Array: ${relatedClassName + _graphQLTypeSuffix}[]; // Link to ${r.RelatedEntity}
`
    }
}

function generateServerGraphQLResolver(entity: EntityInfo, serverGraphQLTypeName: string): string {
    let sRet = '';

        // we only generate resolvers for entities that have an ID field
    if (entity._hasIdField) {
        // first add in the base resolver query to lookup by ID for all entities
        const auditAccessCode: string = entity.AuditRecordAccess ? `
        this.createRecordAccessAuditLogRecord(userPayload, '${entity.Name}', ID)` : '';
        
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
    }

    @Query(() => ${serverGraphQLTypeName}, { nullable: true })
    async ${entity.BaseTableCodeName}(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<${serverGraphQLTypeName} | null> {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = \`SELECT * FROM [${entity.SchemaName}].${entity.BaseView} WHERE ID=\${ID} \` + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, 'AND');${auditAccessCode}
        return dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {});
    }
`
        if (entity.AllowAllRowsAPI) {
            // this entity allows a query to return all rows, so include that type of query next
            sRet += `
    @Query(() => [${serverGraphQLTypeName}])
    All${entity.CodeName}(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${entity.Name}', userPayload);
        const sSQL = 'SELECT * FROM [${entity.SchemaName}].${entity.BaseView}' + this.getRowLevelSecurityWhereClause('${entity.Name}', userPayload, EntityPermissionType.Read, ' WHERE');
        return dataSource.query(sSQL);
    }
`;
        }

        // now, generate the FieldResolvers for each of the one-to-many relationships
        for (let i = 0; i < entity.RelatedEntities.length; i++) {
            const r = entity.RelatedEntities[i];
            if (r.Type.toLowerCase().trim() == 'many to many') 
                sRet += generateManyToManyFieldResolver(entity,r);
            else 
                sRet += generateOneToManyFieldResolver(entity,r);
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

function generateServerGraphQLInputType(entity: EntityInfo): string {
    let sRet: string = '';
    if (entity.AllowCreateAPI) 
        sRet += generateServerGraphQLInputTypeInner(entity, false, 'Create');
    if (entity.AllowUpdateAPI) 
        sRet += generateServerGraphQLInputTypeInner(entity, true, 'Update');
    return sRet;
}

function generateServerGraphQLInputTypeInner(entity: EntityInfo, includeID: boolean, classPrefix: string): string {
    let sRet: string = ''
    sRet += `\n        
//****************************************************************************
// INPUT TYPE for ${entity.Name}   
//****************************************************************************
@InputType()
export class ${classPrefix}${entity.BaseTableCodeName}Input {`
    for (let i = 0; i < entity.Fields.length; i++) {
        const f = entity.Fields[i];
        const sTypeORMString: string = getTypeORMFieldString(f);
        const sNull: string = f.AllowsNull ? '{ nullable: true }' : '';
        const sFullTypeORMString: string =  sTypeORMString + (sTypeORMString == '' ? '' : ', ') + sNull;
        // always include ID becuase it is used for UPDATES
        if ( (includeID && f.Name.toLowerCase() == 'id') || (!f.IsVirtual && f.AllowUpdateAPI && f.Type.trim().toLowerCase() !== 'uniqueidentifier') ) {
            sRet += `
    @Field(${sFullTypeORMString})
    ${f.Name}: ${TypeScriptTypeFromSQLType(f.Type)};
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
        const logChanges = !entity.TrackRecordChanges ? '' : `
                if (result && result.length > 0 && result[0].ID > 0)
                    await this.LogRecordChange(dataSource, input, null, '${entity.Name}', result[0].ID ) // part of same transaction so all good if we succeed
`
        // generate a create mutation
        sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Create${entity.BaseTableCodeName}(
        @Arg('input', () => Create${entity.BaseTableCodeName}Input) input: Create${entity.BaseTableCodeName}Input,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
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
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: Create${entity.BaseTableCodeName}Input) {
        const i = input, d = dataSource; // prevent error
    }
    `
    }
    if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
        // generate an edit mutation
        sRet += `
    @Mutation(() => ${serverGraphQLTypeName})
    async Update${entity.BaseTableCodeName}(
        @Arg('input', () => Update${entity.BaseTableCodeName}Input) input: Update${entity.BaseTableCodeName}Input,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
            ${entity.TrackRecordChanges ? 'await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save' : `entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for ${entity.Name}` }
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
sRet += `
    @Mutation(() => Int)
    async Delete${entity.BaseTableCodeName}(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = await new Metadata().GetEntityObject('${entity.Name}', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID)
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return ID;
            }
            else 
                return null; // delete failed
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
`        
    }
    return sRet;
}

function generateSPParams(entity: EntityInfo, isUpdate: boolean): string {
    let sRet: string = '',bFirst: boolean = true;
    for (let i = 0; i < entity.Fields.length; i++) {
        const f = entity.Fields[i];
        if (!f.IsVirtual) {
            switch (f.Name.toLowerCase()) {
                case 'id':
                    if (isUpdate) {
                        sRet += generateSingleSPParam(f, bFirst);
                        bFirst = false;
                    }
                    break;
                case 'createdat':
                case 'updatedat':
                    // do nothing
                    break;
                default:
                    if (f.Type.trim().toLowerCase() !== 'uniqueidentifier') {
                        // DO NOT INCLUDE UNIQUEIDENTIFIER FIELDS
                        // FOR CREATE/UPDATE, THEY ARE GENERATED BY THE DB
                        sRet += generateSingleSPParam(f, bFirst);
                        bFirst = false;
                    }
                    break;
            }    
        }
    }
    return sRet;
}

function generateSingleSPParam(f: EntityFieldInfo, isFirst: boolean): string {
    let sRet: string = '';
    let quotes: string = '';
    switch  ( TypeScriptTypeFromSQLType(f.Type).toLowerCase() ) {
        case 'string':
        case 'date':
            quotes = "'";
            break;
        default:
            break;
    }
    if (!isFirst) 
        sRet += ',\n                ';

    sRet += `@${f.Name}=\${this.packageSPParam(input.${f.Name},"${quotes}")}`

    return sRet;
}

function generateOneToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    // let keyFieldTS: string = 'number';
    // if (r.EntityKeyField) { 
    //     const keyField = entity.Fields.find(f => f.Name.toLowerCase() == r.EntityKeyField.toLowerCase())
    //     keyFieldTS = keyField ? TypeScriptTypeFromSQLType(keyField.Type)  : 'int';    
    // }
    const md = new Metadata();
    const re = md.Entities.find(e => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase());
    const instanceName = entity.BaseTableCodeName.toLowerCase() + _graphQLTypeSuffix

    return `  
    @FieldResolver(() => [${r.RelatedEntityBaseTableCodeName + _graphQLTypeSuffix}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + _graphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${re.SchemaName}].${r.RelatedEntityBaseView}\ WHERE ${r.RelatedEntityJoinField}=\${${instanceName}.${!r.EntityKeyField ? 'ID' : r.EntityKeyField}} \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        return dataSource.query(sSQL);
    }
    `    
}
function generateManyToManyFieldResolver(entity: EntityInfo, r: EntityRelationshipInfo): string {
    const md = new Metadata();
    const re = md.Entities.find(e => e.Name.toLowerCase() == r.RelatedEntity.toLowerCase());
    const instanceName = entity.BaseTableCodeName.toLowerCase() + _graphQLTypeSuffix

    return `
    @FieldResolver(() => [${r.RelatedEntityBaseTableCodeName  + _graphQLTypeSuffix}])
    async ${r.RelatedEntityCodeName}Array(@Root() ${instanceName}: ${entity.BaseTableCodeName + _graphQLTypeSuffix}, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('${r.RelatedEntity}', userPayload);
        const sSQL = \`SELECT * FROM [${re.SchemaName}].${r.RelatedEntityBaseView}\ WHERE ID IN (SELECT ${r.JoinEntityInverseJoinField} FROM ${r.JoinView} WHERE ${r.JoinEntityJoinField}=\${${instanceName}.${!r.EntityKeyField ? 'ID' : r.EntityKeyField}}) \` + this.getRowLevelSecurityWhereClause('${r.RelatedEntity}', userPayload, EntityPermissionType.Read, 'AND');
        return dataSource.query(sSQL);
    }
    `;
}