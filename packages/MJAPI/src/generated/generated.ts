/********************************************************************************
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
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { ActivitiesEntity, CompaniesEntity, CompanyTagsEntity, ContactTagsEntity, ContactsEntity, DealProductsEntity, DealTagsEntity, DealsEntity, PipelineStagesEntity, PipelinesEntity, ProductsEntity, TagsEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType({ description: `Interactions and tasks related to CRM entities such as calls, emails, meetings, notes, and tasks` })
export class samplecrmActivity_ {
    @Field({description: `Primary key for the activity record`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Activity type: Call, Email, Meeting, Note, or Task`}) 
    @MaxLength(40)
    Type: string;
        
    @Field({description: `Brief subject line for the activity`}) 
    @MaxLength(1000)
    Subject: string;
        
    @Field({nullable: true, description: `Detailed description or body of the activity`}) 
    Description?: string;
        
    @Field({description: `When the activity occurred or is scheduled`}) 
    @MaxLength(8)
    ActivityDate: Date;
        
    @Field(() => Int, {nullable: true, description: `Duration of the activity in minutes`}) 
    DurationMinutes?: number;
        
    @Field({nullable: true, description: `Optional link to a company`}) 
    @MaxLength(16)
    CompanyID?: string;
        
    @Field({nullable: true, description: `Optional link to a contact`}) 
    @MaxLength(16)
    ContactID?: string;
        
    @Field({nullable: true, description: `Optional link to a deal`}) 
    @MaxLength(16)
    DealID?: string;
        
    @Field({nullable: true, description: `Timestamp when the activity was completed, null if pending`}) 
    @MaxLength(8)
    CompletedAt?: Date;
        
    @Field({nullable: true, description: `User who created this activity record`}) 
    @MaxLength(16)
    CreatedByUserID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Company?: string;
        
    @Field({nullable: true}) 
    @MaxLength(400)
    Deal?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CreatedByUser?: string;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreatesamplecrmActivityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Type?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes: number | null;

    @Field({ nullable: true })
    CompanyID: string | null;

    @Field({ nullable: true })
    ContactID: string | null;

    @Field({ nullable: true })
    DealID: string | null;

    @Field({ nullable: true })
    CompletedAt: Date | null;

    @Field({ nullable: true })
    CreatedByUserID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdatesamplecrmActivityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Type?: string;

    @Field({ nullable: true })
    Subject?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number | null;

    @Field({ nullable: true })
    CompanyID?: string | null;

    @Field({ nullable: true })
    ContactID?: string | null;

    @Field({ nullable: true })
    DealID?: string | null;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field({ nullable: true })
    CreatedByUserID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunsamplecrmActivityViewResult {
    @Field(() => [samplecrmActivity_])
    Results: samplecrmActivity_[];

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

@Resolver(samplecrmActivity_)
export class samplecrmActivityResolver extends ResolverBase {
    @Query(() => RunsamplecrmActivityViewResult)
    async RunsamplecrmActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmActivityViewResult)
    async RunsamplecrmActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmActivityViewResult)
    async RunsamplecrmActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmActivity_, { nullable: true })
    async samplecrmActivity(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmActivity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwActivities] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmActivity_)
    async CreatesamplecrmActivity(
        @Arg('input', () => CreatesamplecrmActivityInput) input: CreatesamplecrmActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmActivity_)
    async UpdatesamplecrmActivity(
        @Arg('input', () => UpdatesamplecrmActivityInput) input: UpdatesamplecrmActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmActivity_)
    async DeletesamplecrmActivity(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Companies
//****************************************************************************
@ObjectType({ description: `Organizations that are customers, prospects, or partners` })
export class samplecrmCompany_ {
    @Field({description: `Primary key for the company record`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Legal or trading name of the company`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Industry vertical the company operates in`}) 
    @MaxLength(200)
    Industry?: string;
        
    @Field({nullable: true, description: `Company website URL`}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true, description: `Main phone number`}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field(() => Float, {nullable: true, description: `Estimated annual revenue in USD`}) 
    AnnualRevenue?: number;
        
    @Field(() => Int, {nullable: true, description: `Approximate number of employees`}) 
    EmployeeCount?: number;
        
    @Field({description: `Current relationship status: Active, Inactive, Prospect, or Churned`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Free-form notes about the company`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `User who created this company record`}) 
    @MaxLength(16)
    CreatedByUserID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CreatedByUser?: string;
        
    @Field(() => [samplecrmDeal_])
    false_CompanyIDArray: samplecrmDeal_[]; // Link to false
    
    @Field(() => [samplecrmContact_])
    false_CompanyIDArray: samplecrmContact_[]; // Link to false
    
    @Field(() => [samplecrmCompanyTag_])
    false_CompanyIDArray: samplecrmCompanyTag_[]; // Link to false
    
    @Field(() => [samplecrmActivity_])
    false_CompanyIDArray: samplecrmActivity_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Companies
//****************************************************************************
@InputType()
export class CreatesamplecrmCompanyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue: number | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    CreatedByUserID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Companies
//****************************************************************************
@InputType()
export class UpdatesamplecrmCompanyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue?: number | null;

    @Field(() => Int, { nullable: true })
    EmployeeCount?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    CreatedByUserID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Companies
//****************************************************************************
@ObjectType()
export class RunsamplecrmCompanyViewResult {
    @Field(() => [samplecrmCompany_])
    Results: samplecrmCompany_[];

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

@Resolver(samplecrmCompany_)
export class samplecrmCompanyResolver extends ResolverBase {
    @Query(() => RunsamplecrmCompanyViewResult)
    async RunsamplecrmCompanyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmCompanyViewResult)
    async RunsamplecrmCompanyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmCompanyViewResult)
    async RunsamplecrmCompanyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Companies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmCompany_, { nullable: true })
    async samplecrmCompany(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmCompany_ | null> {
        this.CheckUserReadPermissions('Companies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwCompanies] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Companies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Companies', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmDeal_])
    async false_CompanyIDArray(@Root() samplecrmcompany_: samplecrmCompany_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDeals] WHERE [CompanyID]='${samplecrmcompany_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmContact_])
    async false_CompanyIDArray(@Root() samplecrmcompany_: samplecrmCompany_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContacts] WHERE [CompanyID]='${samplecrmcompany_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmCompanyTag_])
    async false_CompanyIDArray(@Root() samplecrmcompany_: samplecrmCompany_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwCompanyTags] WHERE [CompanyID]='${samplecrmcompany_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmActivity_])
    async false_CompanyIDArray(@Root() samplecrmcompany_: samplecrmCompany_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwActivities] WHERE [CompanyID]='${samplecrmcompany_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmCompany_)
    async CreatesamplecrmCompany(
        @Arg('input', () => CreatesamplecrmCompanyInput) input: CreatesamplecrmCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Companies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmCompany_)
    async UpdatesamplecrmCompany(
        @Arg('input', () => UpdatesamplecrmCompanyInput) input: UpdatesamplecrmCompanyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Companies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmCompany_)
    async DeletesamplecrmCompany(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Companies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Tags
//****************************************************************************
@ObjectType({ description: `Junction table linking tags to companies` })
export class samplecrmCompanyTag_ {
    @Field({description: `Primary key`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `The company being tagged`}) 
    @MaxLength(16)
    CompanyID: string;
        
    @Field({description: `The tag applied to the company`}) 
    @MaxLength(16)
    TagID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Company: string;
        
    @Field() 
    @MaxLength(200)
    Tag: string;
        
}

//****************************************************************************
// INPUT TYPE for Company Tags
//****************************************************************************
@InputType()
export class CreatesamplecrmCompanyTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    TagID?: string;
}
    

//****************************************************************************
// INPUT TYPE for Company Tags
//****************************************************************************
@InputType()
export class UpdatesamplecrmCompanyTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    TagID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Company Tags
//****************************************************************************
@ObjectType()
export class RunsamplecrmCompanyTagViewResult {
    @Field(() => [samplecrmCompanyTag_])
    Results: samplecrmCompanyTag_[];

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

@Resolver(samplecrmCompanyTag_)
export class samplecrmCompanyTagResolver extends ResolverBase {
    @Query(() => RunsamplecrmCompanyTagViewResult)
    async RunsamplecrmCompanyTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmCompanyTagViewResult)
    async RunsamplecrmCompanyTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmCompanyTagViewResult)
    async RunsamplecrmCompanyTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Company Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmCompanyTag_, { nullable: true })
    async samplecrmCompanyTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmCompanyTag_ | null> {
        this.CheckUserReadPermissions('Company Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwCompanyTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Company Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmCompanyTag_)
    async CreatesamplecrmCompanyTag(
        @Arg('input', () => CreatesamplecrmCompanyTagInput) input: CreatesamplecrmCompanyTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Company Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmCompanyTag_)
    async UpdatesamplecrmCompanyTag(
        @Arg('input', () => UpdatesamplecrmCompanyTagInput) input: UpdatesamplecrmCompanyTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Company Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmCompanyTag_)
    async DeletesamplecrmCompanyTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Company Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tags
//****************************************************************************
@ObjectType({ description: `Junction table linking tags to contacts` })
export class samplecrmContactTag_ {
    @Field({description: `Primary key`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `The contact being tagged`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({description: `The tag applied to the contact`}) 
    @MaxLength(16)
    TagID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Tag: string;
        
}

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class CreatesamplecrmContactTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    TagID?: string;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class UpdatesamplecrmContactTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    TagID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contact Tags
//****************************************************************************
@ObjectType()
export class RunsamplecrmContactTagViewResult {
    @Field(() => [samplecrmContactTag_])
    Results: samplecrmContactTag_[];

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

@Resolver(samplecrmContactTag_)
export class samplecrmContactTagResolver extends ResolverBase {
    @Query(() => RunsamplecrmContactTagViewResult)
    async RunsamplecrmContactTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmContactTagViewResult)
    async RunsamplecrmContactTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmContactTagViewResult)
    async RunsamplecrmContactTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmContactTag_, { nullable: true })
    async samplecrmContactTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmContactTag_ | null> {
        this.CheckUserReadPermissions('Contact Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContactTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmContactTag_)
    async CreatesamplecrmContactTag(
        @Arg('input', () => CreatesamplecrmContactTagInput) input: CreatesamplecrmContactTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmContactTag_)
    async UpdatesamplecrmContactTag(
        @Arg('input', () => UpdatesamplecrmContactTagInput) input: UpdatesamplecrmContactTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmContactTag_)
    async DeletesamplecrmContactTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contact Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `Individual people associated with companies` })
export class samplecrmContact_ {
    @Field({description: `Primary key for the contact record`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Company this contact belongs to`}) 
    @MaxLength(16)
    CompanyID: string;
        
    @Field({description: `Contact first name`}) 
    @MaxLength(200)
    FirstName: string;
        
    @Field({description: `Contact last name`}) 
    @MaxLength(200)
    LastName: string;
        
    @Field({nullable: true, description: `Email address`}) 
    @MaxLength(400)
    Email?: string;
        
    @Field({nullable: true, description: `Direct phone number`}) 
    @MaxLength(100)
    Phone?: string;
        
    @Field({nullable: true, description: `Job title`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Department within the company`}) 
    @MaxLength(200)
    Department?: string;
        
    @Field({nullable: true, description: `Self-referential FK to the contact this person reports to`}) 
    @MaxLength(16)
    ReportsToContactID?: string;
        
    @Field(() => Boolean, {description: `Whether this is the primary contact for the company`}) 
    IsPrimary: boolean;
        
    @Field({description: `Current status: Active, Inactive, Prospect, or Churned`}) 
    @MaxLength(40)
    Status: string;
        
    @Field({nullable: true, description: `Free-form notes about the contact`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `User who created this contact record`}) 
    @MaxLength(16)
    CreatedByUserID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CreatedByUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(16)
    RootReportsToContactID?: string;
        
    @Field(() => [samplecrmContactTag_])
    false_ContactIDArray: samplecrmContactTag_[]; // Link to false
    
    @Field(() => [samplecrmContact_])
    false_ReportsToContactIDArray: samplecrmContact_[]; // Link to false
    
    @Field(() => [samplecrmDeal_])
    false_ContactIDArray: samplecrmDeal_[]; // Link to false
    
    @Field(() => [samplecrmActivity_])
    false_ContactIDArray: samplecrmActivity_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreatesamplecrmContactInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Department: string | null;

    @Field({ nullable: true })
    ReportsToContactID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    CreatedByUserID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdatesamplecrmContactInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Department?: string | null;

    @Field({ nullable: true })
    ReportsToContactID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    CreatedByUserID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunsamplecrmContactViewResult {
    @Field(() => [samplecrmContact_])
    Results: samplecrmContact_[];

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

@Resolver(samplecrmContact_)
export class samplecrmContactResolver extends ResolverBase {
    @Query(() => RunsamplecrmContactViewResult)
    async RunsamplecrmContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmContactViewResult)
    async RunsamplecrmContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmContactViewResult)
    async RunsamplecrmContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmContact_, { nullable: true })
    async samplecrmContact(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmContact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContacts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmContactTag_])
    async false_ContactIDArray(@Root() samplecrmcontact_: samplecrmContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContactTags] WHERE [ContactID]='${samplecrmcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmContact_])
    async false_ReportsToContactIDArray(@Root() samplecrmcontact_: samplecrmContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContacts] WHERE [ReportsToContactID]='${samplecrmcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmDeal_])
    async false_ContactIDArray(@Root() samplecrmcontact_: samplecrmContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDeals] WHERE [ContactID]='${samplecrmcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deals', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmActivity_])
    async false_ContactIDArray(@Root() samplecrmcontact_: samplecrmContact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwActivities] WHERE [ContactID]='${samplecrmcontact_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmContact_)
    async CreatesamplecrmContact(
        @Arg('input', () => CreatesamplecrmContactInput) input: CreatesamplecrmContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmContact_)
    async UpdatesamplecrmContact(
        @Arg('input', () => UpdatesamplecrmContactInput) input: UpdatesamplecrmContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmContact_)
    async DeletesamplecrmContact(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Products
//****************************************************************************
@ObjectType({ description: `Junction table linking products to deals with pricing and quantity details` })
export class samplecrmDealProduct_ {
    @Field({description: `Primary key for the deal-product link`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Deal this product is part of`}) 
    @MaxLength(16)
    DealID: string;
        
    @Field({description: `Product being sold in this deal`}) 
    @MaxLength(16)
    ProductID: string;
        
    @Field(() => Int, {description: `Number of units included in the deal`}) 
    Quantity: number;
        
    @Field(() => Float, {description: `Price per unit for this deal, may differ from catalog price`}) 
    UnitPrice: number;
        
    @Field(() => Float, {description: `Discount percentage from 0 to 100`}) 
    Discount: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Deal: string;
        
    @Field() 
    @MaxLength(400)
    Product: string;
        
}

//****************************************************************************
// INPUT TYPE for Deal Products
//****************************************************************************
@InputType()
export class CreatesamplecrmDealProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DealID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number;
}
    

//****************************************************************************
// INPUT TYPE for Deal Products
//****************************************************************************
@InputType()
export class UpdatesamplecrmDealProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DealID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field(() => Int, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Float, { nullable: true })
    Discount?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Products
//****************************************************************************
@ObjectType()
export class RunsamplecrmDealProductViewResult {
    @Field(() => [samplecrmDealProduct_])
    Results: samplecrmDealProduct_[];

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

@Resolver(samplecrmDealProduct_)
export class samplecrmDealProductResolver extends ResolverBase {
    @Query(() => RunsamplecrmDealProductViewResult)
    async RunsamplecrmDealProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealProductViewResult)
    async RunsamplecrmDealProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealProductViewResult)
    async RunsamplecrmDealProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmDealProduct_, { nullable: true })
    async samplecrmDealProduct(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmDealProduct_ | null> {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealProducts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Products', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmDealProduct_)
    async CreatesamplecrmDealProduct(
        @Arg('input', () => CreatesamplecrmDealProductInput) input: CreatesamplecrmDealProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmDealProduct_)
    async UpdatesamplecrmDealProduct(
        @Arg('input', () => UpdatesamplecrmDealProductInput) input: UpdatesamplecrmDealProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmDealProduct_)
    async DeletesamplecrmDealProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Deal Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deal Tags
//****************************************************************************
@ObjectType({ description: `Junction table linking tags to deals` })
export class samplecrmDealTag_ {
    @Field({description: `Primary key`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `The deal being tagged`}) 
    @MaxLength(16)
    DealID: string;
        
    @Field({description: `The tag applied to the deal`}) 
    @MaxLength(16)
    TagID: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Deal: string;
        
    @Field() 
    @MaxLength(200)
    Tag: string;
        
}

//****************************************************************************
// INPUT TYPE for Deal Tags
//****************************************************************************
@InputType()
export class CreatesamplecrmDealTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DealID?: string;

    @Field({ nullable: true })
    TagID?: string;
}
    

//****************************************************************************
// INPUT TYPE for Deal Tags
//****************************************************************************
@InputType()
export class UpdatesamplecrmDealTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DealID?: string;

    @Field({ nullable: true })
    TagID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deal Tags
//****************************************************************************
@ObjectType()
export class RunsamplecrmDealTagViewResult {
    @Field(() => [samplecrmDealTag_])
    Results: samplecrmDealTag_[];

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

@Resolver(samplecrmDealTag_)
export class samplecrmDealTagResolver extends ResolverBase {
    @Query(() => RunsamplecrmDealTagViewResult)
    async RunsamplecrmDealTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealTagViewResult)
    async RunsamplecrmDealTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealTagViewResult)
    async RunsamplecrmDealTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deal Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmDealTag_, { nullable: true })
    async samplecrmDealTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmDealTag_ | null> {
        this.CheckUserReadPermissions('Deal Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deal Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmDealTag_)
    async CreatesamplecrmDealTag(
        @Arg('input', () => CreatesamplecrmDealTagInput) input: CreatesamplecrmDealTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deal Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmDealTag_)
    async UpdatesamplecrmDealTag(
        @Arg('input', () => UpdatesamplecrmDealTagInput) input: UpdatesamplecrmDealTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deal Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmDealTag_)
    async DeletesamplecrmDealTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Deal Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Deals
//****************************************************************************
@ObjectType({ description: `Sales opportunities being pursued with companies` })
export class samplecrmDeal_ {
    @Field({description: `Primary key for the deal record`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Company this deal is associated with`}) 
    @MaxLength(16)
    CompanyID: string;
        
    @Field({description: `Primary contact for this deal`}) 
    @MaxLength(16)
    ContactID: string;
        
    @Field({description: `Short name or title of the deal`}) 
    @MaxLength(400)
    Name: string;
        
    @Field(() => Float, {nullable: true, description: `Total deal value in USD`}) 
    Amount?: number;
        
    @Field({description: `Current sales stage: Lead, Qualified, Proposal, Negotiation, Closed Won, or Closed Lost`}) 
    @MaxLength(100)
    Stage: string;
        
    @Field(() => Int, {nullable: true, description: `Win probability percentage from 0 to 100`}) 
    Probability?: number;
        
    @Field({nullable: true, description: `Projected close date`}) 
    @MaxLength(8)
    ExpectedCloseDate?: Date;
        
    @Field({nullable: true, description: `Date the deal was actually closed, null if still open`}) 
    @MaxLength(8)
    ActualCloseDate?: Date;
        
    @Field({nullable: true, description: `Sales rep assigned to this deal`}) 
    @MaxLength(16)
    AssignedToUserID?: string;
        
    @Field({nullable: true, description: `Free-form notes about the deal`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `User who created this deal record`}) 
    @MaxLength(16)
    CreatedByUserID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    AssignedToUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    CreatedByUser?: string;
        
    @Field(() => [samplecrmActivity_])
    false_DealIDArray: samplecrmActivity_[]; // Link to false
    
    @Field(() => [samplecrmDealTag_])
    false_DealIDArray: samplecrmDealTag_[]; // Link to false
    
    @Field(() => [samplecrmDealProduct_])
    false_DealIDArray: samplecrmDealProduct_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class CreatesamplecrmDealInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Float, { nullable: true })
    Amount: number | null;

    @Field({ nullable: true })
    Stage?: string;

    @Field(() => Int, { nullable: true })
    Probability: number | null;

    @Field({ nullable: true })
    ExpectedCloseDate: Date | null;

    @Field({ nullable: true })
    ActualCloseDate: Date | null;

    @Field({ nullable: true })
    AssignedToUserID: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    CreatedByUserID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Deals
//****************************************************************************
@InputType()
export class UpdatesamplecrmDealInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number | null;

    @Field({ nullable: true })
    Stage?: string;

    @Field(() => Int, { nullable: true })
    Probability?: number | null;

    @Field({ nullable: true })
    ExpectedCloseDate?: Date | null;

    @Field({ nullable: true })
    ActualCloseDate?: Date | null;

    @Field({ nullable: true })
    AssignedToUserID?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    CreatedByUserID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Deals
//****************************************************************************
@ObjectType()
export class RunsamplecrmDealViewResult {
    @Field(() => [samplecrmDeal_])
    Results: samplecrmDeal_[];

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

@Resolver(samplecrmDeal_)
export class samplecrmDealResolver extends ResolverBase {
    @Query(() => RunsamplecrmDealViewResult)
    async RunsamplecrmDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealViewResult)
    async RunsamplecrmDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmDealViewResult)
    async RunsamplecrmDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Deals';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmDeal_, { nullable: true })
    async samplecrmDeal(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmDeal_ | null> {
        this.CheckUserReadPermissions('Deals', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDeals] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deals', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Deals', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmActivity_])
    async false_DealIDArray(@Root() samplecrmdeal_: samplecrmDeal_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwActivities] WHERE [DealID]='${samplecrmdeal_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmDealTag_])
    async false_DealIDArray(@Root() samplecrmdeal_: samplecrmDeal_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealTags] WHERE [DealID]='${samplecrmdeal_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmDealProduct_])
    async false_DealIDArray(@Root() samplecrmdeal_: samplecrmDeal_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealProducts] WHERE [DealID]='${samplecrmdeal_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmDeal_)
    async CreatesamplecrmDeal(
        @Arg('input', () => CreatesamplecrmDealInput) input: CreatesamplecrmDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Deals', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmDeal_)
    async UpdatesamplecrmDeal(
        @Arg('input', () => UpdatesamplecrmDealInput) input: UpdatesamplecrmDealInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Deals', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmDeal_)
    async DeletesamplecrmDeal(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Deals', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Pipeline Stages
//****************************************************************************
@ObjectType({ description: `Ordered stages within a sales pipeline` })
export class samplecrmPipelineStage_ {
    @Field({description: `Primary key for the pipeline stage`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Pipeline this stage belongs to`}) 
    @MaxLength(16)
    PipelineID: string;
        
    @Field({description: `Stage display name`}) 
    @MaxLength(200)
    Name: string;
        
    @Field(() => Int, {description: `Ordering position within the pipeline, lower numbers appear first`}) 
    DisplayOrder: number;
        
    @Field(() => Int, {description: `Default win probability percentage for deals entering this stage`}) 
    Probability: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(400)
    Pipeline: string;
        
}

//****************************************************************************
// INPUT TYPE for Pipeline Stages
//****************************************************************************
@InputType()
export class CreatesamplecrmPipelineStageInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PipelineID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field(() => Int, { nullable: true })
    Probability?: number;
}
    

//****************************************************************************
// INPUT TYPE for Pipeline Stages
//****************************************************************************
@InputType()
export class UpdatesamplecrmPipelineStageInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PipelineID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field(() => Int, { nullable: true })
    Probability?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Pipeline Stages
//****************************************************************************
@ObjectType()
export class RunsamplecrmPipelineStageViewResult {
    @Field(() => [samplecrmPipelineStage_])
    Results: samplecrmPipelineStage_[];

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

@Resolver(samplecrmPipelineStage_)
export class samplecrmPipelineStageResolver extends ResolverBase {
    @Query(() => RunsamplecrmPipelineStageViewResult)
    async RunsamplecrmPipelineStageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmPipelineStageViewResult)
    async RunsamplecrmPipelineStageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmPipelineStageViewResult)
    async RunsamplecrmPipelineStageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Pipeline Stages';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmPipelineStage_, { nullable: true })
    async samplecrmPipelineStage(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmPipelineStage_ | null> {
        this.CheckUserReadPermissions('Pipeline Stages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwPipelineStages] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Pipeline Stages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Pipeline Stages', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => samplecrmPipelineStage_)
    async CreatesamplecrmPipelineStage(
        @Arg('input', () => CreatesamplecrmPipelineStageInput) input: CreatesamplecrmPipelineStageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Pipeline Stages', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmPipelineStage_)
    async UpdatesamplecrmPipelineStage(
        @Arg('input', () => UpdatesamplecrmPipelineStageInput) input: UpdatesamplecrmPipelineStageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Pipeline Stages', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmPipelineStage_)
    async DeletesamplecrmPipelineStage(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Pipeline Stages', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Pipelines
//****************************************************************************
@ObjectType({ description: `Sales pipelines defining the stages deals progress through` })
export class samplecrmPipeline_ {
    @Field({description: `Primary key for the pipeline`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the pipeline`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Description of the pipeline purpose and usage`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this is the default pipeline for new deals`}) 
    IsDefault: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplecrmPipelineStage_])
    false_PipelineIDArray: samplecrmPipelineStage_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Pipelines
//****************************************************************************
@InputType()
export class CreatesamplecrmPipelineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;
}
    

//****************************************************************************
// INPUT TYPE for Pipelines
//****************************************************************************
@InputType()
export class UpdatesamplecrmPipelineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Pipelines
//****************************************************************************
@ObjectType()
export class RunsamplecrmPipelineViewResult {
    @Field(() => [samplecrmPipeline_])
    Results: samplecrmPipeline_[];

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

@Resolver(samplecrmPipeline_)
export class samplecrmPipelineResolver extends ResolverBase {
    @Query(() => RunsamplecrmPipelineViewResult)
    async RunsamplecrmPipelineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmPipelineViewResult)
    async RunsamplecrmPipelineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmPipelineViewResult)
    async RunsamplecrmPipelineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Pipelines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmPipeline_, { nullable: true })
    async samplecrmPipeline(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmPipeline_ | null> {
        this.CheckUserReadPermissions('Pipelines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwPipelines] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Pipelines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Pipelines', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmPipelineStage_])
    async false_PipelineIDArray(@Root() samplecrmpipeline_: samplecrmPipeline_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Pipeline Stages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwPipelineStages] WHERE [PipelineID]='${samplecrmpipeline_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Pipeline Stages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Pipeline Stages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmPipeline_)
    async CreatesamplecrmPipeline(
        @Arg('input', () => CreatesamplecrmPipelineInput) input: CreatesamplecrmPipelineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Pipelines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmPipeline_)
    async UpdatesamplecrmPipeline(
        @Arg('input', () => UpdatesamplecrmPipelineInput) input: UpdatesamplecrmPipelineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Pipelines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmPipeline_)
    async DeletesamplecrmPipeline(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Pipelines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType({ description: `Products and services available for sale in deals` })
export class samplecrmProduct_ {
    @Field({description: `Primary key for the product record`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Product display name`}) 
    @MaxLength(400)
    Name: string;
        
    @Field({nullable: true, description: `Stock keeping unit, unique product identifier`}) 
    @MaxLength(100)
    SKU?: string;
        
    @Field({nullable: true, description: `Detailed product description`}) 
    Description?: string;
        
    @Field(() => Float, {description: `Standard unit price in USD`}) 
    UnitPrice: number;
        
    @Field(() => Boolean, {description: `Whether the product is currently available for sale`}) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `Product category for grouping and filtering`}) 
    @MaxLength(200)
    Category?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplecrmDealProduct_])
    false_ProductIDArray: samplecrmDealProduct_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreatesamplecrmProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SKU: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Category: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdatesamplecrmProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SKU?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    Category?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunsamplecrmProductViewResult {
    @Field(() => [samplecrmProduct_])
    Results: samplecrmProduct_[];

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

@Resolver(samplecrmProduct_)
export class samplecrmProductResolver extends ResolverBase {
    @Query(() => RunsamplecrmProductViewResult)
    async RunsamplecrmProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmProductViewResult)
    async RunsamplecrmProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmProductViewResult)
    async RunsamplecrmProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmProduct_, { nullable: true })
    async samplecrmProduct(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmProduct_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwProducts] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmDealProduct_])
    async false_ProductIDArray(@Root() samplecrmproduct_: samplecrmProduct_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealProducts] WHERE [ProductID]='${samplecrmproduct_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmProduct_)
    async CreatesamplecrmProduct(
        @Arg('input', () => CreatesamplecrmProductInput) input: CreatesamplecrmProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmProduct_)
    async UpdatesamplecrmProduct(
        @Arg('input', () => UpdatesamplecrmProductInput) input: UpdatesamplecrmProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmProduct_)
    async DeletesamplecrmProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Tags
//****************************************************************************
@ObjectType({ description: `Labels for categorizing and filtering CRM records` })
export class samplecrmTag_ {
    @Field({description: `Primary key for the tag`}) 
    @MaxLength(16)
    ID: string;
        
    @Field({description: `Display name of the tag, must be unique`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Hex color code for visual display, e.g. #FF5733`}) 
    @MaxLength(14)
    Color?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [samplecrmCompanyTag_])
    false_TagIDArray: samplecrmCompanyTag_[]; // Link to false
    
    @Field(() => [samplecrmContactTag_])
    false_TagIDArray: samplecrmContactTag_[]; // Link to false
    
    @Field(() => [samplecrmDealTag_])
    false_TagIDArray: samplecrmDealTag_[]; // Link to false
    
}

//****************************************************************************
// INPUT TYPE for Tags
//****************************************************************************
@InputType()
export class CreatesamplecrmTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Color: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Tags
//****************************************************************************
@InputType()
export class UpdatesamplecrmTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Color?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Tags
//****************************************************************************
@ObjectType()
export class RunsamplecrmTagViewResult {
    @Field(() => [samplecrmTag_])
    Results: samplecrmTag_[];

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

@Resolver(samplecrmTag_)
export class samplecrmTagResolver extends ResolverBase {
    @Query(() => RunsamplecrmTagViewResult)
    async RunsamplecrmTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmTagViewResult)
    async RunsamplecrmTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunsamplecrmTagViewResult)
    async RunsamplecrmTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => samplecrmTag_, { nullable: true })
    async samplecrmTag(@Arg('ID', () => String) ID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<samplecrmTag_ | null> {
        this.CheckUserReadPermissions('Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwTags] WHERE [ID]='${ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Tags', rows && rows.length > 0 ? rows[0] : {}, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [samplecrmCompanyTag_])
    async false_TagIDArray(@Root() samplecrmtag_: samplecrmTag_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwCompanyTags] WHERE [TagID]='${samplecrmtag_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Company Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Company Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmContactTag_])
    async false_TagIDArray(@Root() samplecrmtag_: samplecrmTag_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwContactTags] WHERE [TagID]='${samplecrmtag_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [samplecrmDealTag_])
    async false_TagIDArray(@Root() samplecrmtag_: samplecrmTag_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deal Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [sample_crm].[vwDealTags] WHERE [TagID]='${samplecrmtag_.ID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Deal Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Deal Tags', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => samplecrmTag_)
    async CreatesamplecrmTag(
        @Arg('input', () => CreatesamplecrmTagInput) input: CreatesamplecrmTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => samplecrmTag_)
    async UpdatesamplecrmTag(
        @Arg('input', () => UpdatesamplecrmTagInput) input: UpdatesamplecrmTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => samplecrmTag_)
    async DeletesamplecrmTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Tags', key, options, provider, userPayload, pubSub);
    }
    
}